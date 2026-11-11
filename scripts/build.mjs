// Dựng 1 bản: cắt clip → render composition "Review" (style @thokunrw) → ảnh bìa.
// Dùng: node scripts/build.mjs <id> [--sample <sid>]
//   Cần: workspace/projects/<id>/source/ (clip dùng chung cả dự án)
//        cuts.txt + props.json, tìm lần lượt ở: samples/<sid>/ (nếu có --sample) → thư mục dự án → products/<id>/
//   Ra:  workspace/projects/<id>/out/<run>/{video.mp4, cover.png, props.json, review.json}
// cuts.txt mỗi dòng: <file nguồn> <giây bắt đầu> <độ dài> <tên xuất> [zoom] [cx]
//   zoom: (video dọc) tỉ lệ khung chính so với 1080x1920, mặc định 1 = giữ nguyên khung như lúc quay.
//   cx:   (video ngang) tâm chủ thể theo chiều ngang 0..1 (mặc định 0.5).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fail, ffmpegPath, out, probe, projectDir, readJson, ROOT, run, sampleDir, stamp, writeJson} from './vlib.mjs';

const argv = process.argv.slice(2);
const id = argv[0];
const si = argv.indexOf('--sample');
const P = projectDir(id);
const {sid, dir: S} = si > 0 ? sampleDir(id, argv[si + 1]) : {sid: null, dir: null};
const SRC = path.join(P, 'source');
if (!fs.existsSync(SRC)) fail(`Thiếu ${SRC}`);
const find = (name) => {
  const dirs = [S, P, path.join(ROOT, 'products', id)].filter(Boolean);
  const hit = dirs.map((d) => path.join(d, name)).find((f) => fs.existsSync(f));
  return hit ?? fail(`Thiếu ${name} (tìm ở: ${dirs.join(', ')})`);
};
const cutsFile = find('cuts.txt');
const propsSrc = find('props.json');
const T = path.join(ROOT, 'template');

const GRADE =
  'eq=brightness=0.03:contrast=0.93:saturation=0.92,colorbalance=rs=-0.03:gs=-0.01:bs=0.05:rm=-0.02:bm=0.04:rh=-0.01:bh=0.02';

/** Bộ lọc giữ khung gốc (rules.md): dọc = nền mờ + khung chính; ngang = nền mờ trên/dưới, giữa 2 bản cạnh nhau. */
function filterFor(w, h, zoom, cx) {
  const bg = '[a]scale=540:960:force_original_aspect_ratio=increase,crop=540:960,boxblur=20:2,scale=1080:1920,eq=brightness=0.02[bg]';
  const tail = `setsar=1,fps=30,${GRADE},format=yuv420p[v]`;
  if (w > h) {
    // mỗi bản 540x608, cắt đều 2 bên quanh tâm cx
    const half = `[b]crop=min(iw\\,ih*540/608):ih:max(0\\,min(iw-ow\\,iw*${cx}-ow/2)):0,scale=540:608,setsar=1,split[l][r]`;
    return `[0:v]split[a][b];${bg};${half};[l][r]hstack[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}`;
  }
  return `[0:v]split[a][b];${bg};[b]scale=trunc(1080*${zoom}/2)*2:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}`;
}

const cuts = fs
  .readFileSync(cutsFile, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [file, start, dur, name, zoom = '1', cx = '0.5'] = l.split(/\s+/);
    if (!name) fail(`Dòng cuts.txt thiếu cột: ${l}`);
    return {file, start, dur, name, zoom, cx};
  });

const sub = sid ?? 'default';
const CLIPS = path.join(T, 'public', 'clips', id, sub);
fs.rmSync(CLIPS, {recursive: true, force: true});
fs.mkdirSync(CLIPS, {recursive: true});

const cutOne = (c) =>
  new Promise((resolve, reject) => {
    const src = path.join(SRC, c.file);
    if (!fs.existsSync(src)) return reject(new Error(`Thiếu source ${c.file}`));
    const {width, height} = probe(src);
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y', '-ss', c.start, '-t', c.dur, '-i', src,
      '-filter_complex', filterFor(width, height, c.zoom, c.cx),
      '-map', '[v]', '-map', '0:a?',
      '-af', 'highpass=f=80,afftdn=nf=-45,volume=14dB,alimiter=limit=0.8',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      path.join(CLIPS, `${c.name}.mp4`),
    ];
    const p = spawn(ffmpegPath(), args, {windowsHide: true});
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Cắt ${c.name} lỗi: ${err.slice(-300)}`))));
  });

async function main() {
  // 1/3 Cắt clip (3 clip song song)
  const queue = [...cuts];
  await Promise.all(Array.from({length: 3}, async () => {
    while (queue.length) await cutOne(queue.shift());
  }));

  // Props cho Review: file clip trỏ về clips/<id>/<sid|default>/<tên>.mp4
  const props = readJson(propsSrc);
  const shots = (props.shots ?? []).map((s) => ({
    ...s,
    file: `clips/${id}/${sub}/${path.basename(s.file, path.extname(s.file))}.mp4`,
  }));
  const runId = stamp();
  const O = path.join(P, 'out', runId);
  fs.mkdirSync(O, {recursive: true});
  const propsFile = path.join(O, 'props.json');
  writeJson(propsFile, {...props, shots});

  // 2/3 Render, 3/3 ảnh bìa
  if (!fs.existsSync(path.join(T, 'node_modules')))
    fail(`Đã cắt clip vào ${CLIPS}; chưa cài template: chạy "npm install" trong template/`);
  const npx = (args) => {
    const r = run('npx', ['remotion', ...args, `--props=${propsFile}`, '--log=error'], {cwd: T, shell: true});
    if (r.status !== 0) fail(`remotion ${args[0]} lỗi: ${(r.stderr || r.stdout).slice(-500)}`);
  };
  const video = path.join(O, 'video.mp4');
  const cover = path.join(O, 'cover.png');
  npx(['render', 'src/index.ts', 'Review', `"${video}"`, '--codec=h264', '--crf=18']);
  npx(['still', 'src/index.ts', 'Review', `"${cover}"`, '--frame=80']);

  writeJson(path.join(O, 'review.json'), {status: 'checking', sample: sid, created: new Date().toISOString()});
  out({run: runId, sample: sid, video, cover, clips: cuts.length, next: `node scripts/check.mjs ${id} ${runId}`});
}

main().catch((e) => fail(e.message));
