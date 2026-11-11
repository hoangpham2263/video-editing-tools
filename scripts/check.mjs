// Tự kiểm bản dựng trước khi đưa vào To review.
// Dùng: node scripts/check.mjs <id> <run>                 xuất still giữa mỗi cảnh vào out/<run>/stills/ để agent xem
//       node scripts/check.mjs <id> <run> --pass          review.json status "ready" (To review)
//       node scripts/check.mjs <id> <run> --fail "<lý do>" review.json status "check_failed"
import fs from 'node:fs';
import path from 'node:path';
import {fail, ffmpeg, out, probe, projectDir, readJson, writeJson} from './vlib.mjs';

const [id, runId, flag, reason] = process.argv.slice(2);
if (!runId || !/^[\w.-]+$/.test(runId)) fail('Dùng: node scripts/check.mjs <id> <run> [--pass | --fail "<lý do>"]');
const O = path.join(projectDir(id), 'out', runId);
const video = path.join(O, 'video.mp4');
if (!fs.existsSync(video)) fail(`Không có ${video}`);
const reviewFile = path.join(O, 'review.json');
const review = readJson(reviewFile, {});

if (flag === '--pass' || flag === '--fail') {
  if (flag === '--fail' && !reason) fail('--fail cần lý do');
  const next = {...review, status: flag === '--pass' ? 'ready' : 'check_failed', checked: new Date().toISOString()};
  if (flag === '--fail') next.reason = reason;
  else delete next.reason;
  writeJson(reviewFile, next);
  out({review: reviewFile, status: next.status});
  process.exit(0);
}

// Mốc giữa mỗi cảnh lấy từ props.json của lần dựng
const props = readJson(path.join(O, 'props.json'), {shots: []});
const ST = path.join(O, 'stills');
fs.rmSync(ST, {recursive: true, force: true});
fs.mkdirSync(ST, {recursive: true});
let t = 0;
const stills = props.shots.map((s, i) => {
  const at = t + s.duration / 2;
  t += s.duration;
  const file = path.join(ST, `shot-${String(i + 1).padStart(2, '0')}.jpg`);
  ffmpeg(['-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', file]);
  return {shot: i + 1, at: +at.toFixed(2), caption: s.caption ?? (i === 0 ? (props.title ?? []).join(' / ') : ''), file};
});
const info = probe(video);
out({
  video,
  duration: info.duration,
  size: `${info.width}x${info.height}`,
  cover: path.join(O, 'cover.png'),
  stills,
  next: `Xem ảnh bìa + từng still theo references/rules.md, rồi: node scripts/check.mjs ${id} ${runId} --pass | --fail "<lý do>"`,
});
