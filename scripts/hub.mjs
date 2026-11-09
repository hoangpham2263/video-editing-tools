#!/usr/bin/env node
// Review Hub CLI: lấy source về máy, đẩy video kết quả lên.
// Cấu hình: ~/.config/review-hub.json {"url": "...", "key": "..."} (hoặc biến môi trường HUB_URL, HUB_KEY)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = path.join(os.homedir(), '.config', 'review-hub.json');
const PART = 50 * 1024 * 1024;
const STATUS = {new: 'Chờ dựng', editing: 'Đang dựng', done: 'Có kết quả', posted: 'Đã đăng'};

function conf() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch {}
  const url = (process.env.HUB_URL || c.url || '').replace(/\/+$/, '');
  const key = process.env.HUB_KEY || c.key;
  if (!url || !key) die(`Chưa cấu hình. Tạo ${CONF} với {"url": "...", "key": "..."}`);
  return {url, key};
}
function die(m) { console.error(m); process.exit(1); }
const mb = (b) => (b / 1e6).toFixed(1) + ' MB';

async function api(p, opts = {}) {
  const {url, key} = conf();
  const r = await fetch(url + p, {
    ...opts,
    headers: {Authorization: `Bearer ${key}`, ...(opts.json ? {'Content-Type': 'application/json'} : {})},
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) die(`Lỗi ${r.status}: ${d.error || ''}`);
  return d;
}

const cmds = {
  async list() {
    const items = await api('/api/products');
    if (!items.length) return console.log('Chưa có sản phẩm.');
    for (const p of items) console.log(`${p.slug.padEnd(36)} ${(STATUS[p.status] || p.status).padEnd(11)} ${p.counts.source} source, ${p.counts.result} kết quả  ${p.name}`);
  },
  async show(slug) {
    const p = await api(`/api/products/${slug}`);
    console.log(`${p.name}  [${STATUS[p.status]}]\n${p.note ? `Ghi chú: ${p.note}\n` : ''}`);
    for (const k of ['source', 'result']) {
      console.log(`${k === 'source' ? 'Source' : 'Kết quả'} (${p.files[k].length}):`);
      for (const f of p.files[k]) console.log(`  ${f.name}  ${mb(f.size)}`);
    }
  },
  async create(name, note = '') {
    const p = await api('/api/products', {method: 'POST', json: {name, note}});
    console.log(p.slug);
  },
  async status(slug, s) {
    if (!STATUS[s]) die(`Trạng thái: ${Object.keys(STATUS).join(' | ')}`);
    await api(`/api/products/${slug}`, {method: 'PATCH', json: {status: s}});
    console.log(`${slug}: ${STATUS[s]}`);
  },
  async pull(slug, dir) {
    const p = await api(`/api/products/${slug}`);
    dir = path.resolve(dir || path.join(SKILL, 'work', slug, 'source'));
    fs.mkdirSync(dir, {recursive: true});
    if (p.note) fs.writeFileSync(path.join(dir, '..', 'note.txt'), `${p.name}\n\n${p.note}\n`);
    for (const f of p.files.source) {
      const out = path.join(dir, path.basename(f.name));
      if (fs.existsSync(out) && fs.statSync(out).size === f.size) { console.log(`= ${f.name} (đã có)`); continue; }
      const {url} = await api('/api/sign', {method: 'POST', json: {slug, kind: 'source', name: f.name}});
      const r = await fetch(url);
      if (!r.ok) die(`Tải ${f.name} lỗi ${r.status}`);
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(out + '.part'));
      fs.renameSync(out + '.part', out);
      console.log(`↓ ${f.name}  ${mb(f.size)}`);
    }
    if (p.status === 'new') await api(`/api/products/${slug}`, {method: 'PATCH', json: {status: 'editing'}});
    console.log(`Xong: ${dir}`);
  },
  async push(slug, ...files) {
    if (!files.length) die('Cần ít nhất 1 file');
    for (const file of files) {
      const name = path.basename(file);
      const total = fs.statSync(file).size;
      const type = /\.mp4$/i.test(name) ? 'video/mp4' : /\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : 'application/octet-stream';
      const base = `/api/upload/${slug}/result/${encodeURIComponent(name)}`;
      const {uploadId} = await api(`${base}?action=create&type=${encodeURIComponent(type)}`, {method: 'POST'});
      const fh = await fs.promises.open(file, 'r');
      const parts = [];
      try {
        for (let i = 0, off = 0; off < total || i === 0; i++, off += PART) {
          const len = Math.min(PART, total - off);
          const buf = Buffer.alloc(len);
          await fh.read(buf, 0, len, off);
          parts.push(await api(`${base}?action=part&uploadId=${encodeURIComponent(uploadId)}&part=${i + 1}`, {method: 'PUT', body: buf}));
          if (off + len >= total) break;
        }
      } finally { await fh.close(); }
      await api(`${base}?action=complete`, {method: 'POST', json: {uploadId, parts}});
      console.log(`↑ ${name}  ${mb(total)}`);
    }
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmds[cmd]) {
  console.log(`Dùng: node scripts/hub.mjs <lệnh>
  list                        danh sách sản phẩm
  show <slug>                 xem ghi chú + file
  create "<tên>" ["ghi chú"]  tạo sản phẩm
  pull <slug> [thư-mục]       tải source về (mặc định work/<slug>/source), đặt "Đang dựng"
  push <slug> <file...>       đẩy video/ảnh bìa kết quả, đặt "Có kết quả"
  status <slug> <new|editing|done|posted>`);
  process.exit(cmd ? 1 : 0);
}
await cmds[cmd](...args);
