// Review Hub – dữ liệu ở Google Drive qua Worker tools-hub-api (Drive "Tools Hub/Review Video/<mã>/").
// Up file: Worker mở phiên upload, trình duyệt gửi thẳng lên Google (giữ nguyên chất lượng, tối đa 5 GB/file).
// Nhanh kiểu memories: giữ danh sách trong bộ nhớ (+ bản lưu trong trình duyệt để mở trang là hiện ngay),
// sửa/xoá/up xong chỉ thay đúng sản phẩm đó từ phản hồi, không tải lại cả trang.
const API = 'https://tools-hub-api.hoangpham2263.workers.dev';
// 3 trạng thái cho gọn. "editing" cũ coi như "Chờ edit".
const STATUS = {new: 'Chờ edit', done: 'Đã edit', posted: 'Đã đăng'};
const st = (p) => (STATUS[p.status] ? p.status : 'new');
const isVideo = (f) => /^video\//.test(f.mime || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
const isImage = (f) => /^image\//.test(f.mime || '') || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');


const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const size = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const r = await fetch(`${API}/api/review${path}`, {
    method: opts.method || 'GET',
    headers: {...(opts.json ? {'content-type': 'application/json'} : {})},
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Lỗi ${r.status}`);
  return d;
}

/* ---------- Dữ liệu trong bộ nhớ ---------- */
let items = null; // {slug: product}
const cache = {
  get() { try { return JSON.parse(localStorage.getItem('hub.items') || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem('hub.items', JSON.stringify(v)); } catch {} },
};
function put(p) { items[p.slug] = p; cache.set(items); }
async function load() {
  const next = Object.fromEntries((await api('')).map((p) => [p.slug, p]));
  const changed = JSON.stringify(next) !== JSON.stringify(items);
  items = next;
  cache.set(items);
  return changed;
}
// Quay lại tab: lấy thay đổi từ máy khác (tối đa 20 giây/lần)
let lastSync = Date.now();
window.addEventListener('focus', async () => {
  if (Date.now() - lastSync < 20000 || uploading) return;
  lastSync = Date.now();
  try { if (await load()) route(); } catch {}
});

const split = (p) => ({
  sources: (p.files || []).filter((f) => f.kind !== 'result'),
  results: (p.files || []).filter((f) => f.kind === 'result'),
});

// Tên dễ đọc cho file kết quả
const label = (f) => (f.kind === 'result' ? (isImage(f) ? 'Ảnh bìa' : 'Video review') : f.name);

/* ---------- Thẻ file ---------- */
function mediaCard(f, poster) {
  const media = isVideo(f) || isImage(f);
  return `<div class="card result">
    ${media ? `<button class="thumb" data-play="${esc(f.id)}" aria-label="Xem ${esc(f.name)}">
      ${isImage(f) ? `<img src="${esc(f.url)}" alt="" loading="lazy">` : (poster ? `<img src="${esc(poster)}" alt="" loading="lazy">` : `<span class="ext">${esc((f.name.split('.').pop() || '').toUpperCase())}</span>`)}
      <span class="play">${isVideo(f) ? '▶' : '⤢'}</span></button>` : ''}
    <div><div class="fname">${esc(label(f))}</div><div class="meta">${size(f.size)} · ${when(f.uploaded)}</div></div>
    <div class="row"><a class="btn small ${f.kind === 'result' ? 'primary' : ''}" href="${esc(f.download)}">Tải về</a><button class="small ghost danger" title="Xoá file" data-del="${esc(f.id)}" data-name="${esc(f.name)}">Xoá</button></div>
  </div>`;
}

function openPlayer(f) {
  const v = $('#playVideo'), im = $('#playImg');
  v.hidden = !isVideo(f); im.hidden = isVideo(f);
  $('#playName').textContent = label(f);
  $('#playDl').href = f.download;
  v.removeAttribute('src'); im.removeAttribute('src');
  $('#dlgPlay').showModal();
  if (isVideo(f)) { v.src = f.url; v.play().catch(() => {}); } else im.src = f.url;
}
$('#dlgPlay').addEventListener('close', () => { $('#playVideo').pause(); $('#playVideo').removeAttribute('src'); });

/* ---------- Up file thẳng lên Google Drive ---------- */
function putFile(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} x.status < 300 && d.id ? resolve(d) : reject(new Error(`Up lỗi ${x.status}`)); };
    x.onerror = () => reject(new Error('Mất kết nối'));
    x.send(file);
  });
}
let uploading = 0;
async function pool(list, limit, task) {
  let i = 0;
  const run = async () => { while (i < list.length) await task(list[i++]); };
  await Promise.all(Array.from({length: Math.min(limit, list.length)}, run));
}
async function uploadAll(p, files, kind) {
  const box = $(kind === 'result' ? '#upsResult' : '#ups');
  const done = [];
  uploading++;
  await pool(files, 3, async (f) => {
    const row = document.createElement('div');
    row.className = 'card file';
    row.innerHTML = `<div><div class="fname">${esc(f.name)}</div><div class="meta">${size(f.size)} · <span class="st">Đang up…</span></div><div class="bar"><i></i></div></div>`;
    box.append(row);
    const st = row.querySelector('.st'), bar = row.querySelector('.bar i');
    if ((p.files || []).some((x) => x.name === f.name && x.kind === kind)) { st.textContent = 'Đã có file trùng tên'; st.classList.add('danger'); return; }
    try {
      const {uploadUrl} = await api(`/${p.slug}/upload`, {method: 'POST', json: {name: f.name, size: f.size, mime: f.type || 'application/octet-stream', kind}});
      const d = await putFile(uploadUrl, f, (r) => (bar.style.width = `${Math.round(r * 100)}%`));
      done.push({...d, kind});
      st.textContent = 'Xong';
    } catch (e) { st.textContent = e.message; st.classList.add('danger'); }
  });
  uploading--;
  if (!done.length) return;
  try {
    put(await api(`/${p.slug}/files`, {method: 'POST', json: {items: done}}));
    toast(`Đã up ${done.length} file`);
    if (location.hash === `#/p/${encodeURIComponent(p.slug)}`) renderProduct(p.slug);
  } catch (e) { toast(e.message); }
}
function dropZone(el, input, onFiles) {
  input.onchange = () => onFiles([...input.files]);
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); onFiles([...e.dataTransfer.files]); };
}
const dropHtml = (id, text, big) => `<label class="drop ${big ? 'big' : ''}" id="${id}">
  <input type="file" multiple accept="video/*,image/*" hidden>
  <span class="drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg></span>
  <strong>${text}</strong>
  <span class="meta">Bấm để chọn video, hoặc kéo thả vào đây. Chọn được nhiều file. Giữ nguyên chất lượng, tối đa 5 GB/file.</span>
</label>`;

/* ---------- Trang danh sách ---------- */
let filter = 'all';
const isSample = (p) => p.type === 'sample';

function renderList() { renderListAsync(); }
async function renderListAsync() {
  app.innerHTML = `<div class="row between"><h1>Sản phẩm</h1><button class="primary" id="btnNew">+ Sản phẩm mới</button></div>
    <div class="tabs" id="tabs"></div><div class="list" id="list"><p class="empty">Đang tải…</p></div>`;
  $('#btnNew').onclick = () => openNew('product');
  if (!items) {
    try { await load(); } catch (e) { $('#list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  }
  const list = Object.values(items).filter((p) => !isSample(p)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const tabs = [['all', 'Tất cả'], ...Object.entries(STATUS)];
  const draw = () => {
    $('#tabs').innerHTML = tabs.map(([k, v]) => {
      const n = k === 'all' ? list.length : list.filter((i) => st(i) === k).length;
      return `<button data-k="${k}" aria-pressed="${filter === k}"><span class="k">${v}</span><span class="v">${n}</span></button>`;
    }).join('');
    $('#tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.k; draw(); }));
    const shown = list.filter((i) => filter === 'all' || st(i) === filter);
    $('#list').innerHTML = shown.length ? shown.map((p) => {
      const {sources, results} = split(p);
            return `<a class="card item" href="#/p/${encodeURIComponent(p.slug)}">
        <div class="row between"><span class="name">${esc(p.name)}</span><span class="badge s-${st(p)}">${STATUS[st(p)]}</span></div>
        <div class="meta">${sources.length ? `${sources.length} video quay` : 'Chưa có video quay'} · ${results.length ? `${results.length} file kết quả` : 'chưa có kết quả'} · cập nhật ${when(p.updatedAt)}</div>
      </a>`;
    }).join('') : `<p class="empty">${list.length ? 'Không có sản phẩm ở mục này.' : 'Chưa có sản phẩm nào. Bấm "+ Sản phẩm mới" để bắt đầu.'}</p>`;
  };
  draw();
}

/* ---------- Video mẫu ---------- */
async function renderSamples() {
  app.innerHTML = `<a class="back" href="#">← Sản phẩm</a>
    <h1>Hệ thống</h1>
    <section>
      <div class="row between"><div><h2>Video mẫu</h2><p class="meta" style="margin:2px 0 0">Video tham khảo để phân tích style dựng.</p></div><button class="primary small" id="btnNew">+ Mẫu mới</button></div>
      <div class="list" id="list"><p class="empty">Đang tải…</p></div>
    </section>
    <section>
      <h2>Lưu trữ</h2>
      <div class="card meta">Google Drive: <b>Tools Hub/Review Video/</b><br>· <b>Sản phẩm/</b>&lt;sản phẩm&gt;/Source, Kết quả<br>· <b>Video mẫu/</b>&lt;mẫu&gt;/</div>
    </section>`;
  $('#btnNew').onclick = () => openNew('sample');
  if (!items) {
    try { await load(); } catch (e) { $('#list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  }
  const list = Object.values(items).filter(isSample).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  $('#list').innerHTML = list.length ? list.map((p) => `<a class="card item" href="#/p/${encodeURIComponent(p.slug)}">
      <div class="name">${esc(p.name)}</div>
      <div class="meta">${(p.files || []).length} video · cập nhật ${when(p.updatedAt)}</div>
    </a>`).join('') : '<p class="empty">Chưa có video mẫu. Bấm "+ Mẫu mới" để thêm.</p>';
}

function renderSample(p) {
  const files = [...(p.files || [])].sort((a, b) => a.name.localeCompare(b.name));
  const byId = Object.fromEntries(files.map((f) => [f.id, f]));
  app.innerHTML = `
    <a class="back" href="#/he-thong">← Hệ thống</a>
    <div class="p-head">
      <div><h1>${esc(p.name)}</h1>${p.note ? `<p class="meta" style="margin:4px 0 0">${esc(p.note)}</p>` : ''}</div>
      <div class="p-actions">
        <button id="btnNote" class="small">Sửa ghi chú</button>
        <button id="btnDel" class="small danger btn-danger">Xoá</button>
      </div>
    </div>
    <section>
      ${dropHtml('drop', 'Up video mẫu', !files.length)}
      <div class="files" id="ups"></div>
      ${files.length ? `<div class="results">${files.map((f) => mediaCard(f)).join('')}</div>` : ''}
    </section>`;
  dropZone($('#drop'), $('#drop input'), (fs) => uploadAll(p, fs, 'source'));
  app.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => openPlayer(byId[b.dataset.play])));
  bindCommon(p, p.slug, '#/he-thong');
}

/* ---------- Trang chi tiết ---------- */
const tabOf = {}; // tab đang chọn của từng sản phẩm (giữ khi trang vẽ lại)
async function renderProduct(slug) {
  if (!items) {
    app.innerHTML = `<p class="empty">Đang tải…</p>`;
    try { await load(); } catch (e) { app.innerHTML = `<a class="back" href="#">← Danh sách</a><p class="empty">${esc(e.message)}</p>`; return; }
  }
  const p = items[slug];
  if (!p) { app.innerHTML = `<a class="back" href="#">← Danh sách</a><p class="empty">Không tìm thấy sản phẩm.</p>`; return; }
  if (isSample(p)) return renderSample(p);
  const {sources} = split(p);
  // Kết quả chỉ hiện bản mới nhất: 1 video + 1 ảnh bìa
  const newest = [...split(p).results].sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''));
  const results = [newest.find(isVideo), newest.find(isImage)].filter(Boolean);
  const tab = tabOf[slug] || 'source';
  const byId = Object.fromEntries((p.files || []).map((f) => [f.id, f]));

  app.innerHTML = `
    <a class="back" href="#">← Tất cả sản phẩm</a>
    <div class="p-head">
      <div><h1>${esc(p.name)}</h1>${p.note ? `<p class="meta" style="margin:4px 0 0">${esc(p.note)}</p>` : ''}</div>
      <div class="p-actions">
        <select id="status" class="small-select" aria-label="Trạng thái">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === st(p) ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button id="btnNote" class="small">Sửa ghi chú</button>
        <button id="btnDel" class="small danger btn-danger">Xoá</button>
      </div>
    </div>

    <div class="seg" role="tablist">
      <button role="tab" data-tab="source" aria-selected="${tab === 'source'}">Source <span>${sources.length}</span></button>
      <button role="tab" data-tab="result" aria-selected="${tab === 'result'}">Kết quả <span>${results.length}</span></button>
    </div>

    <section data-panel="result" ${tab === 'result' ? '' : 'hidden'}>
      ${results.length ? `<div class="results">${results.map((f) => mediaCard(f, isVideo(f) ? newest.find(isImage)?.url : '')).join('')}</div>` : '<p class="empty small">Chưa có kết quả.</p>'}
      ${dropHtml('dropResult', 'Up kết quả', false)}
      <div class="files" id="upsResult"></div>
    </section>

    <section data-panel="source" ${tab === 'source' ? '' : 'hidden'}>
      ${dropHtml('drop', 'Up source', !sources.length)}
      <div class="files" id="ups"></div>
      ${sources.length ? `<div class="results">${sources.map((f) => mediaCard(f)).join('')}</div>` : ''}
    </section>`;

  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    tabOf[slug] = b.dataset.tab;
    app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    app.querySelectorAll('[data-panel]').forEach((x) => (x.hidden = x.dataset.panel !== b.dataset.tab));
  }));

  dropZone($('#drop'), $('#drop input'), (fs) => uploadAll(p, fs, 'source'));
  dropZone($('#dropResult'), $('#dropResult input'), (fs) => uploadAll(p, fs, 'result'));
  app.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => openPlayer(byId[b.dataset.play])));
  // Video source không tải sẵn (29 file MOV nặng làm điện thoại giật), bấm vào mới phát

  $('#status').onchange = async (e) => {
    try { put(await api(`/${p.slug}`, {method: 'PATCH', json: {status: e.target.value}})); toast('Đã đổi trạng thái'); renderProduct(slug); } catch (er) { toast(er.message); }
  };
  bindCommon(p, slug, '');
}

/** Sửa ghi chú, xoá sản phẩm/mẫu, xoá file — dùng chung cho sản phẩm và video mẫu */
function bindCommon(p, slug, back) {
  const patch = (json) => api(`/${p.slug}`, {method: 'PATCH', json});
  $('#btnNote').onclick = async () => {
    const f = await ask('Note', (f) => { f.note.value = p.note || ''; });
    if (!f) return;
    try { put(await patch({note: f.note.value})); toast('Đã lưu ghi chú'); renderProduct(slug); } catch (er) { toast(er.message); }
  };
  $('#btnDel').onclick = async () => {
    if (!(await confirmDel(`Xoá "${p.name}"?`, 'Toàn bộ video vào thùng rác Google Drive, khôi phục được trong 30 ngày.'))) return;
    try { await api(`/${p.slug}`, {method: 'DELETE'}); delete items[p.slug]; cache.set(items); toast('Đã xoá'); location.hash = back; } catch (er) { toast(er.message); }
  };
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmDel('Xoá file này?', `${b.dataset.name} sẽ vào thùng rác Google Drive.`))) return;
    b.closest('.result').style.opacity = '.4';
    try { put(await api(`/${p.slug}/files/${b.dataset.del}`, {method: 'DELETE'})); toast('Đã xoá'); renderProduct(slug); }
    catch (er) { toast(er.message); }
  }));
}

/* ---------- Hộp thoại ---------- */
// Hộp thoại riêng thay cho prompt()/confirm() (trình duyệt trong Zalo/Messenger hay chặn 2 hàm đó)
function ask(id, setup) {
  const dlg = $(`#dlg${id}`), f = $(`#form${id}`);
  setup?.(f);
  return new Promise((resolve) => {
    let closed = false;
    const done = (ok) => {
      if (closed) return;
      if (ok && !f.reportValidity()) return;
      closed = true;
      document.activeElement?.blur?.();
      dlg.close();
      resolve(ok ? f : null);
    };
    f.onsubmit = (e) => { e.preventDefault(); done(true); }; // Enter trong ô nhập
    // Chạm trên điện thoại: xử lý ngay ở touchend (không chờ click, tránh lần chạm đầu chỉ để ẩn bàn phím)
    f.querySelectorAll('button[value]').forEach((b) => {
      const go = (e) => { e.preventDefault(); done(b.value !== 'cancel'); };
      b.onclick = go;
      b.ontouchend = go;
    });
    // Chạm ra ngoài popup thì đóng
    dlg.onclick = (e) => { if (e.target === dlg) done(false); };
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };
    dlg.showModal();
  });
}
const confirmDel = (title, text) => ask('Confirm', () => { $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; }).then(Boolean);

const onOk = {
  async New(f) {
    try {
      const name = f.querySelector('[name=name]').value.trim();
      toast('Đang tạo…');
      const p = await api('', {method: 'POST', json: {name, note: f.note.value, type: f.dataset.type || 'product'}});
      put(p);
      f.reset();
      toast(`Đã tạo "${p.name}"`);
      if (!location.hash.startsWith('#/p/')) route();
    } catch (e) { toast(e.message); }
  },
};
async function openNew(type = 'product') {
  const f = await ask('New', (f) => {
    f.reset();
    f.dataset.type = type;
    $('#dlgNew h2').textContent = type === 'sample' ? 'Video mẫu mới' : 'Sản phẩm mới';
    f.querySelector('[name=name]').placeholder = type === 'sample' ? 'Mẫu @thokunrw' : 'Dép sục phối màu ZUTANIQ';
  });
  if (f) onOk.New(f);
}

/* ---------- Điều hướng ---------- */
function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) renderProduct(decodeURIComponent(m[1]));
  else if (location.hash === '#/he-thong' || location.hash === '#/mau') renderSamples();
  else renderList();
}
window.addEventListener('hashchange', route);
items = cache.get();
route();
// Có bản lưu thì hiện ngay, rồi lấy bản mới nhất ở nền
if (items) load().then((changed) => changed && route()).catch(() => {});
