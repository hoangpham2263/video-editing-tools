#!/usr/bin/env node
// Review Hub CLI – dữ liệu nằm ở GitHub Releases của repo review-video-sources.
// Mỗi sản phẩm = 1 Release (tag = slug). File thường = source; file "KQ_<tên>" = video kết quả.
// Trạng thái ở dòng đầu mô tả: <!-- status:new|editing|done|posted -->
// Cần: gh CLI đã đăng nhập (gh auth login).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = process.env.HUB_REPO || 'hoangpham2263/review-video-sources';
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'KQ_';
const STATUS = {new: 'Chờ dựng', editing: 'Đang dựng', done: 'Có kết quả', posted: 'Đã đăng'};

const run = (args, opts = {}) => execFileSync('gh', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts});
const api = (p, ...extra) => JSON.parse(run(['api', p, ...extra]) || 'null');
const mb = (b) => (b / 1e6).toFixed(1) + ' MB';
const die = (m) => { console.error(m); process.exit(1); };

function parse(rel) {
  const body = rel.body || '';
  const m = body.match(/<!--\s*status:(\w+)\s*-->/);
  return {
    id: rel.id, slug: rel.tag_name, name: rel.name || rel.tag_name,
    note: body.replace(/<!--\s*status:\w+\s*-->\s*/g, '').trim(),
    status: STATUS[m?.[1]] ? m[1] : 'new',
    sources: rel.assets.filter((a) => !a.name.startsWith(PREFIX)),
    results: rel.assets.filter((a) => a.name.startsWith(PREFIX)),
  };
}
const get = (slug) => parse(api(`repos/${REPO}/releases/tags/${encodeURIComponent(slug)}`));
const setStatus = (p, s) => run(['api', '-X', 'PATCH', `repos/${REPO}/releases/${p.id}`, '-f', `body=<!-- status:${s} -->\n${p.note}`]);
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'san-pham';

const cmds = {
  list() {
    const rels = api(`repos/${REPO}/releases?per_page=100`).map(parse);
    if (!rels.length) return console.log('Chưa có sản phẩm.');
    for (const p of rels) console.log(`${p.slug.padEnd(36)} ${STATUS[p.status].padEnd(11)} ${p.sources.length} source, ${p.results.length} kết quả  ${p.name}`);
  },
  show(slug) {
    const p = get(slug);
    console.log(`${p.name}  [${STATUS[p.status]}]\n${p.note ? `Ghi chú: ${p.note}\n` : ''}`);
    console.log(`Source (${p.sources.length}):`);
    for (const a of p.sources) console.log(`  ${a.name}  ${mb(a.size)}`);
    console.log(`Kết quả (${p.results.length}):`);
    for (const a of p.results) console.log(`  ${a.name.slice(PREFIX.length)}  ${mb(a.size)}`);
  },
  create(name, note = '') {
    if (!name) die('Cần tên sản phẩm');
    const tag = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
    run(['release', 'create', tag, '-R', REPO, '--target', 'main', '--title', name, '--notes', `<!-- status:new -->\n${note}`]);
    console.log(tag);
  },
  status(slug, s) {
    if (!STATUS[s]) die(`Trạng thái: ${Object.keys(STATUS).join(' | ')}`);
    setStatus(get(slug), s);
    console.log(`${slug}: ${STATUS[s]}`);
  },
  pull(slug, dir) {
    const p = get(slug);
    dir = path.resolve(dir || path.join(SKILL, 'work', slug, 'source'));
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '..', 'note.txt'), `${p.name}\n\n${p.note}\n`);
    for (const a of p.sources) {
      const out = path.join(dir, a.name);
      if (fs.existsSync(out) && fs.statSync(out).size === a.size) { console.log(`= ${a.name} (đã có)`); continue; }
      run(['release', 'download', slug, '-R', REPO, '-p', a.name, '-D', dir, '--clobber'], {stdio: 'inherit'});
      console.log(`↓ ${a.name}  ${mb(a.size)}`);
    }
    if (p.status === 'new') setStatus(p, 'editing');
    console.log(`Xong: ${dir}`);
  },
  push(slug, ...files) {
    if (!files.length) die('Cần ít nhất 1 file');
    const p = get(slug);
    // Tên asset = tên file → tạo link tạm tên KQ_<file> để upload
    const tmp = fs.mkdtempSync(path.join(SKILL, '.push-'));
    try {
      const linked = files.map((f) => {
        const dst = path.join(tmp, PREFIX + path.basename(f));
        fs.symlinkSync(path.resolve(f), dst);
        return dst;
      });
      run(['release', 'upload', slug, '-R', REPO, '--clobber', ...linked], {stdio: 'inherit'});
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
    for (const f of files) console.log(`↑ ${PREFIX}${path.basename(f)}  ${mb(fs.statSync(f).size)}`);
    if (['new', 'editing'].includes(p.status)) setStatus(p, 'done');
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmds[cmd]) {
  console.log(`Dùng: node scripts/hub.mjs <lệnh>   (repo: ${REPO})
  list                        danh sách sản phẩm
  show <slug>                 ghi chú + file
  create "<tên>" ["ghi chú"]  tạo sản phẩm (1 Release)
  pull <slug> [thư-mục]       tải source về (mặc định work/<slug>/source), đặt "Đang dựng"
  push <slug> <file...>       đẩy video/ảnh bìa kết quả (tên KQ_...), đặt "Có kết quả"
  status <slug> <new|editing|done|posted>`);
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](...args);
