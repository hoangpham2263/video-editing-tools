"""Tạo nhạc nền cute gốc (không bản quyền) cho video review.

Dùng: python3 scripts/extras/make_music.py <giây> <file .wav xuất> [bpm]
Hợp âm C - G - Am - F, gảy kiểu ukulele + chuông + trống nhẹ.
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 26
out = sys.argv[2] if len(sys.argv) > 2 else "music.wav"
bpm = float(sys.argv[3]) if len(sys.argv) > 3 else 112
beat = 60 / bpm
bar = beat * 4
rng = np.random.default_rng(7)

n = int((dur + 2) * SR)
L = np.zeros(n)
R = np.zeros(n)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def pluck(freq, length=0.9, bright=0.5):
    """Karplus-Strong: tiếng gảy dây kiểu ukulele."""
    N = int(SR / freq)
    buf = rng.uniform(-1, 1, N)
    buf = lfilter([bright, 1 - bright], [1], buf)
    total = int(length * SR)
    out_ = np.zeros(total)
    for i in range(total):
        out_[i] = buf[i % N]
        buf[i % N] = 0.996 * 0.5 * (buf[i % N] + buf[(i + 1) % N])
    env = np.minimum(1, np.arange(total) / (0.004 * SR))
    return out_ * env


def bell(freq, length=1.2):
    t = np.arange(int(length * SR)) / SR
    s = (np.sin(2 * np.pi * freq * t) * np.exp(-3.2 * t)
         + 0.35 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-6 * t)
         + 0.15 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-9 * t))
    return s * np.minimum(1, t / 0.003)


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 50 + 90 * np.exp(-28 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9 * t)


def noise_hit(length, decay, lo, hi):
    t = np.arange(int(length * SR)) / SR
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], btype="band")
    return lfilter(b, a, rng.uniform(-1, 1, len(t))) * np.exp(-decay * t)


def bass(freq, length):
    t = np.arange(int(length * SR)) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t)
    return s * np.exp(-2.5 * t) * np.minimum(1, t / 0.01)


# Hợp âm (MIDI) – C, G, Am, F
chords = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]]
roots = [36, 31, 33, 29]
# Giai điệu chuông (ngũ cung C), mỗi ô = 1 nốt móc đơn, None = nghỉ
melody = [
    [76, None, 79, None, 81, 79, 76, None],
    [74, None, 79, None, 74, 72, 74, None],
    [72, None, 76, 79, 81, None, 79, 76],
    [77, None, 76, None, 74, 72, None, None],
]
arp = [0, 2, 1, 3, 2, 1, 3, 2]

kk, sn, ht = kick(), noise_hit(0.18, 22, 900, 5000), noise_hit(0.05, 70, 6000, 14000)
bars = int(np.ceil(dur / bar)) + 1
for b in range(bars):
    t0 = b * bar
    c = b % 4
    for k in range(8):  # gảy rải 8 nốt móc đơn
        note = chords[c][arp[k]]
        p = pluck(hz(note), 0.8, 0.55)
        add(L, t0 + k * beat / 2, p, 0.22)
        add(R, t0 + k * beat / 2 + 0.012, p, 0.18)
    add(L, t0, bass(hz(roots[c]), bar * 0.5), 0.32)
    add(R, t0, bass(hz(roots[c]), bar * 0.5), 0.32)
    add(L, t0 + 2 * beat, bass(hz(roots[c]), bar * 0.5), 0.26)
    add(R, t0 + 2 * beat, bass(hz(roots[c]), bar * 0.5), 0.26)
    if b >= 1:  # giai điệu vào từ ô nhịp 2
        for k, m in enumerate(melody[c]):
            if m is None:
                continue
            s = bell(hz(m))
            add(L, t0 + k * beat / 2, s, 0.16)
            add(R, t0 + k * beat / 2, s, 0.16)
            add(R, t0 + k * beat / 2 + beat * 0.75, s, 0.05)  # vang nhẹ
    for k in range(4):
        add(L, t0 + k * beat, kk, 0.45 if k in (0, 2) else 0)
        add(R, t0 + k * beat, kk, 0.45 if k in (0, 2) else 0)
        if k in (1, 3):
            add(L, t0 + k * beat, sn, 0.12)
            add(R, t0 + k * beat, sn, 0.12)
    for k in range(8):
        g = 0.05 if k % 2 else 0.03
        add(L, t0 + k * beat / 2, ht, g)
        add(R, t0 + k * beat / 2 + 0.004, ht, g)

total = int(dur * SR)
mix = np.stack([L[:total], R[:total]], axis=1)
fade = int(1.2 * SR)
mix[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = np.tanh(mix * 1.2)  # nén nhẹ
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f"Xong: {out} ({dur:.1f}s, {bpm:.0f} bpm)")
