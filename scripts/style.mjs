// Schema style.json (mô tả trong references/style-schema.md). Dùng chung cho analyze/build.
export const ROLES = ['cover', 'unbox', 'detail', 'use', 'people', 'result', 'deal', 'other'];
export const ENUMS = {
  'cover.kind': ['torn-paper', 'bar', 'plain', 'none'],
  title_anim: ['typewriter', 'fade', 'none'],
  'caption.style': ['serif-outline', 'box', 'plain'],
  'caption.position': ['bottom', 'middle'],
  'caption.anim': ['typewriter', 'fade', 'none'],
  transition: ['cut', 'fade'],
};

/** Preset mặc định = kiểu @thokunrw hiện tại. */
export const DEFAULT_STYLE = {
  aspect: '9:16',
  fps: 30,
  shot_seconds: {avg: 3, min: 2.5, max: 3.5},
  sequence: ['cover', 'unbox', 'detail', 'detail', 'use', 'use', 'result'],
  cover: {kind: 'torn-paper', title_lines: 2, title_color: '#e8478c', paper_color: '#fbf2e4', decor: true},
  title_anim: 'typewriter',
  caption: {style: 'serif-outline', position: 'middle', color: '#fff5b0', outline: '#4b3527', anim: 'typewriter', decor: true},
  transition: 'cut',
  music: false,
  sfx: false,
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function merge(a, b) {
  if (!isObj(a) || !isObj(b)) return b;
  const r = {...a};
  for (const [k, v] of Object.entries(b)) r[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return r;
}
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const COLOR = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

/** Kiểm style. Trả mảng lỗi; `partial` cho phép trường null (còn chờ điền). */
export function validate(s, {partial = false} = {}) {
  const errs = [];
  const nullOk = (v) => partial && (v === null || v === undefined);
  for (const [p, vals] of Object.entries(ENUMS)) {
    const v = get(s, p);
    if (!nullOk(v) && !vals.includes(v)) errs.push(`${p} phải là một trong: ${vals.join(', ')}`);
  }
  if (!nullOk(s.aspect) && !/^\d+:\d+$/.test(s.aspect ?? '')) errs.push('aspect dạng "9:16"');
  if (!nullOk(s.fps) && !(s.fps > 0 && s.fps <= 60)) errs.push('fps trong 1..60');
  if (!nullOk(s.shot_seconds) && !(isObj(s.shot_seconds) && s.shot_seconds.avg > 0))
    errs.push('shot_seconds cần {avg, min, max} (giây)');
  if (!nullOk(s.sequence) && !(Array.isArray(s.sequence) && s.sequence.every((r) => ROLES.includes(r))))
    errs.push(`sequence là mảng vai cảnh: ${ROLES.join(', ')}`);
  for (const p of ['cover.title_color', 'cover.paper_color', 'caption.color', 'caption.outline']) {
    const v = get(s, p);
    if (nullOk(v) || (v === null && p === 'caption.outline')) continue;
    if (!COLOR.test(v ?? '')) errs.push(`${p} là mã màu #rrggbb`);
  }
  const tl = get(s, 'cover.title_lines');
  if (!nullOk(tl) && !(Number.isInteger(tl) && tl >= 0 && tl <= 4)) errs.push('cover.title_lines 0..4');
  for (const p of ['cover.decor', 'caption.decor', 'music', 'sfx']) {
    const v = get(s, p);
    if (!nullOk(v) && typeof v !== 'boolean') errs.push(`${p} là true/false`);
  }
  return errs;
}

/** Danh sách trường còn null (cần agent nhìn ảnh để điền). */
export function pending(s, prefix = '') {
  const r = [];
  for (const [k, v] of Object.entries(s)) {
    if (k.startsWith('_')) continue;
    const p = prefix + k;
    if (v === null) r.push(p);
    else if (isObj(v)) r.push(...pending(v, p + '.'));
  }
  return r;
}
