// Review Hub – dữ liệu ở Google Drive qua Worker tools-hub-api (Drive "Tools Hub/Review Video/<mã>/").
// Up file: Worker mở phiên upload, trình duyệt gửi thẳng lên Google (giữ nguyên chất lượng, tối đa 5 GB/file).
const API = 'https://tools-hub-api.hoangpham2263.workers.dev';
const STATUS = {new: 'Chờ dựng', editing: 'Đang dựng', done: 'Có kết quả', posted: 'Đã đăng'};
const isVideo = (f) => /^video\//.test(f.mime || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
const isImage = (f) => /^image\//.test(f.mime || '') || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const store = {
  get token() { try { return localStorage.getItem('hub.key') || ''; } catch { return ''; } },
  set token(v) { try { localStorage.setItem('hub.key', v); } catch {} },
};

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
  if (!store.token) { openSettings(); throw new Error('Chưa đăng nhập'); }
  const r = await fetch(`${API}/api/review${path}`, {
    method: opts.method || 'GET',
    headers: {'x-admin-key': store.token, ...(opts.json ? {'content-type': 'application/json'} : {})},
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { openSettings(); throw new Error('Sai mật khẩu'); }
  if (!r.ok) throw new Error(d.error || `Lỗi ${r.status}`);
  return d;
}

const split = (p) => ({
  sources: (p.files || []).filter((f) => f.kind !== 'result'),
  results: (p.files || []).filter((f) => f.kind === 'result'),
});

/* ---------- Thẻ file ---------- */
function mediaCard(f) {
  const media = isVideo(f) || isImage(f);
  return `<div class="card result">
    ${media ? `<button class="thumb" data-play="${esc(f.id)}" aria-label="Xem ${esc(f.name)}">
      ${isImage(f) ? `<img src="${esc(f.url)}" alt="" loading="lazy">` : `<video src="${esc(f.url)}#t=1" muted playsinline preload="metadata"></video>`}
      <span class="play">${isVideo(f) ? '▶' : '⤢'}</span></button>` : ''}
    <div><div class="fname">${esc(f.name)}</div><div class="meta">${size(f.size)} · ${when(f.uploaded)}</div></div>
    <div class="row"><a class="btn small" href="${esc(f.download)}">Tải về</a><button class="small ghost danger" data-del="${esc(f.id)}" data-name="${esc(f.name)}">Xoá</button></div>
  </div>`;
}

function openPlayer(f) {
  const v = $('#playVideo'), im = $('#playImg');
  v.hidden = !isVideo(f); im.hidden = isVideo(f);
  $('#playName').textContent = f.name;
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
async function uploadAll(p, files, kind) {
  const box = $(kind === 'result' ? '#upsResult' : '#ups');
  let ok = 0;
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'card file';
    row.innerHTML = `<div><div class="fname">${esc(f.name)}</div><div class="meta">${size(f.size)} · <span class="st">Đang up…</span></div><div class="bar"><i></i></div></div>`;
    box.append(row);
    const st = row.querySelector('.st'), bar = row.querySelector('.bar i');
    if ((p.files || []).some((x) => x.name === f.name && x.kind === kind)) { st.textContent = 'Đã có file trùng tên'; st.classList.add('danger'); continue; }
    try {
      const {uploadUrl} = await api(`/${p.slug}/upload`, {method: 'POST', json: {name: f.name, size: f.size, mime: f.type || 'application/octet-stream', kind}});
      const d = await putFile(uploadUrl, f, (r) => (bar.style.width = `${Math.round(r * 100)}%`));
      await api(`/${p.slug}/files`, {method: 'POST', json: {id: d.id, kind}});
      st.textContent = 'Xong';
      ok++;
    } catch (e) { st.textContent = e.message; st.classList.add('danger'); }
  }
  if (ok) { toast(`Đã up ${ok} file`); renderProduct(p.slug); }
}
function dropZone(el, input, onFiles) {
  input.onchange = () => onFiles([...input.files]);
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); onFiles([...e.dataTransfer.files]); };
}
const dropHtml = (id, text) => `<label class="drop" id="${id}" style="display:block;margin:0">
  <input type="file" multiple accept="video/*,image/*" hidden>
  <strong style="color:var(--foreground)">${text}</strong><br>
  <span class="meta">Bấm để chọn hoặc kéo thả. Giữ nguyên chất lượng gốc, tối đa 5 GB mỗi file. Dùng được trên điện thoại.</span>
</label>`;

/* ---------- Trang danh sách ---------- */
let filter = 'all';
async function renderList() {
  app.innerHTML = `<div class="row between"><div><h1>Sản phẩm</h1><p class="meta" style="margin:4px 0 0">Người quay up source, người dựng trả video kết quả.</p></div><button class="primary" id="btnNew">+ Sản phẩm mới</button></div>
    <div class="tabs" id="tabs"></div><div class="list" id="list"><p class="empty">Đang tải…</p></div>`;
  $('#btnNew').onclick = () => $('#dlgNew').showModal();
  let items = [];
  try { items = (await api('')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
  catch (e) { $('#list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const tabs = [['all', 'Tất cả'], ...Object.entries(STATUS)];
  const draw = () => {
    $('#tabs').innerHTML = tabs.map(([k, v]) => {
      const n = k === 'all' ? items.length : items.filter((i) => i.status === k).length;
      return `<button data-k="${k}" aria-pressed="${filter === k}"><span class="k">${v}</span><span class="v">${n}</span></button>`;
    }).join('');
    $('#tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.k; draw(); }));
    const shown = items.filter((i) => filter === 'all' || i.status === filter);
    $('#list').innerHTML = shown.length ? shown.map((p) => {
      const {sources, results} = split(p);
      const bytes = (p.files || []).reduce((s, a) => s + a.size, 0);
      return `<a class="card item" href="#/p/${encodeURIComponent(p.slug)}">
        <div class="row between"><span class="name">${esc(p.name)}</span><span class="badge s-${p.status}">${STATUS[p.status]}</span></div>
        <div class="meta">${sources.length} source · ${results.length} kết quả · ${size(bytes)} · ${when(p.updatedAt)}</div>
      </a>`;
    }).join('') : `<p class="empty">Chưa có sản phẩm nào.</p>`;
  };
  draw();
}

/* ---------- Trang chi tiết ---------- */
async function renderProduct(slug) {
  app.innerHTML = `<p class="empty">Đang tải…</p>`;
  let p;
  try { p = await api(`/${encodeURIComponent(slug)}`); }
  catch (e) { app.innerHTML = `<a class="back" href="#">← Danh sách</a><p class="empty">${esc(e.message)}</p>`; return; }
  const {sources, results} = split(p);
  const byId = Object.fromEntries((p.files || []).map((f) => [f.id, f]));

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
        <button id="btnDel" class="small ghost danger">Xoá sản phẩm</button>
      </div>
    </div>

    <section>
      <h2>Video kết quả (${results.length})</h2>
      ${results.length ? `<div class="results">${results.map(mediaCard).join('')}</div>` : '<p class="meta">Chưa có video kết quả.</p>'}
      <details><summary class="meta" style="cursor:pointer">Up video kết quả</summary><div style="margin-top:8px">${dropHtml('dropResult', 'Up video kết quả')}</div></details>
      <div class="files" id="upsResult"></div>
    </section>

    <section>
      <h2>Source (${sources.length})</h2>
      ${dropHtml('drop', 'Up source (video quay)')}
      <div class="files" id="ups"></div>
      ${sources.length ? `<div class="results">${sources.map(mediaCard).join('')}</div>` : ''}
    </section>`;

  dropZone($('#drop'), $('#drop input'), (fs) => uploadAll(p, fs, 'source'));
  dropZone($('#dropResult'), $('#dropResult input'), (fs) => uploadAll(p, fs, 'result'));
  app.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => openPlayer(byId[b.dataset.play])));

  const patch = (json) => api(`/${p.slug}`, {method: 'PATCH', json});
  $('#status').onchange = async (e) => {
    try { await patch({status: e.target.value}); toast('Đã đổi trạng thái'); renderProduct(slug); } catch (er) { toast(er.message); }
  };
  $('#btnNote').onclick = async () => {
    const note = prompt('Ghi chú cho người dựng', p.note || '');
    if (note === null) return;
    try { await patch({note}); renderProduct(slug); } catch (er) { toast(er.message); }
  };
  $('#btnDel').onclick = async () => {
    if (!confirm(`Xoá "${p.name}" cùng toàn bộ source và video? File vào thùng rác Google Drive, khôi phục được trong 30 ngày.`)) return;
    try { await api(`/${p.slug}`, {method: 'DELETE'}); toast('Đã xoá'); location.hash = ''; } catch (er) { toast(er.message); }
  };
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Xoá file "${b.dataset.name}"? File vào thùng rác Google Drive.`)) return;
    try { await api(`/${p.slug}/files/${b.dataset.del}`, {method: 'DELETE'}); toast('Đã xoá'); renderProduct(slug); }
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
    try { await api(''); toast('Đã đăng nhập'); route(); } catch (e) { toast(e.message); }
  },
  async New(f) {
    try {
      const p = await api('', {method: 'POST', json: {name: f.querySelector('[name=name]').value.trim(), note: f.note.value}});
      f.reset();
      location.hash = `#/p/${encodeURIComponent(p.slug)}`;
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
