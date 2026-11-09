// Lấy link phát tạm (hết hạn ~1 giờ) cho file trong Release của repo dữ liệu riêng tư.
// Trình duyệt không tự đọc được link này vì GitHub không bật CORS cho bước chuyển hướng.
// Không lưu gì; token người dùng chỉ được chuyển tiếp tới api.github.com.
const REPO = 'hoangpham2263/review-video-sources';
const ORIGINS = ['https://hoangpham.is-a.dev', 'http://localhost:8000', 'http://127.0.0.1:8000'];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
    const json = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'};
    const url0 = new URL(req.url);
    // Up file: POST /upload/<releaseId>?name=<tên file>, body = nội dung file (tối đa 100 MB/lần do giới hạn Cloudflare)
    const up = url0.pathname.match(/^\/upload\/(\d+)$/);
    if (up && req.method === 'POST') {
      const auth = req.headers.get('Authorization');
      const name = url0.searchParams.get('name');
      const len = Number(req.headers.get('Content-Length'));
      if (!auth || !name || !len) return new Response(JSON.stringify({error: 'Thiếu thông tin'}), {status: 400, headers: {...cors, ...json}});
      const {readable, writable} = new FixedLengthStream(len);
      req.body.pipeTo(writable);
      const r = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${up[1]}/assets?name=${encodeURIComponent(name)}`, {
        method: 'POST', body: readable,
        headers: {Authorization: auth, Accept: 'application/vnd.github+json', 'Content-Type': req.headers.get('Content-Type') || 'application/octet-stream', 'User-Agent': 'review-hub'},
      });
      const d = await r.json().catch(() => ({}));
      const dup = (d.errors || []).some((e) => e.code === 'already_exists');
      const msg = dup ? 'Trùng tên file đã có' : [d.message, JSON.stringify(d.errors || '')].join(' ');
      return new Response(JSON.stringify(r.ok ? {id: d.id, name: d.name} : {error: msg || `GitHub ${r.status}`}), {status: r.status, headers: {...cors, ...json}});
    }
    const m = new URL(req.url).pathname.match(/^\/asset\/(\d+)$/);
    const auth = req.headers.get('Authorization');
    if (!m || !auth) return new Response('Bad request', {status: 400, headers: cors});
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${m[1]}`, {
      redirect: 'manual',
      headers: {Authorization: auth, Accept: 'application/octet-stream', 'User-Agent': 'review-hub'},
    });
    const url = r.headers.get('Location');
    if (!url) return new Response(JSON.stringify({error: `GitHub ${r.status}`}), {status: r.status >= 400 ? r.status : 502, headers: {...cors, ...json}});
    return new Response(JSON.stringify({url}), {headers: {...cors, ...json}});
  },
};
