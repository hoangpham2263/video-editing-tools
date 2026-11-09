// Review Hub API – Cloudflare Worker + R2
// Lưu theo sản phẩm: p/<slug>/meta.json, p/<slug>/source/<file>, p/<slug>/result/<file>
// Xác thực: header "Authorization: Bearer <HUB_KEY>". Link tải dùng chữ ký có hạn (?exp=&sig=).

const KINDS = ['source', 'result'];
const STATUSES = ['new', 'editing', 'done', 'posted'];
const LINK_TTL = 6 * 3600; // giây

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {status, headers: {...cors, 'Content-Type': 'application/json; charset=utf-8'}});
const err = (msg, status = 400) => json({error: msg}, status);

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'san-pham';

const safeName = (s) => {
  const n = decodeURIComponent(s).replace(/[\\/\u0000-\u001f]/g, '_').trim();
  if (!n || n === '.' || n === '..' || n.length > 200) throw new Error('Tên file không hợp lệ');
  return n;
};

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const authed = (req, env) => {
  const h = req.headers.get('Authorization') || '';
  return !!env.HUB_KEY && timingSafeEqual(h, `Bearer ${env.HUB_KEY}`);
};

async function getMeta(env, slug) {
  const o = await env.BUCKET.get(`p/${slug}/meta.json`);
  return o ? o.json() : null;
}
const putMeta = (env, m) =>
  env.BUCKET.put(`p/${m.slug}/meta.json`, JSON.stringify(m), {httpMetadata: {contentType: 'application/json'}});

async function listAll(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.BUCKET.list({prefix, cursor});
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function productList(env) {
  const objs = await listAll(env, 'p/');
  const by = {};
  for (const o of objs) {
    const [, slug, kind] = o.key.split('/');
    by[slug] ??= {source: 0, result: 0, bytes: 0};
    if (KINDS.includes(kind)) { by[slug][kind]++; by[slug].bytes += o.size; }
  }
  const metas = await Promise.all(Object.keys(by).map((s) => getMeta(env, s)));
  return metas.filter(Boolean).map((m) => ({...m, counts: by[m.slug]}))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function productDetail(env, slug) {
  const meta = await getMeta(env, slug);
  if (!meta) return null;
  const objs = await listAll(env, `p/${slug}/`);
  const files = {source: [], result: []};
  for (const o of objs) {
    const [, , kind, ...rest] = o.key.split('/');
    if (KINDS.includes(kind)) files[kind].push({name: rest.join('/'), size: o.size, uploaded: o.uploaded});
  }
  for (const k of KINDS) files[k].sort((a, b) => a.name.localeCompare(b.name));
  return {...meta, files};
}

const touch = async (env, slug, patch = {}) => {
  const m = await getMeta(env, slug);
  if (m) await putMeta(env, {...m, ...patch, updatedAt: new Date().toISOString()});
};

async function serveFile(req, env, key, name) {
  const range = req.headers.get('Range');
  const obj = await env.BUCKET.get(key, range ? {range: req.headers} : {});
  if (!obj) return err('Không tìm thấy file', 404);
  const h = new Headers(cors);
  obj.writeHttpMetadata(h);
  h.set('ETag', obj.httpEtag);
  h.set('Accept-Ranges', 'bytes');
  h.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  if (range && obj.range) {
    const {offset = 0, length = obj.size - offset} = obj.range;
    h.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    h.set('Content-Length', String(length));
    return new Response(obj.body, {status: 206, headers: h});
  }
  h.set('Content-Length', String(obj.size));
  return new Response(obj.body, {headers: h});
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean); // ["api", ...]
    if (parts[0] !== 'api') return json({ok: true, name: 'review-hub'});
    const [, res, slug, kind, ...rest] = parts;

    try {
      // Tải file bằng link có chữ ký (không cần header, dùng được cho thẻ <a>/<video>)
      if (res === 'file' && req.method === 'GET') {
        if (!KINDS.includes(kind)) return err('Sai loại file');
        const name = safeName(rest.join('/'));
        const key = `p/${slug}/${kind}/${name}`;
        const exp = Number(url.searchParams.get('exp'));
        const sig = url.searchParams.get('sig') || '';
        if (!exp || exp < Date.now() / 1000) return err('Link đã hết hạn', 403);
        if (!timingSafeEqual(sig, await hmac(env.HUB_KEY, `${key}|${exp}`))) return err('Sai chữ ký', 403);
        return serveFile(req, env, key, name);
      }

      if (!authed(req, env)) return err('Sai mã truy cập', 401);

      if (res === 'ping') return json({ok: true});

      if (res === 'products' && !slug) {
        if (req.method === 'GET') return json(await productList(env));
        if (req.method === 'POST') {
          const {name, note = ''} = await req.json();
          if (!name?.trim()) return err('Thiếu tên sản phẩm');
          const s = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
          const now = new Date().toISOString();
          const m = {slug: s, name: name.trim(), note: String(note).slice(0, 2000), status: 'new', createdAt: now, updatedAt: now};
          await putMeta(env, m);
          return json(m, 201);
        }
      }

      if (res === 'products' && slug && !kind) {
        if (req.method === 'GET') {
          const d = await productDetail(env, slug);
          return d ? json(d) : err('Không có sản phẩm này', 404);
        }
        if (req.method === 'PATCH') {
          const m = await getMeta(env, slug);
          if (!m) return err('Không có sản phẩm này', 404);
          const b = await req.json();
          if (b.status && !STATUSES.includes(b.status)) return err('Sai trạng thái');
          const next = {...m, updatedAt: new Date().toISOString()};
          for (const k of ['name', 'note', 'status']) if (typeof b[k] === 'string') next[k] = b[k].slice(0, 2000);
          await putMeta(env, next);
          return json(next);
        }
        if (req.method === 'DELETE') {
          const objs = await listAll(env, `p/${slug}/`);
          for (let i = 0; i < objs.length; i += 1000) await env.BUCKET.delete(objs.slice(i, i + 1000).map((o) => o.key));
          return json({ok: true, deleted: objs.length});
        }
      }

      // Xoá 1 file
      if (res === 'products' && slug && KINDS.includes(kind) && req.method === 'DELETE') {
        await env.BUCKET.delete(`p/${slug}/${kind}/${safeName(rest.join('/'))}`);
        await touch(env, slug);
        return json({ok: true});
      }

      // Tạo link tải có chữ ký
      if (res === 'sign' && req.method === 'POST') {
        const b = await req.json();
        if (!KINDS.includes(b.kind)) return err('Sai loại file');
        const name = safeName(encodeURIComponent(b.name));
        const key = `p/${b.slug}/${b.kind}/${name}`;
        const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
        const sig = await hmac(env.HUB_KEY, `${key}|${exp}`);
        const path = `/api/file/${b.slug}/${b.kind}/${encodeURIComponent(name)}`;
        return json({url: `${url.origin}${path}?exp=${exp}&sig=${sig}`, exp});
      }

      // Tải lên nhiều phần (file lớn): create → part (mỗi phần ≤ 90MB) → complete
      if (res === 'upload' && slug && KINDS.includes(kind)) {
        if (!(await getMeta(env, slug))) return err('Không có sản phẩm này', 404);
        const name = safeName(rest.join('/'));
        const key = `p/${slug}/${kind}/${name}`;
        const action = url.searchParams.get('action');
        if (req.method === 'POST' && action === 'create') {
          const type = url.searchParams.get('type') || 'application/octet-stream';
          const up = await env.BUCKET.createMultipartUpload(key, {httpMetadata: {contentType: type}});
          return json({uploadId: up.uploadId, key});
        }
        if (req.method === 'PUT' && action === 'part') {
          const up = env.BUCKET.resumeMultipartUpload(key, url.searchParams.get('uploadId'));
          const part = await up.uploadPart(Number(url.searchParams.get('part')), req.body);
          return json(part);
        }
        if (req.method === 'POST' && action === 'complete') {
          const {uploadId, parts} = await req.json();
          const up = env.BUCKET.resumeMultipartUpload(key, uploadId);
          const obj = await up.complete(parts);
          const m = await getMeta(env, slug);
          const patch = {};
          if (kind === 'result' && ['new', 'editing'].includes(m.status)) patch.status = 'done';
          await touch(env, slug, patch);
          return json({ok: true, size: obj.size, name});
        }
        if (req.method === 'DELETE' && action === 'abort') {
          await env.BUCKET.resumeMultipartUpload(key, url.searchParams.get('uploadId')).abort();
          return json({ok: true});
        }
      }

      return err('Không có đường dẫn này', 404);
    } catch (e) {
      return err(e.message || String(e), 500);
    }
  },
};
