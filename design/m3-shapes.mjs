// The official Material Shape library (35 shapes: clovers, cookies, sunny, arch, gem, …),
// read straight from @m3e/web's shape component so the cursors use the real paths.
// The paths are absolute M / L / H / V / C / Z commands in a 380 x 380 box.
//
//   shape(name, cx, cy, size, rotationDeg)   -> SVG path data, `size` = the shape's visual width
//   morph(nameA, nameB, t, cx, cy, size, rotationDeg) -> a polygon between the two shapes
import { readFileSync } from 'node:fs';

// @m3e/web's package exports hide dist/, so read the file the same way tools/render.mjs loads the bundle.
const SRC = readFileSync(new URL('../node_modules/@m3e/web/dist/shape.js', import.meta.url), 'utf8');
export const SHAPES = Object.fromEntries([...SRC.matchAll(/(?:"([a-z0-9-]+)"|\b([a-z][a-z0-9]*)):\s*"(M[^"]+Z)"/g)]
  .map((m) => [m[1] ?? m[2], m[3]]));
if (Object.keys(SHAPES).length < 35) throw new Error(`found ${Object.keys(SHAPES).length} Material shapes, expected 35`);

// Parse into absolute segments: [['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']].
function parse(d) {
  const out = []; let cur = [0, 0], start = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MLHVCZ])([^MLHVCZ]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (cmd === 'M') { cur = [n[0], n[1]]; start = cur; out.push(['M', ...cur]); }
    else if (cmd === 'L') for (let i = 0; i < n.length; i += 2) { cur = [n[i], n[i + 1]]; out.push(['L', ...cur]); }
    else if (cmd === 'H') for (const x of n) { cur = [x, cur[1]]; out.push(['L', ...cur]); }
    else if (cmd === 'V') for (const y of n) { cur = [cur[0], y]; out.push(['L', ...cur]); }
    else if (cmd === 'C') for (let i = 0; i < n.length; i += 6) { out.push(['C', ...n.slice(i, i + 6)]); cur = [n[i + 4], n[i + 5]]; }
    else { out.push(['Z']); cur = start; }
  }
  return out;
}
const PARSED = Object.fromEntries(Object.entries(SHAPES).map(([k, d]) => [k, parse(d)]));

// Flatten to a dense polyline (cubics subdivided), used for bounds and morphing.
function flatten(segs) {
  const pts = []; let cur;
  for (const s of segs) {
    if (s[0] === 'M' || s[0] === 'L') { cur = [s[1], s[2]]; pts.push(cur); }
    else if (s[0] === 'C') {
      const [x1, y1, x2, y2, x, y] = s.slice(1), [x0, y0] = cur;
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        pts.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]);
      }
      cur = [x, y];
    }
  }
  return pts;
}
const BOUNDS = Object.fromEntries(Object.entries(PARSED).map(([k, segs]) => {
  const p = flatten(segs), xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [k, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(x1 - x0, y1 - y0) }];
}));

const f = (n) => +n.toFixed(3);
const placer = (name, cx, cy, size, deg) => {
  const b = BOUNDS[name], k = size / b.w, a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (x, y) => { const dx = (x - b.cx) * k, dy = (y - b.cy) * k; return [f(cx + dx * c - dy * s), f(cy + dx * s + dy * c)]; };
};

export function shape(name, cx, cy, size, deg = 0) {
  if (!PARSED[name]) throw new Error(`unknown Material shape "${name}"`);
  const t = placer(name, cx, cy, size, deg);
  return PARSED[name].map((s) => {
    if (s[0] === 'Z') return 'Z';
    if (s[0] === 'C') return `C${t(s[1], s[2]).join(',')} ${t(s[3], s[4]).join(',')} ${t(s[5], s[6]).join(',')}`;
    return `${s[0]}${t(s[1], s[2]).join(',')}`;
  }).join('');
}

// Resample to N points evenly spaced by arc length, starting at the top-most point, clockwise.
const N = 240;
function sample(name) {
  const p = flatten(PARSED[name]), seg = [0];
  for (let i = 1; i <= p.length; i++) seg.push(seg[i - 1] + Math.hypot(p[i % p.length][0] - p[i - 1][0], p[i % p.length][1] - p[i - 1][1]));
  const total = seg[seg.length - 1], out = [];
  for (let k = 0, j = 0; k < N; k++) {
    const d = (k / N) * total;
    while (seg[j + 1] < d) j++;
    const t = (d - seg[j]) / (seg[j + 1] - seg[j] || 1), a = p[j], b = p[(j + 1) % p.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  const b = BOUNDS[name], top = out.reduce((m, q, i) => (q[1] - b.cy < out[m][1] - b.cy ? i : m), 0);
  return out.slice(top).concat(out.slice(0, top)).map(([x, y]) => [(x - b.cx) / b.w, (y - b.cy) / b.w]);
}
const SAMPLES = {};
export function morph(a, b, t, cx, cy, size, deg = 0) {
  const A = (SAMPLES[a] ??= sample(a)), B = (SAMPLES[b] ??= sample(b));
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return 'M' + A.map((p, i) => {
    const x = (p[0] + (B[i][0] - p[0]) * t) * size, y = (p[1] + (B[i][1] - p[1]) * t) * size;
    return `${f(cx + x * c - y * s)},${f(cy + x * s + y * c)}`;
  }).join('L') + 'Z';
}
