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
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
    const m = new URL(req.url).pathname.match(/^\/asset\/(\d+)$/);
    const auth = req.headers.get('Authorization');
    if (!m || !auth) return new Response('Bad request', {status: 400, headers: cors});
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${m[1]}`, {
      redirect: 'manual',
      headers: {Authorization: auth, Accept: 'application/octet-stream', 'User-Agent': 'review-hub'},
    });
    const url = r.headers.get('Location');
    const json = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'};
    if (!url) return new Response(JSON.stringify({error: `GitHub ${r.status}`}), {status: r.status >= 400 ? r.status : 502, headers: {...cors, ...json}});
    return new Response(JSON.stringify({url}), {headers: {...cors, ...json}});
  },
};
