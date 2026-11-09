// Review Hub – đọc/ghi GitHub Releases của repo dữ liệu.
// Mỗi sản phẩm = 1 Release (tag = mã sản phẩm). File thường = source, file tên "KQ_..." = video kết quả.
// Trạng thái lưu ở dòng đầu phần mô tả: <!-- status:new -->
const REPO = 'hoangpham2263/review-video-sources';
const STATUS = {new: 'Chờ dựng', editing: 'Đang dựng', done: 'Có kết quả', posted: 'Đã đăng'};
const RESULT_PREFIX = 'KQ_';
// Worker Cloudflare chỉ để đổi asset id → link phát tạm (GitHub không bật CORS cho link này)
const LINK_API = 'https://yooi.hoangpham2263.workers.dev';
const isVideo = (n) => /\.(mp4|mov|m4v|webm)$/i.test(n);
const isImage = (n) => /\.(png|jpe?g|webp|gif)$/i.test(n);
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const store = {
  get token() { try { return localStorage.getItem('hub.token') || ''; } catch { return ''; } },
  set token(v) { try { localStorage.setItem('hub.token', v); } catch {} },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const size = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '');
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'san-pham';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function gh(path, opts = {}) {
  if (!store.token) { openSettings(); throw new Error('Chưa nhập mã GitHub'); }
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${store.token}`,
      Accept: 'application/vnd.github+json',
      ...(opts.json ? {'Content-Type': 'application/json'} : {}),
    },
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  if (r.status === 401) { openSettings(); throw new Error('Mã GitHub sai hoặc hết hạn'); }
  if (r.status === 404) throw new Error('Không thấy. Tài khoản này đã được mời vào repo dữ liệu chưa?');
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Lỗi ${r.status}`);
  return d;
}

/** Tách release thành sản phẩm */
function toProduct(rel) {
  const body = rel.body || '';
  const m = body.match(/<!--\s*status:(\w+)\s*-->/);
  const note = body.replace(/<!--\s*status:\w+\s*-->\s*/g, '').trim();
  const assets = (rel.assets || []).map((a) => ({
    id: a.id, name: a.name, size: a.size, uploaded: a.updated_at, url: a.browser_download_url,
  }));
  return {
    id: rel.id, slug: rel.tag_name, name: rel.name || rel.tag_name, note,
    status: m?.[1] && STATUS[m[1]] ? m[1] : 'new',
    sources: assets.filter((a) => !a.name.startsWith(RESULT_PREFIX)),
    results: assets.filter((a) => a.name.startsWith(RESULT_PREFIX)),
    createdAt: rel.created_at,
    updatedAt: assets.reduce((t, a) => (a.uploaded > t ? a.uploaded : t), rel.created_at),
    page: rel.html_url,
    edit: `https://github.com/${REPO}/releases/edit/${encodeURIComponent(rel.tag_name)}`,
  };
}
const bodyOf = (status, note) => `<!-- status:${status} -->\n${note || ''}`.trim();

/** Link phát tạm cho 1 file (cache ~50 phút) */
const linkCache = new Map();
async function mediaUrl(id) {
  const c = linkCache.get(id);
  if (c && c.exp > Date.now()) return c.url;
  const r = await fetch(`${LINK_API}/asset/${id}`, {headers: {Authorization: `Bearer ${store.token}`}});
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || 'Không lấy được link xem');
  linkCache.set(id, {url: d.url, exp: Date.now() + 50 * 60e3});
  return d.url;
}

/** Thẻ xem trước: video/ảnh hiện luôn, bấm để phát to */
function mediaCard(f, label) {
  const media = isVideo(f.name) || isImage(f.name);
  return `<div class="card result">
    ${media ? `<button class="thumb" data-play="${f.id}" data-name="${esc(f.name)}" aria-label="Xem ${esc(label)}"><span class="play">${isVideo(f.name) ? '▶' : '⤢'}</span></button>` : ''}
    <div><div class="fname">${esc(label)}</div><div class="meta">${size(f.size)} · ${when(f.uploaded)}</div></div>
    <div class="row"><button class="small" data-dl="${f.id}">Tải về</button><button class="small ghost danger" data-del="${f.id}" data-name="${esc(f.name)}">Xoá</button></div>
  </div>`;
}

async function loadThumb(btn) {
  const {play: id, name} = btn.dataset;
  try {
    const url = await mediaUrl(id);
    const el = document.createElement(isVideo(name) ? 'video' : 'img');
    if (isVideo(name)) Object.assign(el, {muted: true, playsInline: true, preload: 'metadata', src: url + '#t=1'});
    else el.src = url;
    btn.prepend(el);
  } catch {}
}

async function openPlayer(id, name, label) {
  const v = $('#playVideo'), im = $('#playImg');
  v.hidden = !isVideo(name); im.hidden = isVideo(name);
  $('#playName').textContent = label;
  v.removeAttribute('src'); im.removeAttribute('src');
  $('#dlgPlay').showModal();
  try {
    const url = await mediaUrl(id);
    $('#playDl').href = url;
    if (isVideo(name)) { v.src = url; v.play().catch(() => {}); } else im.src = url;
  } catch (e) { toast(e.message); }
}
$('#dlgPlay').addEventListener('close', () => $('#playVideo').pause());

/* ---------- Trang danh sách ---------- */
let filter = 'all';
async function renderList() {
  app.innerHTML = `<div class="row between"><div><h1>Sản phẩm</h1><p class="meta" style="margin:4px 0 0">Người quay up source, người dựng trả video kết quả. Lưu trên GitHub Releases.</p></div><button class="primary" id="btnNew">+ Sản phẩm mới</button></div>
    <div class="tabs" id="tabs"></div><div class="list" id="list"><p class="empty">Đang tải…</p></div>`;
  $('#btnNew').onclick = () => $('#dlgNew').showModal();
  let items = [];
  try {
    items = (await gh(`/repos/${REPO}/releases?per_page=100`)).map(toProduct)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch (e) { $('#list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const tabs = [['all', 'Tất cả'], ...Object.entries(STATUS)];
  const draw = () => {
    $('#tabs').innerHTML = tabs.map(([k, v]) => {
      const n = k === 'all' ? items.length : items.filter((i) => i.status === k).length;
      return `<button data-k="${k}" aria-pressed="${filter === k}"><span class="k">${v}</span><span class="v">${n}</span></button>`;
    }).join('');
    $('#tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.k; draw(); }));
    const shown = items.filter((i) => filter === 'all' || i.status === filter);
    $('#list').innerHTML = shown.length ? shown.map((p) => {
      const bytes = [...p.sources, ...p.results].reduce((s, a) => s + a.size, 0);
      return `<a class="card item" href="#/p/${encodeURIComponent(p.slug)}">
        <div class="row between"><span class="name">${esc(p.name)}</span><span class="badge s-${p.status}">${STATUS[p.status]}</span></div>
        <div class="meta">${p.sources.length} source · ${p.results.length} video kết quả · ${size(bytes)} · ${when(p.updatedAt)}</div>
      </a>`;
    }).join('') : `<p class="empty">Chưa có sản phẩm nào.</p>`;
  };
  draw();
}

/* ---------- Trang chi tiết ---------- */
async function renderProduct(slug) {
  app.innerHTML = `<p class="empty">Đang tải…</p>`;
  let p;
  try { p = toProduct(await gh(`/repos/${REPO}/releases/tags/${encodeURIComponent(slug)}`)); }
  catch (e) { app.innerHTML = `<a class="back" href="#">← Danh sách</a><p class="empty">${esc(e.message)}</p>`; return; }

  app.innerHTML = `
    <a class="back" href="#">← Danh sách</a>
    <div class="row between"><h1>${esc(p.name)}</h1><span class="badge s-${p.status}">${STATUS[p.status]}</span></div>
    <div class="card">
      <div class="meta">Mã: ${esc(p.slug)} · tạo ${when(p.createdAt)}</div>
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
      <div class="row" style="margin-top:10px">
        <label style="margin:0;flex:1;min-width:160px">
          <select id="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <button id="btnNote" class="small">Sửa ghi chú</button>
        <a class="btn small" href="${esc(p.page)}" target="_blank" rel="noopener">Mở trên GitHub</a>
        <button id="btnDel" class="small ghost danger">Xoá sản phẩm</button>
      </div>
    </div>

    <section>
      <h2>Video kết quả (${p.results.length})</h2>
      ${p.results.length ? `<div class="results">${p.results.map((f) => mediaCard(f, f.name.slice(RESULT_PREFIX.length))).join('')}</div>` : '<p class="meta">Chưa có video kết quả.</p>'}
    </section>

    <section>
      <h2>Source (${p.sources.length})</h2>
      <a class="drop" href="${esc(p.edit)}" target="_blank" rel="noopener" style="display:block;text-decoration:none">
        <strong style="color:var(--foreground)">Up source trên GitHub</strong><br>
        Mở trang sửa Release → kéo thả video vào ô "Attach binaries" → bấm "Update release".<br>
        <span class="meta">Mỗi file tối đa 2 GB, giữ nguyên chất lượng. Dùng được trên điện thoại.</span>
      </a>
      ${p.sources.length ? `<div class="results">${p.sources.map((f) => mediaCard(f, f.name)).join('')}</div>` : ''}
    </section>`;

  const patch = (status, note) => gh(`/repos/${REPO}/releases/${p.id}`, {method: 'PATCH', json: {body: bodyOf(status, note)}});
  $('#status').onchange = async (e) => {
    try { await patch(e.target.value, p.note); toast('Đã đổi trạng thái'); renderProduct(slug); } catch (er) { toast(er.message); }
  };
  $('#btnNote').onclick = async () => {
    const note = prompt('Ghi chú cho người dựng', p.note || '');
    if (note === null) return;
    try { await patch(p.status, note); renderProduct(slug); } catch (er) { toast(er.message); }
  };
  $('#btnDel').onclick = async () => {
    if (!confirm(`Xoá hẳn "${p.name}" cùng toàn bộ source và video? Không khôi phục được.`)) return;
    try {
      await gh(`/repos/${REPO}/releases/${p.id}`, {method: 'DELETE'});
      await gh(`/repos/${REPO}/git/refs/tags/${encodeURIComponent(p.slug)}`, {method: 'DELETE'}).catch(() => {});
      toast('Đã xoá');
      location.hash = '';
    } catch (er) { toast(er.message); }
  };
  app.querySelectorAll('[data-play]').forEach((b) => {
    loadThumb(b);
    b.onclick = () => openPlayer(b.dataset.play, b.dataset.name, b.closest('.result').querySelector('.fname').textContent);
  });
  app.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = async () => {
    try { location.href = await mediaUrl(b.dataset.dl); } catch (e) { toast(e.message); }
  }));
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Xoá file "${b.dataset.name}"? Không khôi phục được.`)) return;
    try { await gh(`/repos/${REPO}/releases/assets/${b.dataset.del}`, {method: 'DELETE'}); toast('Đã xoá'); renderProduct(slug); }
    catch (er) { toast(er.message); }
  }));
}

/* ---------- Hộp thoại ---------- */
function openSettings() {
  $('#formSettings').token.value = store.token;
  if (!$('#dlgSettings').open) $('#dlgSettings').showModal();
}
const onOk = {
  async Settings(f) {
    store.token = f.token.value.trim();
    try {
      const r = await fetch('https://api.github.com/user', {headers: {Authorization: `Bearer ${store.token}`}});
      const u = await r.json();
      toast(r.ok ? `Đã đăng nhập: ${u.login}` : 'Mã GitHub không hợp lệ');
      route();
    } catch (e) { toast(e.message); }
  },
  async New(f) {
    const name = f.querySelector('[name=name]').value.trim();
    const tag = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
    try {
      await gh(`/repos/${REPO}/releases`, {method: 'POST', json: {tag_name: tag, target_commitish: 'main', name, body: bodyOf('new', f.note.value)}});
      f.reset();
      location.hash = `#/p/${encodeURIComponent(tag)}`;
    } catch (e) { toast(e.message); }
  },
};
for (const id of Object.keys(onOk)) {
  const f = $(`#form${id}`);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    $(`#dlg${id}`).close();
    if (e.submitter?.value !== 'cancel') onOk[id](f);
  });
}
$('#btnSettings').onclick = openSettings;

/* ---------- Điều hướng ---------- */
function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) renderProduct(decodeURIComponent(m[1]));
  else renderList();
}
window.addEventListener('hashchange', route);
if (!store.token) openSettings();
route();
