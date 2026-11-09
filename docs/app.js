// Review Hub – dữ liệu ở Google Drive qua Worker tools-hub-api (Drive "Tools Hub/Review Video/<mã>/").
// Up file: Worker mở phiên upload, trình duyệt gửi thẳng lên Google (giữ nguyên chất lượng, tối đa 5 GB/file).
const API = 'https://tools-hub-api.hoangpham2263.workers.dev';
const STATUS = {new: 'Chờ dựng', editing: 'Đang dựng', done: 'Có kết quả', posted: 'Đã đăng'};
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

const split = (p) => ({
  sources: (p.files || []).filter((f) => f.kind !== 'result'),
  results: (p.files || []).filter((f) => f.kind === 'result'),
});

const STEPS = [
  ['new', 'Up source', 'Người quay up video'],
  ['editing', 'Đang dựng', 'Người dựng làm video'],
  ['done', 'Có video', 'Xem và tải về'],
  ['posted', 'Đã đăng', 'Xong'],
];
const NEXT = {
  new: (p) => split(p).sources.length
    ? ['Đã có source, chờ người dựng làm video.', 'Có thể up thêm source nếu còn cảnh muốn thêm.']
    : ['Cần up video quay sản phẩm.', 'Bấm vào ô "Up source" bên dưới, chọn video trong máy hoặc điện thoại.'],
  editing: () => ['Người dựng đang làm video.', 'Khi xong, video sẽ hiện ở mục "Video kết quả".'],
  done: () => ['Video đã xong. Bấm vào video để xem, bấm "Tải về" để lấy về đăng.', 'Đăng xong thì bấm "Đánh dấu đã đăng".'],
  posted: () => ['Sản phẩm này đã đăng xong.', ''],
};
function stepper(status) {
  const cur = STEPS.findIndex(([k]) => k === status);
  return `<ol class="steps">${STEPS.map(([k, t, d], i) => `<li class="${i < cur ? 'past' : i === cur ? 'now' : ''}" data-step="${k}">
    <span class="dot">${i < cur ? '✓' : i + 1}</span><span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ol>`;
}
// Tên dễ đọc cho file kết quả
const label = (f) => (f.kind === 'result' ? (isImage(f) ? 'Ảnh bìa' : 'Video review') : f.name);

/* ---------- Thẻ file ---------- */
function mediaCard(f) {
  const media = isVideo(f) || isImage(f);
  return `<div class="card result">
    ${media ? `<button class="thumb" data-play="${esc(f.id)}" aria-label="Xem ${esc(f.name)}">
      ${isImage(f) ? `<img src="${esc(f.url)}" alt="" loading="lazy">` : `<video src="${esc(f.url)}#t=1" muted playsinline preload="metadata"></video>`}
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
const dropHtml = (id, text, big) => `<label class="drop ${big ? 'big' : ''}" id="${id}">
  <input type="file" multiple accept="video/*,image/*" hidden>
  <span class="drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg></span>
  <strong>${text}</strong>
  <span class="meta">Bấm để chọn video, hoặc kéo thả vào đây. Chọn được nhiều file. Giữ nguyên chất lượng, tối đa 5 GB/file.</span>
</label>`;

/* ---------- Trang danh sách ---------- */
let filter = 'all';
async function renderList() {
  app.innerHTML = `<div class="row between"><div><h1>Sản phẩm</h1><p class="meta" style="margin:4px 0 0">Mỗi sản phẩm là một video cần làm.</p></div><button class="primary" id="btnNew">+ Sản phẩm mới</button></div>
    <details class="card guide" id="guide"><summary><b>Cách dùng</b> <span class="meta">(3 bước)</span></summary>
      <ol class="guide-steps">
        <li><b>Tạo sản phẩm</b><span>Bấm "+ Sản phẩm mới", nhập tên và ghi chú (màu, thương hiệu, deal).</span></li>
        <li><b>Up video quay</b><span>Mở sản phẩm, bấm ô "Up source", chọn video từ máy hoặc điện thoại.</span></li>
        <li><b>Lấy video về đăng</b><span>Khi trạng thái là "Có kết quả", mở sản phẩm, xem rồi bấm "Tải về".</span></li>
      </ol></details>
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
            return `<a class="card item" href="#/p/${encodeURIComponent(p.slug)}">
        <div class="row between"><span class="name">${esc(p.name)}</span><span class="badge s-${p.status}">${STATUS[p.status]}</span></div>
        <div class="meta">${sources.length ? `${sources.length} video quay` : 'Chưa có video quay'} · ${results.length ? `${results.length} file kết quả` : 'chưa có kết quả'} · cập nhật ${when(p.updatedAt)}</div>
      </a>`;
    }).join('') : `<p class="empty">${items.length ? 'Không có sản phẩm ở mục này.' : 'Chưa có sản phẩm nào. Bấm "+ Sản phẩm mới" để bắt đầu.'}</p>`;
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

  const [nextT, nextD] = NEXT[p.status](p);
  app.innerHTML = `
    <a class="back" href="#">← Tất cả sản phẩm</a>
    <div class="row between"><h1>${esc(p.name)}</h1><span class="badge s-${p.status}">${STATUS[p.status]}</span></div>
    ${stepper(p.status)}
    <div class="card next"><b>Việc cần làm tiếp:</b> ${esc(nextT)}${nextD ? `<div class="meta">${esc(nextD)}</div>` : ''}
      ${p.status === 'done' ? '<div class="row" style="margin-top:10px"><button class="primary small" id="btnPosted">Đánh dấu đã đăng</button></div>' : ''}</div>

    <section>
      <h2>Video kết quả</h2>
      ${results.length ? `<div class="results">${results.map(mediaCard).join('')}</div>` : '<p class="empty small">Chưa có video. Người dựng làm xong sẽ hiện ở đây.</p>'}
    </section>

    <section>
      <div class="row between"><h2>Video quay (source)</h2><span class="meta">${sources.length} file</span></div>
      ${dropHtml('drop', 'Up source', !sources.length)}
      <div class="files" id="ups"></div>
      ${sources.length ? `<div class="results">${sources.map(mediaCard).join('')}</div>` : ''}
    </section>

    <details class="card more"><summary><b>Thông tin và cài đặt</b></summary>
      <div class="meta" style="margin-top:10px">Mã: ${esc(p.slug)} · tạo ${when(p.createdAt)}</div>
      <p class="note">${p.note ? esc(p.note) : '<span class="meta">Chưa có ghi chú.</span>'}</p>
      <div class="row" style="margin-top:10px">
        <label style="margin:0;flex:1;min-width:160px"><span class="meta">Trạng thái</span>
          <select id="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
      </div>
      <div class="row" style="margin-top:10px">
        <button id="btnNote" class="small">Sửa ghi chú</button>
        <button id="btnDel" class="small ghost danger">Xoá sản phẩm</button>
      </div>
      <div style="margin-top:14px">${dropHtml('dropResult', 'Up video kết quả (cho người dựng)')}</div>
      <div class="files" id="upsResult"></div>
    </details>`;

  dropZone($('#drop'), $('#drop input'), (fs) => uploadAll(p, fs, 'source'));
  dropZone($('#dropResult'), $('#dropResult input'), (fs) => uploadAll(p, fs, 'result'));
  app.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => openPlayer(byId[b.dataset.play])));

  const patch = (json) => api(`/${p.slug}`, {method: 'PATCH', json});
  if ($('#btnPosted')) $('#btnPosted').onclick = async () => { try { await patch({status: 'posted'}); toast('Đã đánh dấu đã đăng'); renderProduct(slug); } catch (er) { toast(er.message); } };
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
const onOk = {
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

/* ---------- Điều hướng ---------- */
function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) renderProduct(decodeURIComponent(m[1]));
  else renderList();
}
window.addEventListener('hashchange', route);
route();
