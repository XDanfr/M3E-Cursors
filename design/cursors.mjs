// Every cursor in the theme, defined parametrically from the shared geometry and tokens.
// `tools/render.mjs` exports each definition to an editable SVG in cursors/<name>/ and
// rasterises it at 32, 64, 160 and 320 px.
import { T, C, roundedPoly, cornerApex, rrect, circle, line, layer, glyph, svg, spring, lerp, P } from './geometry.mjs';

const ID = (s) => (s.startsWith('cursor.') ? 'com.apple.' : 'com.apple.coregraphics.') + s;

// ---------- Arrow ----------------------------------------------------------------------
// A soft kite: rounded tip, a long straight leading edge, a notch instead of a tail,
// and a broad rounded shoulder on the right. Asymmetric radii give it the M3E feel.
const ARROW_PTS = [[5.5, 3.2], [5.5, 24.4], [11.0, 19.6], [20.2, 19.2]];
const ARROW_R = [T.shape.arrowTipRadius.value, 2.8, 1.4, T.shape.arrowBodyRadius.value];
const arrowPart = { d: roundedPoly(ARROW_PTS, ARROW_R) };
const ARROW_HOT = cornerApex(ARROW_PTS, ARROW_R, 0).map((v) => Math.round(v * 10) / 10);

// ---------- Badge (FAB) ----------------------------------------------------------------
const [BX, BY] = T.shape.badgeCenter.value;
const BS = T.shape.badgeSize.value, BR = T.shape.badgeCorner.value;
const fab = (scale = 1, fill = C.primaryContainer) =>
  layer([{ d: rrect(BX - BS * scale / 2, BY - BS * scale / 2, BS * scale, BS * scale, BR * scale) }], fill);
const at = (pts) => pts.map(([x, y]) => [BX + x, BY + y]);
const G = 1.8; // glyph stroke weight

const arrowWith = (badge) => svg(layer([arrowPart]) + badge);

// ---------- Upload / copy morph --------------------------------------------------------
const SP = T.motion.springSpatial, SE = T.motion.springEffects;
function uploadFrame(i) {
  const ms = i * T.motion.uploadLoop.frameMs;
  // hold plus 0-600 ms, spring to upload arrow, hold, spring back from 1800 ms
  let spatial, effect;
  if (ms < 700) { spatial = 0; effect = 0; }
  else if (ms < 1900) { spatial = spring((ms - 600) / 1000, SP); effect = spring((ms - 600) / 1000, SE); }
  else { spatial = 1 - spring((ms - 1800) / 1000, SP); effect = 1 - spring((ms - 1800) / 1000, SE); }
  const s = Math.min(1, Math.max(0, effect));
  const scale = 1 + 0.1 * spatial;
  const k = (p) => [p[0] * scale, p[1] * scale];
  const stemTop = lerp([0, -3.6], [0, -4.0], s), stemBot = lerp([0, 3.6], [0, 3.9], s);
  const apex = lerp([0, 0], [0, -4.0], s);
  const l = lerp([-3.6, 0], [-3.4, -0.6], s), r = lerp([3.6, 0], [3.4, -0.6], s);
  const g = [
    { d: line(...at([k(stemTop), k(stemBot)])), w: G },
    { d: line(...at([k(l), k(apex), k(r)])), w: G },
  ];
  return arrowWith(fab(scale) + glyph(g, C.onPrimaryContainer));
}

// ---------- I-beam ---------------------------------------------------------------------
// Straight stem with soft, slightly cupped serifs.
const ibeamParts = [
  { d: line([16, 8.6], [16, 23.4]), w: 2.2 },
  { d: `M12.4,6.4Q16,9.4 19.6,6.4`, w: 2.2 },
  { d: `M12.4,25.6Q16,22.6 19.6,25.6`, w: 2.2 },
];

// ---------- Hands ----------------------------------------------------------------------
// Built from pills and a squircle palm, the same vocabulary as the badges and I-beam.
const palm = (y0, y1) => ({ d: rrect(10.2, y0, 13.8, y1 - y0, 5.2) });
const pill = (a, b, w = 4.2) => ({ d: line(a, b), w });
const seam = (a, b) => ({ d: line(a, b), w: 0.8 });
const pointingParts = [
  pill([12.6, 5.6], [12.6, 16], 4.4),
  pill([17.0, 12.4], [17.0, 15]),
  pill([21.2, 13.4], [21.2, 16]),
  pill([10.6, 21.6], [7.2, 17.4]),
  palm(13.2, 27),
];
const openParts = [
  pill([12.4, 6.6], [12.8, 15], 3.9),
  pill([16.4, 5.4], [16.4, 14], 3.9),
  pill([20.4, 5.8], [20.0, 14.5], 3.9),
  pill([23.6, 9.6], [22.6, 16], 3.6),
  pill([10.8, 21.4], [6.6, 15.6], 3.9),
  palm(13.0, 26.6),
];
const closedParts = [
  pill([12.6, 12.0], [12.6, 14], 3.9),
  pill([16.5, 11.0], [16.5, 14], 3.9),
  pill([20.4, 11.6], [20.4, 14], 3.9),
  pill([23.4, 13.4], [23.4, 15.5], 3.4),
  pill([10.6, 20.4], [8.8, 17.6], 3.9),
  palm(12.6, 25.4),
];

// ---------- Badge glyphs ---------------------------------------------------------------
const helpGlyph = glyph([
  { d: `M${P(at([[-2.3, -1.9]])[0])}C${P(at([[-2.3, -4.6]])[0])} ${P(at([[2.4, -4.6]])[0])} ${P(at([[2.4, -1.8]])[0])}` +
       `C${P(at([[2.4, -0.2]])[0])} ${P(at([[0, 0]])[0])} ${P(at([[0, 1.2]])[0])}`, w: G },
  { d: circle(BX, BY + 3.5, 1.1) },
], C.onPrimaryContainer);
const menuGlyph = glyph([-2.6, 0, 2.6].map((y, i) => ({ d: line(...at([[-3.2, y], [i === 1 ? 1.6 : 3.2, y]])), w: 1.6 })), C.onPrimaryContainer);
const aliasGlyph = glyph([
  { d: `M${P(at([[-3.2, 3.4]])[0])}L${P(at([[-3.2, 0.6]])[0])}Q${P(at([[-3.2, -2.2]])[0])} ${P(at([[-0.4, -2.2]])[0])}L${P(at([[3.0, -2.2]])[0])}`, w: G },
  { d: line(...at([[0.6, -4.6], [3.0, -2.2], [0.6, 0.2]])), w: G },
], C.onPrimaryContainer);
const forbiddenBadge = layer([{ d: circle(BX, BY, 6.4) }], C.errorContainer) + glyph([
  { d: circle(BX, BY, 3.7), w: G },
  { d: line(...at([[-2.6, 2.6], [2.6, -2.6]])), w: G },
], C.onErrorContainer);

// ---------- Directional arrows (resize / move) -----------------------------------------
const W = T.shape.strokeWeight.value;
const xf = (deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]) => [16 + x * c - y * s, 16 + x * s + y * c]; };
const head = (tip, dir, t) => { // rounded triangular head pointing along dir (+1 / -1) on the x axis
  const b = tip - dir * 5.0;
  return { d: roundedPoly([[tip, 0], [b, 4.3], [b, -4.3]].map(t), [0.9, 1.3, 1.3]) };
};
// heads: 'both' | 'pos' | 'neg';  bar: draw a divider bar at x = 0 (split-view resize)
function arrows(deg, { L = 10.5, heads = 'both', bar = false } = {}) {
  const t = xf(deg), parts = [];
  const pos = heads !== 'neg', neg = heads !== 'pos';
  const inner = bar ? 3.6 : 0;
  if (pos) parts.push(head(L, 1, t), { d: line(t([bar ? inner : neg ? 0 : -L + 3.5, 0]), t([L - 3, 0])), w: W });
  if (neg) parts.push(head(-L, -1, t), { d: line(t([bar ? -inner : pos ? 0 : L - 3.5, 0]), t([-L + 3, 0])), w: W });
  if (bar) parts.push({ d: line(t([0, -7.5]), t([0, 7.5])), w: W });
  return parts;
}
const arrowsSVG = (deg, opts) => svg(layer(arrows(deg, opts)));

// ---------- Precision ------------------------------------------------------------------
const crossParts = [
  [[16, 4], [16, 12.4]], [[16, 19.6], [16, 28]], [[4, 16], [12.4, 16]], [[19.6, 16], [28, 16]],
].map((s) => ({ d: line(...s), w: 1.8 })).concat({ d: circle(16, 16, 1.3) });
const cellParts = [{ d: rrect(13.3, 6.5, 5.4, 19, 2.4) }, { d: rrect(6.5, 13.3, 19, 5.4, 2.4) }];
const zoom = (plus) => svg(
  layer([{ d: line([19.4, 19.4], [25.6, 25.6]), w: 4.2 }, { d: circle(13.5, 13.5, 8.6) }])
  + glyph([{ d: circle(13.5, 13.5, 6.2) }], C.primaryContainer)
  + glyph([{ d: line([10.2, 13.5], [16.8, 13.5]), w: G }].concat(plus ? [{ d: line([13.5, 10.2], [13.5, 16.8]), w: G }] : []), C.onPrimaryContainer));
const cameraSVG = svg(layer([{ d: rrect(5, 10, 22, 15.5, 5) }, { d: rrect(10.5, 7.4, 7, 5, 1.8) }])
  + glyph([{ d: circle(16, 17.6, 4.7) }], C.primaryContainer) + glyph([{ d: circle(16, 17.6, 2.1) }], C.primary));

// ---------- Roles macOS doesn't have (Windows, Linux) ----------------------------------
// Pencil for handwriting: tip to the upper left, pointing at the hotspot.
const PEN_AT = ([x, y]) => [5 + (x - y) * Math.SQRT1_2, 5 + (x + y) * Math.SQRT1_2];
const PEN_TIP = [[0, 0], [6.6, -3.3], [6.6, 3.3]].map(PEN_AT), PEN_TIP_R = [0.9, 0.5, 0.5];
const penParts = [
  { d: roundedPoly(PEN_TIP, PEN_TIP_R) },
  { d: roundedPoly([[6.6, -3.3], [22, -3.3], [22, 3.3], [6.6, 3.3]].map(PEN_AT), [0.3, 2.6, 2.6, 0.3]) },
];
const penDetail = glyph([{ d: line(PEN_AT([6.6, -2.4]), PEN_AT([6.6, 2.4])), w: 0.9 }], C.primary30)
  + glyph([{ d: line(PEN_AT([17.6, -2.2]), PEN_AT([17.6, 2.2])), w: 1.6 }], C.primaryContainer);
const PEN_HOT = cornerApex(PEN_TIP, PEN_TIP_R, 0).map((v) => Math.round(v * 10) / 10);

// ---------- Definitions ----------------------------------------------------------------
export const cursors = [
  {
    name: 'arrow', label: 'Default arrow', group: 'Everyday',
    roles: ['Arrow', 'ArrowS'].map(ID), hotspot: ARROW_HOT,
    svg: () => arrowWith(''),
  },
  {
    name: 'pointer', label: 'Link pointer', group: 'Everyday',
    roles: ['cursor.13'].map(ID), hotspot: [12.6, 3.4],
    svg: () => svg(layer(pointingParts) + glyph([seam([14.9, 13.6], [14.9, 17]), seam([19.1, 14.4], [19.1, 17.4])], C.primary30)),
  },
  {
    name: 'grab', label: 'Open hand', group: 'Movement',
    roles: ['cursor.12'].map(ID), hotspot: [16, 15],
    svg: () => svg(layer(openParts)),
  },
  {
    name: 'grabbing', label: 'Closed hand', group: 'Movement',
    roles: ['cursor.11'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer(closedParts) + glyph([seam([14.55, 12.4], [14.55, 15.6]), seam([18.45, 12.6], [18.45, 15.6]), seam([22.1, 13.6], [22.1, 16])], C.primary30)),
  },
  {
    name: 'text', label: 'Text I-beam', group: 'Everyday',
    roles: ['IBeam', 'IBeamS', 'IBeamXOR'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer(ibeamParts)),
  },
  {
    name: 'upload', label: 'Upload / copy drop', group: 'Expressive',
    roles: ['Copy', 'cursor.5'].map(ID), hotspot: ARROW_HOT,
    frames: 24, frameMs: T.motion.uploadLoop.frameMs,
    svg: uploadFrame,
  },
  {
    name: 'wait', label: 'Busy (M3E indicator)', group: 'Status',
    roles: ['Wait'].map(ID), hotspot: [16, 16],
    frames: 280, frameMs: 4666 / 280,
    loading: { container: 24, center: [16, 16] },
  },
  {
    name: 'progress', label: 'Busy in background', group: 'Status',
    roles: ['cursor.4'].map(ID), hotspot: ARROW_HOT,
    frames: 280, frameMs: 4666 / 280,
    loading: { container: 13, center: [BX - 0.5, BY - 0.5], under: () => arrowWith('') },
  },
  // Everyday
  { name: 'text-vertical', label: 'Vertical text I-beam', group: 'Everyday',
    roles: ['cursor.26'].map(ID), hotspot: [16, 16], svg: () => svg(layer(ibeamParts), { transform: 'rotate(90 16 16)' }) },
  { name: 'help', label: 'Help', group: 'Everyday',
    roles: ['cursor.40'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(fab() + helpGlyph) },
  { name: 'context-menu', label: 'Context menu', group: 'Everyday',
    roles: ['ArrowCtx', 'cursor.24'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(fab() + menuGlyph) },
  { name: 'not-allowed', label: 'Unavailable', group: 'Everyday',
    roles: ['cursor.3'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(forbiddenBadge) },
  // Movement
  { name: 'alias', label: 'Alias / link drop', group: 'Movement',
    roles: ['Alias', 'cursor.2'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(fab() + aliasGlyph) },
  { name: 'move', label: 'Move', group: 'Movement',
    roles: ['Move', 'cursor.39'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer([...arrows(0, { L: 11.5 }), ...arrows(90, { L: 11.5 })]) + glyph([{ d: circle(16, 16, 1.6) }], C.primaryContainer)) },
  // Precision
  { name: 'crosshair', label: 'Crosshair', group: 'Precision',
    roles: ['cursor.7', 'cursor.8', 'cursor.20', 'cursor.10'].map(ID), hotspot: [16, 16], svg: () => svg(layer(crossParts)) },
  { name: 'cell', label: 'Cell selection', group: 'Precision',
    roles: ['cursor.41'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer(cellParts) + glyph([{ d: circle(16, 16, 1.3) }], C.primaryContainer)) },
  { name: 'zoom-in', label: 'Zoom in', group: 'Precision', roles: ['cursor.42'].map(ID), hotspot: [13.5, 13.5], svg: () => zoom(true) },
  { name: 'zoom-out', label: 'Zoom out', group: 'Precision', roles: ['cursor.43'].map(ID), hotspot: [13.5, 13.5], svg: () => zoom(false) },
  { name: 'screenshot-window', label: 'Screenshot window', group: 'Precision', roles: ['cursor.9'].map(ID), hotspot: [16, 16], svg: () => cameraSVG },
  // Resize: split views (columns / rows) — a divider bar between the arrows
  { name: 'col-resize', label: 'Column resize', group: 'Resize', roles: ['cursor.19'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(0, { bar: true }) },
  { name: 'col-resize-left', label: 'Column resize ←', group: 'Resize', roles: ['cursor.17'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(0, { bar: true, heads: 'neg' }) },
  { name: 'col-resize-right', label: 'Column resize →', group: 'Resize', roles: ['cursor.18'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(0, { bar: true, heads: 'pos' }) },
  { name: 'row-resize', label: 'Row resize', group: 'Resize', roles: ['cursor.23'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(90, { bar: true }) },
  { name: 'row-resize-up', label: 'Row resize ↑', group: 'Resize', roles: ['cursor.21'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(90, { bar: true, heads: 'neg' }) },
  { name: 'row-resize-down', label: 'Row resize ↓', group: 'Resize', roles: ['cursor.22'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(90, { bar: true, heads: 'pos' }) },
  // Resize: window edges and corners
  { name: 'resize-ew', label: 'Horizontal resize', group: 'Resize', roles: ['cursor.28'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(0) },
  { name: 'resize-ns', label: 'Vertical resize', group: 'Resize', roles: ['cursor.32'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(90) },
  { name: 'resize-nwse', label: 'Diagonal resize ↖↘', group: 'Resize', roles: ['cursor.34'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(45, { L: 11 }) },
  { name: 'resize-nesw', label: 'Diagonal resize ↗↙', group: 'Resize', roles: ['cursor.30'].map(ID), hotspot: [16, 16], svg: () => arrowsSVG(-45, { L: 11 }) },
  ...[['e', 27, 0], ['w', 38, 180], ['n', 31, -90], ['s', 36, 90], ['ne', 29, -45], ['nw', 33, -135], ['se', 35, 45], ['sw', 37, 135]]
    .map(([d, n, deg]) => ({ name: `resize-${d}`, label: `Edge resize ${d.toUpperCase()}`, group: 'Resize',
      roles: [ID(`cursor.${n}`)], hotspot: [16, 16], svg: () => arrowsSVG(deg, { heads: 'pos', L: d.length > 1 ? 9.5 : 9 }) })),
  // Roles macOS has no slot for: shipped in the Windows and Linux themes only.
  { name: 'pen', label: 'Handwriting', group: 'Other platforms', roles: [], hotspot: PEN_HOT,
    svg: () => svg(layer(penParts) + penDetail) },
];

export const byName = Object.fromEntries(cursors.map((c) => [c.name, c]));
export { ID };
