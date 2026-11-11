// Hàm nhỏ dùng chung cho analyze/build/check (không phụ thuộc lib.mjs của vỏ app).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const projectDir = (id) => {
  if (!id || !/^[\w.-]+$/.test(id)) fail('Thiếu hoặc sai <id> dự án');
  return path.join(ROOT, 'workspace', 'projects', id);
};
export const readJson = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def);
export const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), {recursive: true});
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
};
export const out = (v) => process.stdout.write(JSON.stringify({ok: true, ...v}, null, 2) + '\n');
export function fail(msg) {
  process.stdout.write(JSON.stringify({ok: false, error: msg}) + '\n');
  process.exit(1);
}

/** Thư mục mẫu samples/<sid>; không có sid mà chỉ có đúng 1 mẫu thì dùng mẫu đó. */
export function sampleDir(id, sid) {
  const S = path.join(projectDir(id), 'samples');
  if (sid) {
    if (!/^[\w.-]+$/.test(sid)) fail('Sai <sid> mẫu');
    const d = path.join(S, sid);
    if (!fs.existsSync(d)) fail(`Không có mẫu ${sid}`);
    return {sid, dir: d};
  }
  const all = fs.existsSync(S) ? fs.readdirSync(S).filter((f) => fs.statSync(path.join(S, f)).isDirectory()) : [];
  if (all.length === 1) return {sid: all[0], dir: path.join(S, all[0])};
  fail(all.length ? `Dự án có nhiều mẫu, chọn một: ${all.join(', ')}` : 'Dự án chưa có mẫu trong samples/');
}

const VIDEO = /\.(mp4|mov|m4v|mkv|webm|avi)$/i;
export const listVideos = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => VIDEO.test(f)).sort().map((f) => path.join(dir, f)) : [];

let ff;
export function ffmpegPath() {
  if (ff) return ff;
  const cands = [process.env.VET_FFMPEG, 'ffmpeg', 'C:/hoangpq/product-video/workspace/tools/ffmpeg/ffmpeg.exe'];
  for (const c of cands) {
    if (!c) continue;
    const r = spawnSync(c, ['-version'], {windowsHide: true});
    if (r.status === 0) return (ff = c);
  }
  fail('Không tìm thấy ffmpeg (đặt VET_FFMPEG hoặc thêm vào PATH)');
}

/** Chạy lệnh, trả {status, stdout, stderr} (chuỗi). */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {windowsHide: true, encoding: 'utf8', maxBuffer: 64 << 20, ...opts});
  if (r.error) throw r.error;
  return r;
}
export function ffmpeg(args, opts) {
  const r = run(ffmpegPath(), ['-hide_banner', '-y', ...args], opts);
  if (r.status !== 0 && !opts?.allowFail) fail('ffmpeg lỗi: ' + r.stderr.split('\n').slice(-6).join(' '));
  return r;
}

/** Đo video bằng `ffmpeg -i` (không cần ffprobe): độ dài, khổ (đã tính xoay), fps, có tiếng. */
export function probe(file) {
  const e = run(ffmpegPath(), ['-hide_banner', '-i', file]).stderr;
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(e);
  const v = /Stream #.*Video:.*?, (\d{2,5})x(\d{2,5})/.exec(e);
  const fps = /([\d.]+) fps/.exec(e);
  const rot = /rotation of (-?[\d.]+)|rotate\s*:\s*(-?\d+)/.exec(e);
  let w = v ? +v[1] : 0, h = v ? +v[2] : 0;
  const r = rot ? Math.abs(+(rot[1] ?? rot[2])) : 0;
  if (r === 90 || r === 270) [w, h] = [h, w];
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0,
    width: w,
    height: h,
    fps: fps ? +fps[1] : 0,
    has_audio: /Stream #.*Audio:/.test(e),
  };
}

export const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
