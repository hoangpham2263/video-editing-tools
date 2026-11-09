// Review Hub – giao diện (GitHub Pages) gọi Worker API
const STATUS = {
  new: 'Chờ dựng',
  editing: 'Đang dựng',
  done: 'Có kết quả',
  posted: 'Đã đăng',
};
const PART = 50 * 1024 * 1024; // mỗi phần tải lên 50MB (giới hạn Worker 100MB/request)
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');

const cfg = {
  get url() { try { return (localStorage.getItem('hub.url') || window.HUB_DEFAULT_URL || '').replace(/\/+$/, ''); } catch { return window.HUB_DEFAULT_URL || ''; } },
  get key() { try { return localStorage.getItem('hub.key') || ''; } catch { return ''; } },
  save(url, key) { try { localStorage.setItem('hub.url', url); localStorage.setItem('hub.key', key); } catch {} },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const size = (b) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
const when = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', {dateStyle: 'short', timeStyle: 'short'}) : '');
const isVideo = (n) => /\.(mp4|mov|m4v|webm)$/i.test(n);
const isImage = (n) => /\.(png|jpe?g|webp|heic|gif)$/i.test(n);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  if (!cfg.url || !cfg.key) { openSettings(); throw new Error('Chưa kết nối'); }
  const r = await fetch(cfg.url + path, {
    ...opts,
    headers: {Authorization: `Bearer ${cfg.key}`, ...(opts.json ? {'Content-Type': 'application/json'} : {}), ...(opts.headers || {})},
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { openSettings(); throw new Error('Sai mã truy cập'); }
  if (!r.ok) throw new Error(data.error || `Lỗi ${r.status}`);
  return data;
}

const signed = (slug, kind, name) => api('/api/sign', {method: 'POST', json: {slug, kind, name}}).then((d) => d.url);

/** Tải 1 file lên theo từng phần, báo tiến độ qua onProgress(0..1) */
async function uploadFile(slug, kind, file, onProgress) {
  const base = `/api/upload/${slug}/${kind}/${encodeURIComponent(file.name)}`;
  const {uploadId} = await api(`${base}?action=create&type=${encodeURIComponent(file.type || 'application/octet-stream')}`, {method: 'POST'});
  const parts = [];
  try {
    const n = Math.max(1, Math.ceil(file.size / PART));
    for (let i = 0; i < n; i++) {
      const blob = file.slice(i * PART, Math.min(file.size, (i + 1) * PART));
      let done = false, tries = 0;
      while (!done) {
        try {
          const p = await putWithProgress(`${cfg.url}${base}?action=part&uploadId=${encodeURIComponent(uploadId)}&part=${i + 1}`, blob,
            (loaded) => onProgress((i * PART + loaded) / file.size));
          parts.push(p);
          done = true;
        } catch (e) {
          if (++tries >= 3) throw e;
          await new Promise((r) => setTimeout(r, 1500 * tries));
        }
      }
    }
    await api(`${base}?action=complete`, {method: 'POST', json: {uploadId, parts}});
    onProgress(1);
  } catch (e) {
    api(`${base}?action=abort&uploadId=${encodeURIComponent(uploadId)}`, {method: 'DELETE'}).catch(() => {});
    throw e;
  }
}

function putWithProgress(url, blob, onLoaded) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Authorization', `Bearer ${cfg.key}`);
    x.upload.onprogress = (e) => onLoaded(e.loaded);
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(`Lỗi tải lên ${x.status}`)));
    x.onerror = () => reject(new Error('Mất kết nối khi tải lên'));
    x.send(blob);
  });
}

/* ---------- Trang danh sách ---------- */
let filter = 'all';
async function renderList() {
  app.innerHTML = `<div class="row between"><div><h1>Sản phẩm</h1><p class="meta" style="margin:4px 0 0">Người quay up source, người dựng trả video kết quả.</p></div><button class="primary" id="btnNew">+ Sản phẩm mới</button></div>
    <div class="tabs" id="tabs"></div><div class="list" id="list"><p class="empty">Đang tải…</p></div>`;
  $('#btnNew').onclick = () => $('#dlgNew').showModal();
  let items = [];
  try { items = await api('/api/products'); } catch (e) { $('#list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const tabs = [['all', 'Tất cả'], ...Object.entries(STATUS)];
  const draw = () => {
    $('#tabs').innerHTML = tabs.map(([k, v]) => {
      const n = k === 'all' ? items.length : items.filter((i) => i.status === k).length;
      return `<button data-k="${k}" aria-pressed="${filter === k}"><span class="k">${v}</span><span class="v">${n}</span></button>`;
    }).join('');
    $('#tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.k; draw(); }));
    const shown = items.filter((i) => filter === 'all' || i.status === filter);
    $('#list').innerHTML = shown.length ? shown.map((p) => `
      <a class="card item" href="#/p/${encodeURIComponent(p.slug)}">
        <div class="row between"><span class="name">${esc(p.name)}</span><span class="badge s-${p.status}">${STATUS[p.status] || p.status}</span></div>
        <div class="meta">${p.counts.source} source · ${p.counts.result} video kết quả · ${size(p.counts.bytes)} · ${when(p.updatedAt)}</div>
      </a>`).join('') : `<p class="empty">Chưa có sản phẩm nào.</p>`;
  };
  draw();
}

/* ---------- Trang chi tiết ---------- */
async function renderProduct(slug) {
  app.innerHTML = `<p class="empty">Đang tải…</p>`;
  let p;
  try { p = await api(`/api/products/${slug}`); } catch (e) { app.innerHTML = `<a class="back" href="#">← Danh sách</a><p class="empty">${esc(e.message)}</p>`; return; }

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
        <button id="btnNote" class="ghost small">Sửa ghi chú</button>
        <button id="btnDel" class="ghost small danger">Xoá sản phẩm</button>
      </div>
    </div>

    <section>
      <div class="row between"><h2>Video kết quả (${p.files.result.length})</h2>
        <button class="small" data-pick="result">+ Tải kết quả lên</button></div>
      <div class="results" id="results">${p.files.result.length ? '' : '<p class="meta">Chưa có video kết quả.</p>'}</div>
      <div class="files" id="up-result"></div>
    </section>

    <section>
      <div class="row between"><h2>Source (${p.files.source.length})</h2>
        <button class="small ghost" id="btnAllSrc" ${p.files.source.length ? '' : 'disabled'}>Tải tất cả</button></div>
      <div class="drop" id="drop">Chọn hoặc kéo thả video/ảnh quay sản phẩm vào đây<br><span class="meta">Có thể chọn nhiều file, file lớn vẫn được</span></div>
      <div class="files" id="up-source"></div>
      <div class="files" id="sources"></div>
    </section>
    <input type="file" id="pick" multiple hidden accept="video/*,image/*">`;

  $('#status').onchange = async (e) => {
    try { await api(`/api/products/${slug}`, {method: 'PATCH', json: {status: e.target.value}}); toast('Đã đổi trạng thái'); } catch (er) { toast(er.message); }
  };
  $('#btnNote').onclick = async () => {
    const note = prompt('Ghi chú cho người dựng', p.note || '');
    if (note === null) return;
    await api(`/api/products/${slug}`, {method: 'PATCH', json: {note}});
    renderProduct(slug);
  };
  $('#btnDel').onclick = async () => {
    if (!confirm(`Xoá hẳn "${p.name}" cùng toàn bộ source và video? Không khôi phục được.`)) return;
    await api(`/api/products/${slug}`, {method: 'DELETE'});
    toast('Đã xoá');
    location.hash = '';
  };

  // Kết quả: xem trước + tải về
  const results = $('#results');
  for (const f of p.files.result) {
    const card = document.createElement('div');
    card.className = 'card result';
    card.innerHTML = `<div class="ph" style="aspect-ratio:9/16;border-radius:10px;background:var(--line)"></div>
      <div class="fname meta" style="margin-top:6px;word-break:break-all">${esc(f.name)} · ${size(f.size)}</div>
      <div class="row"><a class="btn primary small" data-dl>Tải về</a><button class="small ghost danger" data-del>Xoá</button></div>`;
    results.append(card);
    signed(slug, 'result', f.name).then((url) => {
      const ph = card.querySelector('.ph');
      if (isVideo(f.name)) ph.outerHTML = `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`;
      else if (isImage(f.name)) ph.outerHTML = `<img src="${esc(url)}" alt="${esc(f.name)}" loading="lazy">`;
      card.querySelector('[data-dl]').href = url;
    });
    card.querySelector('[data-del]').onclick = () => delFile(slug, 'result', f.name);
  }

  // Source: danh sách
  $('#sources').innerHTML = p.files.source.map((f, i) => `
    <div class="card file"><div><div class="fname">${esc(f.name)}</div><div class="meta">${size(f.size)} · ${when(f.uploaded)}</div></div>
    <div class="row"><button class="small" data-i="${i}" data-act="dl">Tải</button><button class="small ghost danger" data-i="${i}" data-act="del">Xoá</button></div></div>`).join('');
  $('#sources').querySelectorAll('button').forEach((b) => {
    const f = p.files.source[b.dataset.i];
    b.onclick = async () => (b.dataset.act === 'dl' ? (location.href = await signed(slug, 'source', f.name)) : delFile(slug, 'source', f.name));
  });
  $('#btnAllSrc').onclick = async () => {
    for (const f of p.files.source) {
      const a = Object.assign(document.createElement('a'), {href: await signed(slug, 'source', f.name), download: f.name});
      document.body.append(a); a.click(); a.remove();
      await new Promise((r) => setTimeout(r, 800));
    }
  };

  // Tải lên
  let pickKind = 'source';
  const pick = $('#pick');
  const startUpload = async (files, kind) => {
    const box = $(`#up-${kind}`);
    for (const file of files) {
      const row = document.createElement('div');
      row.className = 'card file';
      row.innerHTML = `<div><div class="fname">${esc(file.name)}</div><div class="meta"><span>0%</span> · ${size(file.size)}</div><div class="bar"><i></i></div></div><span></span>`;
      box.append(row);
      try {
        await uploadFile(slug, kind, file, (r) => {
          row.querySelector('.bar i').style.width = `${Math.round(r * 100)}%`;
          row.querySelector('.meta span').textContent = `${Math.round(r * 100)}%`;
        });
        row.lastElementChild.textContent = '✓';
      } catch (e) {
        row.lastElementChild.textContent = 'Lỗi';
        toast(`${file.name}: ${e.message}`);
      }
    }
    toast('Tải lên xong');
    renderProduct(slug);
  };
  $('#drop').onclick = () => { pickKind = 'source'; pick.click(); };
  document.querySelector('[data-pick="result"]').onclick = () => { pickKind = 'result'; pick.click(); };
  pick.onchange = () => { if (pick.files.length) startUpload([...pick.files], pickKind); pick.value = ''; };
  const drop = $('#drop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); startUpload([...e.dataTransfer.files], 'source'); };
}

async function delFile(slug, kind, name) {
  if (!confirm(`Xoá file "${name}"? Không khôi phục được.`)) return;
  try { await api(`/api/products/${slug}/${kind}/${encodeURIComponent(name)}`, {method: 'DELETE'}); toast('Đã xoá'); renderProduct(slug); } catch (e) { toast(e.message); }
}

/* ---------- Hộp thoại ---------- */
function openSettings() {
  const f = $('#formSettings');
  f.url.value = cfg.url;
  f.key.value = cfg.key;
  if (!$('#dlgSettings').open) $('#dlgSettings').showModal();
}
// Bấm nút chính hoặc Enter: xử lý luôn (không chờ sự kiện "close" vì có trình duyệt gửi trễ)
const onOk = {
  async Settings(f) {
    cfg.save(f.url.value.trim().replace(/\/+$/, ''), f.key.value.trim());
    try { await api('/api/ping'); toast('Đã kết nối'); route(); } catch (e) { toast(e.message); }
  },
  async New(f) {
    try {
      const p = await api('/api/products', {method: 'POST', json: {name: f.querySelector('[name=name]').value, note: f.note.value}});
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
if (!cfg.url || !cfg.key) openSettings();
route();
