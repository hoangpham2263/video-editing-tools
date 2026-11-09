#!/usr/bin/env node
// Review Hub CLI – dữ liệu ở Google Drive qua Worker tools-hub-api ("Tools Hub/Review Video/<mã>/").
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const API = process.env.REVIEW_HUB_API || 'https://tools-hub-api.hoangpham2263.workers.dev';
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = {new: 'Chờ dựng', editing: 'Đang dựng', done: 'Có kết quả', posted: 'Đã đăng'};
const mb = (b) => (b / 1e6).toFixed(1) + ' MB';
const die = (m) => { console.error(m); process.exit(1); };
const MIME = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};

async function api(p, opts = {}) {

  const r = await fetch(`${API}/api/review${p}`, {
    method: opts.method || 'GET',
    headers: {origin: 'https://hoangpham.is-a.dev', ...(opts.json ? {'content-type': 'application/json'} : {})},
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) die(d.error || `Lỗi ${r.status}`);
  return d;
}
const files = (p, kind) => (p.files || []).filter((f) => (kind === 'result' ? f.kind === 'result' : f.kind !== 'result'));

const cmds = {
  async list() {
    const ps = await api('');
    if (!ps.length) return console.log('Chưa có sản phẩm.');
    for (const p of ps) console.log(`${p.slug.padEnd(36)} ${STATUS[p.status].padEnd(11)} ${files(p).length} source, ${files(p, 'result').length} kết quả  ${p.name}`);
  },
  async show(slug) {
    const p = await api(`/${slug}`);
    console.log(`${p.name}  [${STATUS[p.status]}]\n${p.note ? `Ghi chú: ${p.note}\n` : ''}`);
    for (const k of ['source', 'result']) {
      console.log(`${k === 'source' ? 'Source' : 'Kết quả'} (${files(p, k).length}):`);
      for (const f of files(p, k)) console.log(`  ${f.name}  ${mb(f.size)}`);
    }
  },
  async create(name, note = '') {
    if (!name) die('Cần tên sản phẩm');
    console.log((await api('', {method: 'POST', json: {name, note}})).slug);
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
    if (p.status === 'new') await api(`/${slug}`, {method: 'PATCH', json: {status: 'editing'}});
    console.log(`Xong: ${dir}`);
  },
  async push(slug, ...paths) {
    if (!paths.length) die('Cần ít nhất 1 file');
    for (const fp of paths) {
      const st = fs.statSync(fp), name = path.basename(fp);
      const mime = MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      const {uploadUrl} = await api(`/${slug}/upload`, {method: 'POST', json: {name, size: st.size, mime, kind: 'result'}});
      const r = await fetch(uploadUrl, {method: 'PUT', headers: {'content-type': mime, 'content-length': String(st.size)}, body: fs.createReadStream(fp), duplex: 'half'});
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) die(`Up ${name} lỗi ${r.status}`);
      await api(`/${slug}/files`, {method: 'POST', json: {id: d.id, kind: 'result'}});
      console.log(`↑ ${name}  ${mb(st.size)}`);
    }
  },
  // Up source từ máy (khi người dùng gửi file trực tiếp)
  async 'push-source'(slug, ...paths) {
    for (const fp of paths) {
      const st = fs.statSync(fp), name = path.basename(fp);
      const mime = MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      const {uploadUrl} = await api(`/${slug}/upload`, {method: 'POST', json: {name, size: st.size, mime, kind: 'source'}});
      const r = await fetch(uploadUrl, {method: 'PUT', headers: {'content-type': mime, 'content-length': String(st.size)}, body: fs.createReadStream(fp), duplex: 'half'});
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) die(`Up ${name} lỗi ${r.status}`);
      await api(`/${slug}/files`, {method: 'POST', json: {id: d.id, kind: 'source'}});
      console.log(`↑ ${name}  ${mb(st.size)}`);
    }
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmds[cmd]) {
  console.log(`Dùng: node scripts/hub.mjs <lệnh>   (API: ${API})
  list                          danh sách sản phẩm
  show <mã>                     ghi chú + file
  create "<tên>" ["ghi chú"]    tạo sản phẩm
  pull <mã> [thư-mục]           tải source về (mặc định work/<mã>/source), đặt "Đang dựng"
  push <mã> <file...>           đẩy video/ảnh bìa kết quả, đặt "Có kết quả"
  push-source <mã> <file...>    up source từ máy
  status <mã> <new|editing|done|posted>`);
  process.exit(cmd ? 1 : 0);
}
await cmds[cmd](...args);
