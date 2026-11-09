"""Nhạc nền kiểu trend CapCut/TikTok (remix sped-up, EDM-pop) – tự tạo, không bản quyền.

Dùng: python3 scripts/extras/make_music_trend.py <giây> <file .wav> [bpm] [seed]
Hợp âm Am - F - C - G, trống đều mỗi phách, bass nhún, synth dày, giai điệu cao.
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 26
out = sys.argv[2] if len(sys.argv) > 2 else "trend.wav"
bpm = float(sys.argv[3]) if len(sys.argv) > 3 else 144
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 3
rng = np.random.default_rng(seed)
beat = 60 / bpm
bar = 4 * beat
n = int((dur + 2) * SR)
L, R = np.zeros(n), np.zeros(n)
duck = np.ones(n)  # sidechain: nhạc "nhún" theo trống


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    b, a = butter(order, min(fc, SR / 2 - 100) / (SR / 2))
    return lfilter(b, a, x)


def hp(x, fc):
    b, a = butter(2, fc / (SR / 2), btype="high")
    return lfilter(b, a, x)


def add(buf, start, sig, g=1.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * g


def saw(freq, length, detune=(0.0,)):
    t = np.arange(int(length * SR)) / SR
    s = sum(2 * ((t * freq * (1 + d) + rng.random()) % 1) - 1 for d in detune)
    return s / len(detune)


def env(length, a=0.005, d=0.2, s=0.6, r=0.05):
    N = int(length * SR)
    e = np.full(N, s)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na)
    e[na:na + nd] = np.linspace(1, s, len(e[na:na + nd]))
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def kick():
    t = np.arange(int(0.3 * SR)) / SR
    f = 48 + 110 * np.exp(-35 * t)
    k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-10 * t)
    click = hp(rng.uniform(-1, 1, len(t)), 3000) * np.exp(-200 * t) * 0.3
    return np.tanh(2 * (k + click))


def clap():
    t = np.arange(int(0.25 * SR)) / SR
    x = rng.uniform(-1, 1, len(t))
    b, a = butter(2, [1000 / (SR / 2), 6000 / (SR / 2)], btype="band")
    x = lfilter(b, a, x)
    e = np.exp(-18 * t)
    for off in (0.008, 0.016):  # 3 lớp vỗ tay lệch nhau
        e += np.roll(np.exp(-60 * t), int(off * SR)) * 0.6
    return x * e


def hat(open_=False):
    t = np.arange(int((0.18 if open_ else 0.05) * SR)) / SR
    return hp(rng.uniform(-1, 1, len(t)), 7000) * np.exp(-(12 if open_ else 80) * t)


# Am F C G
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
roots = [33, 29, 36, 31]
# giai điệu 16 nốt móc kép mỗi ô nhịp (None = nghỉ), kiểu "chop" bắt tai
mel = [
    [76, None, 76, 79, None, 76, None, 74, 76, None, 72, None, 74, None, 76, None],
    [77, None, 77, 76, None, 74, None, 72, 74, None, 72, None, 69, None, 72, None],
    [79, None, 79, 76, None, 79, None, 81, 79, None, 76, None, 74, None, 72, None],
    [74, None, 74, 76, None, 79, None, 76, 74, None, 71, None, 74, None, 79, 81],
]

K, C, H, HO = kick(), clap(), hat(), hat(True)
bars = int(np.ceil(dur / bar)) + 1
intro_bars = 2  # 2 ô đầu nhẹ, sau đó vào "drop"
for b in range(bars):
    t0 = b * bar
    c = b % 4
    drop = b >= intro_bars
    # trống
    for k in range(4):
        if drop or k in (0, 2):
            add(L, t0 + k * beat, K, 0.5)
            add(R, t0 + k * beat, K, 0.5)
            i = int((t0 + k * beat) * SR)
            dl = int(0.22 * SR)
            if i < n:
                seg = 1 - 0.65 * np.exp(-np.arange(min(dl, n - i)) / (0.06 * SR))
                duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], seg)
        if k in (1, 3):
            add(L, t0 + k * beat, C, 0.35)
            add(R, t0 + k * beat + 0.006, C, 0.35)
        add(L, t0 + k * beat + beat / 2, HO if drop else H, 0.12)
        add(R, t0 + k * beat + beat / 2 + 0.003, HO if drop else H, 0.12)
    for k in range(16):
        if drop:
            add(R if k % 2 else L, t0 + k * beat / 4, H, 0.05)
    # bass nhún: nốt ở nửa sau mỗi phách
    for k in range(4):
        f = hz(roots[c])
        s = lp(saw(f, beat * 0.45, (0, 0.004)), 600) * env(beat * 0.45, 0.003, 0.15, 0.7, 0.03)
        s += 0.6 * np.sin(2 * np.pi * f * np.arange(len(s)) / SR) * env(beat * 0.45, 0.003, 0.15, 0.7, 0.03)
        add(L, t0 + k * beat + beat / 2, s, 0.2)
        add(R, t0 + k * beat + beat / 2, s, 0.2)
    # pad synth dày (supersaw)
    pad = np.zeros(int(bar * SR))
    for m in chords[c]:
        for o in (0, 12):
            pad += saw(hz(m + o), bar, (-0.012, -0.005, 0, 0.006, 0.013))
    pad = lp(pad, 2600 if drop else 900) * env(bar, 0.02, 0.3, 0.8, 0.08) / 6
    add(L, t0, pad, 0.22)
    add(R, t0 + 0.011, pad, 0.22)
    # giai điệu chop (chỉ ở drop)
    if drop:
        for k, m in enumerate(mel[c]):
            if m is None:
                continue
            ln = beat / 4 * 0.9
            s = lp(saw(hz(m + 12), ln, (-0.006, 0.006)), 5000) * env(ln, 0.002, 0.08, 0.5, 0.02)
            t = np.arange(len(s)) / SR
            s += 0.5 * np.sin(2 * np.pi * hz(m + 12) * t) * np.exp(-12 * t)
            add(L, t0 + k * beat / 4, s, 0.26)
            add(R, t0 + k * beat / 4, s, 0.26)
            add(R, t0 + k * beat / 4 + beat * 0.75, s, 0.06)  # vang

total = int(dur * SR)
# áp sidechain cho mọi thứ trừ trống: làm đơn giản bằng cách nhún cả mix rồi cộng lại trống
mix = np.stack([L[:total], R[:total]], 1) * duck[:total, None] ** 0.6
mix[: int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]
fade = int(1.0 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = np.tanh(mix * 1.1)
mix /= np.abs(mix).max() / 0.89
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f"Xong: {out} ({dur:.1f}s, {bpm:.0f} bpm)")
