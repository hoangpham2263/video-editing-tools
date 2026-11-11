// Phân tích video mẫu → analysis/measure.json + style.json khung.
// Dùng: node scripts/analyze.mjs <id> [<sid>]                 đo + xuất ảnh cảnh + contact sheet
//       node scripts/analyze.mjs <id> [<sid>] --set '<json>'  agent điền nốt style.json (trộn + kiểm schema)
// Mọi thứ ghi trong workspace/projects/<id>/samples/<sid>/ (analysis/, style.json).
// Không có <sid> mà dự án chỉ có đúng 1 mẫu thì dùng mẫu đó.
// Chỉ lấy CÁCH dựng; không chép nội dung, logo, nhạc của mẫu.
import fs from 'node:fs';
import path from 'node:path';
import {fail, ffmpeg, listVideos, out, probe, readJson, sampleDir, writeJson} from './vlib.mjs';
import {DEFAULT_STYLE, ENUMS, ROLES, merge, pending, validate} from './style.mjs';

const argv = process.argv.slice(2);
const id = argv[0];
const sidArg = argv[1] && argv[1] !== '--set' ? argv[1] : undefined;
const si = argv.indexOf('--set');
const flag = si > 0 ? '--set' : undefined;
const arg = si > 0 ? argv[si + 1] : undefined;
const {sid, dir: P} = sampleDir(id, sidArg);
const styleFile = path.join(P, 'style.json');

if (flag === '--set') {
  let patch;
  try {
    patch = JSON.parse(arg ?? '');
  } catch {
    fail('--set cần JSON hợp lệ');
  }
  const cur = readJson(styleFile, null);
  if (!cur) fail('Chưa có style.json, chạy analyze trước');
  const {_choices, _pending, ...base} = cur;
  const next = merge(base, patch);
  const errs = validate(next, {partial: true});
  if (errs.length) fail(errs.join('; '));
  const left = pending(next);
  writeJson(styleFile, left.length ? {...next, _pending: left, _choices} : next);
  out({style: styleFile, pending: left, complete: left.length === 0});
  process.exit(0);
}

const sample = listVideos(P)[0];
if (!sample) fail(`Không có video trong ${P}`);
const A = path.join(P, 'analysis');
fs.rmSync(A, {recursive: true, force: true});
fs.mkdirSync(A, {recursive: true});

const info = probe(sample);
// Chỗ cắt cảnh
const sc = ffmpeg(['-i', sample, '-an', '-vf', "fps=2,select='gt(scene,0.25)',showinfo", '-f', 'null', '-']).stderr;
const cuts = [...sc.matchAll(/pts_time:([\d.]+)/g)]
  .map((m) => +m[1])
  .filter((t) => t > 0.3 && t < info.duration - 0.3);
const bounds = [0, ...cuts, info.duration];
const scenes = bounds.slice(0, -1).map((s, i) => ({
  index: i + 1,
  start: +s.toFixed(2),
  end: +bounds[i + 1].toFixed(2),
  duration: +(bounds[i + 1] - s).toFixed(2),
}));
// Âm thanh
const audio = {present: info.has_audio, mean_db: null, max_db: null, audible: false};
if (info.has_audio) {
  const vd = ffmpeg(['-i', sample, '-vn', '-af', 'volumedetect', '-f', 'null', '-']).stderr;
  audio.mean_db = +(/mean_volume: (-?[\d.]+)/.exec(vd)?.[1] ?? -91);
  audio.max_db = +(/max_volume: (-?[\d.]+)/.exec(vd)?.[1] ?? -91);
  audio.audible = audio.mean_db > -45;
}
// Ảnh giữa mỗi cảnh + contact sheet
for (const s of scenes) {
  s.image = `scene-${String(s.index).padStart(2, '0')}.jpg`;
  const mid = ((s.start + s.end) / 2).toFixed(2);
  ffmpeg(['-ss', mid, '-i', sample, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', path.join(A, s.image)]);
}
const cols = Math.min(4, scenes.length);
const rows = Math.ceil(scenes.length / cols);
ffmpeg([
  '-i', path.join(A, 'scene-%02d.jpg'),
  '-vf', `scale=270:-2,tile=${cols}x${rows}:padding=6:color=white`,
  '-frames:v', '1', path.join(A, 'contact.jpg'),
]);

const durs = scenes.map((s) => s.duration);
const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const k = gcd(info.width, info.height) || 1;
const measure = {
  sample: sid,
  file: path.basename(sample),
  ...info,
  aspect: `${info.width / k}:${info.height / k}`,
  scene_count: scenes.length,
  shot_seconds: {avg: +avg.toFixed(2), min: Math.min(...durs), max: Math.max(...durs)},
  scenes,
  audio,
};
writeJson(path.join(A, 'measure.json'), measure);

// style.json khung: trường đo được đã điền, trường cần nhìn để null + danh sách lựa chọn
const near916 = info.width < info.height && Math.abs(info.width / info.height - 9 / 16) < 0.02;
const skeleton = {
  aspect: near916 ? '9:16' : measure.aspect,
  fps: Math.round(info.fps) || DEFAULT_STYLE.fps,
  shot_seconds: measure.shot_seconds,
  sequence: null,
  cover: {kind: null, title_lines: null, title_color: null, paper_color: null, decor: null},
  title_anim: null,
  caption: {style: null, position: null, color: null, outline: null, anim: null, decor: null},
  transition: null,
  music: audio.audible ? null : false,
  sfx: null,
};
const left = pending(skeleton);
writeJson(styleFile, {
  ...skeleton,
  _pending: left,
  _choices: {
    sequence: `mảng ${scenes.length} vai theo thứ tự cảnh, mỗi vai: ${ROLES.join('|')}`,
    ...Object.fromEntries(Object.entries(ENUMS).map(([p, v]) => [p, v.join('|')])),
    colors: '#rrggbb (caption.outline có thể null)',
    'cover.title_lines': '0..4',
    'decor/music/sfx': 'true|false (music chỉ ghi nhận, KHÔNG chép nhạc mẫu)',
    default: DEFAULT_STYLE,
  },
});
out({
  measure: path.join(A, 'measure.json'),
  style: styleFile,
  contact: path.join(A, 'contact.jpg'),
  images: scenes.map((s) => path.join(A, s.image)),
  duration: info.duration,
  scene_count: scenes.length,
  pending: left,
  next: `Xem ảnh rồi: node scripts/analyze.mjs ${id} ${sid} --set '{"sequence":[...],"cover":{...}}'`,
});
