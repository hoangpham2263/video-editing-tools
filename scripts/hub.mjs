#!/usr/bin/env node
// Video Editing Tools CLI – dữ liệu ở Google Drive qua Worker tools-hub-api ("Tools Hub/Video Editing Tools/<mã>/").
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const API = process.env.REVIEW_HUB_API || 'https://tools-hub-api.hoangpham2263.workers.dev';
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = {new: 'Chờ edit', done: 'Đã edit', posted: 'Đã đăng'};
const st = (p) => (STATUS[p.status] ? p.status : 'new');
const mb = (b) => (b / 1e6).toFixed(1) + ' MB';
const die = (m) => { console.error(m); process.exit(1); };
const MIME = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};

async function api(p, opts = {}) {

  const r = await fetch(`${API}/api/video-editing-tools${p}`, {
    method: opts.method || 'GET',
    headers: {origin: 'https://hoangpham.is-a.dev', ...(opts.json ? {'content-type': 'application/json'} : {})},
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) die(d.error || `Lỗi ${r.status}`);
  return d;
}
const files = (p, kind) => (p.files || []).filter((f) => (kind === 'result' ? f.kind === 'result' : f.kind !== 'result'));


// Up thẳng lên Google theo từng phần 64 MB (file lớn không bị hết thời gian chờ)
async function upload(slug, fp, kind) {
  const st = fs.statSync(fp), name = path.basename(fp);
  const mime = MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream';
  const {uploadUrl} = await api(`/${slug}/upload`, {method: 'POST', json: {name, size: st.size, mime, kind}});
  const CH = 64 * 1024 * 1024, fd = fs.openSync(fp, 'r');
  let d = {};
  try {
    for (let off = 0; off < st.size; off += CH) {
      const len = Math.min(CH, st.size - off), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, off);
      let r;
      for (let t = 0; ; t++) {
        try { r = await fetch(uploadUrl, {method: 'PUT', headers: {'content-range': `bytes ${off}-${off + len - 1}/${st.size}`}, body: buf}); break; }
        catch (e) { if (t >= 3) throw e; }
      }
      if (r.status === 308) { process.stdout.write(`\r  ${name} ${Math.round((off + len) / st.size * 100)}%`); continue; }
      d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) die(`Up ${name} lỗi ${r.status}`);
    }
  } finally { fs.closeSync(fd); }
  await api(`/${slug}/files`, {method: 'POST', json: {id: d.id, kind}});
  console.log(`\r↑ ${name}  ${mb(st.size)}`);
}

const cmds = {
  async list() {
    const ps = (await api('')).filter((p) => p.type !== 'sample');
    if (!ps.length) return console.log('Chưa có sản phẩm.');
    for (const p of ps) console.log(`${p.slug.padEnd(36)} ${STATUS[st(p)].padEnd(9)} ${files(p).length} source, ${files(p, 'result').length} kết quả  ${p.name}`);
  },
  async show(slug) {
    const p = await api(`/${slug}`);
    console.log(`${p.name}  [${STATUS[st(p)]}]\n${p.note ? `Ghi chú: ${p.note}\n` : ''}`);
    for (const k of ['source', 'result']) {
      console.log(`${k === 'source' ? 'Source' : 'Kết quả'} (${files(p, k).length}):`);
      for (const f of files(p, k)) console.log(`  ${f.name}  ${mb(f.size)}`);
    }
  },
  async create(name, note = '') {
    if (!name) die('Cần tên sản phẩm');
    console.log((await api('', {method: 'POST', json: {name, note}})).slug);
  },
  // Video mẫu: lưu riêng ở Drive "Video Editing Tools/Video mẫu/<mã>/"
  async 'create-sample'(name, note = '') {
    if (!name) die('Cần tên mẫu');
    console.log((await api('', {method: 'POST', json: {name, note, type: 'sample'}})).slug);
  },
  async samples() {
    for (const p of (await api('')).filter((p) => p.type === 'sample')) console.log(`${p.slug.padEnd(36)} ${(p.files || []).length} video  ${p.name}`);
  },
  async type(slug, t) {
    if (!['product', 'sample'].includes(t)) die('Loại: product | sample');
    await api(`/${slug}`, {method: 'PATCH', json: {type: t}});
    console.log(`${slug}: ${t === 'sample' ? 'video mẫu' : 'sản phẩm'}`);
  },
  async status(slug, s) {
    if (!STATUS[s]) die(`Trạng thái: ${Object.keys(STATUS).join(' | ')}`);
    await api(`/${slug}`, {method: 'PATCH', json: {status: s}});
    console.log(`${slug}: ${STATUS[s]}`);
  },
  async pull(slug, dir) {
    const p = await api(`/${slug}`);
    dir = path.resolve(dir || path.join(SKILL, 'work', slug, 'source'));
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '..', 'note.txt'), `${p.name}\n\n${p.note}\n`);
    for (const f of files(p)) {
      const out = path.join(dir, f.name);
      if (fs.existsSync(out) && fs.statSync(out).size === f.size) { console.log(`= ${f.name} (đã có)`); continue; }
      const r = await fetch(f.download);
      if (!r.ok) die(`Tải ${f.name} lỗi ${r.status}`);
      await fs.promises.writeFile(out, Buffer.from(await r.arrayBuffer()));
      console.log(`↓ ${f.name}  ${mb(f.size)}`);
    }
    console.log(`Xong: ${dir}`);
  },
  async push(slug, ...paths) {
    if (!paths.length) die('Cần ít nhất 1 file');
    for (const fp of paths) await upload(slug, fp, 'result');
  },
  // Up source từ máy (khi người dùng gửi file trực tiếp); bỏ qua file đã có
  async 'push-source'(slug, ...paths) {
    const have = new Set(((await api(`/${slug}`)).files || []).filter((f) => f.kind !== 'result').map((f) => f.name));
    for (const fp of paths) have.has(path.basename(fp)) ? console.log(`= ${path.basename(fp)} (đã có)`) : await upload(slug, fp, 'source');
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmds[cmd]) {
  console.log(`Dùng: node scripts/hub.mjs <lệnh>   (API: ${API})
  list                          danh sách sản phẩm
  show <mã>                     ghi chú + file
  create "<tên>" ["ghi chú"]    tạo sản phẩm
  pull <mã> [thư-mục]           tải source về (mặc định work/<mã>/source)
  push <mã> <file...>           đẩy video/ảnh bìa kết quả, đặt "Đã edit"
  push-source <mã> <file...>    up source (hoặc video mẫu) từ máy
  samples                       danh sách video mẫu
  create-sample "<tên>"         tạo mục video mẫu
  type <mã> <product|sample>    đổi loại (chuyển thư mục trên Drive)
  status <mã> <new|done|posted>   (Chờ edit | Đã edit | Đã đăng)`);
  process.exit(cmd ? 1 : 0);
}
await cmds[cmd](...args);
