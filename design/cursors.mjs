// Every cursor in the theme, defined parametrically from the shared geometry and tokens.
// `tools/render.mjs` exports each definition to an editable SVG in cursors/<name>/ and
// rasterises it at 32, 64, 160 and 320 px.
import { T, C, roundedPoly, cornerApex, rrect, circle, line, layer, glyph, svg, spring, lerp, P } from './geometry.mjs';
import { shape, morph } from './m3-shapes.mjs';

const ID = (s) => (s.startsWith('cursor.') ? 'com.apple.' : 'com.apple.coregraphics.') + s;

// ---------- Arrow ----------------------------------------------------------------------
// A soft kite: rounded tip, a long straight leading edge, a notch instead of a tail,
// and a broad rounded shoulder on the right. Asymmetric radii give it the M3E feel.
const ARROW_PTS = [[5.5, 3.2], [5.5, 24.4], [11.0, 19.6], [20.2, 19.2]];
const ARROW_R = [T.shape.arrowTipRadius.value, 2.8, 1.4, T.shape.arrowBodyRadius.value];
const arrowPart = { d: roundedPoly(ARROW_PTS, ARROW_R) };
const ARROW_HOT = cornerApex(ARROW_PTS, ARROW_R, 0).map((v) => Math.round(v * 10) / 10);

// ---------- Badge -----------------------------------------------------------------------
// Badges on the arrow are shapes from the Material Shape library, one per meaning, in the
// tertiary accent (M3E's colour for emphasis). M3E_BADGE_TONE=primary keeps them in the primary
// container colour instead, for comparison.
const [BX, BY] = T.shape.badgeCenter.value;
const BADGE_SIZE = T.shape.badgeShapeSize.value;
const TONE = process.env.M3E_BADGE_TONE ?? T.shape.badgeTone.value;
const BADGE_FILL = TONE === 'primary' ? C.primaryContainer : C.tertiaryContainer;
const BADGE_ON = TONE === 'primary' ? C.onPrimaryContainer : C.onTertiaryContainer;
const badge = (name, { rot = 0, scale = 1 } = {}) => layer([{ d: shape(name, BX, BY, BADGE_SIZE * scale, rot) }], BADGE_FILL);
// One library shape per meaning. Unavailable keeps the universal circle-and-slash.
const BADGE_SHAPES = { help: '7-sided-cookie', menu: 'bun', alias: 'arch', copy: 'sunny', upload: 'soft-burst', location: 'gem', person: 'flower' };
const at = (pts) => pts.map(([x, y]) => [BX + x, BY + y]);
const G = 1.8; // glyph stroke weight

const arrowWith = (badge) => svg(layer([arrowPart]) + badge);

// ---------- Upload / copy morph --------------------------------------------------------
const SP = T.motion.springSpatial, SE = T.motion.springMorph;
function uploadFrame(i) {
  const ms = i * T.motion.uploadLoop.frameMs;
  // hold plus 0-600 ms, spring to upload arrow, hold, spring back from 1800 ms
  let spatial, effect;
  if (ms < 700) { spatial = 0; effect = 0; }
  else if (ms < 1900) { spatial = spring((ms - 600) / 1000, SP); effect = spring((ms - 600) / 1000, SE); }
  else { spatial = 1 - spring((ms - 1800) / 1000, SP); effect = 1 - spring((ms - 1800) / 1000, SE); }
  const s = Math.min(1, Math.max(0, effect));
  const scale = 1 + 0.04 * spatial; // small: the morph carries the expression, and the burst must stay inside 32 pt
  const k = (p) => [p[0] * scale, p[1] * scale];
  const stemTop = lerp([0, -3.6], [0, -4.0], s), stemBot = lerp([0, 3.6], [0, 3.9], s);
  const apex = lerp([0, 0], [0, -4.0], s);
  const l = lerp([-3.6, 0], [-3.4, -0.6], s), r = lerp([3.6, 0], [3.4, -0.6], s);
  const g = [
    { d: line(...at([k(stemTop), k(stemBot)])), w: G },
    { d: line(...at([k(l), k(apex), k(r)])), w: G },
  ];
  // The badge morphs from sunny to a soft burst and turns a little, like the loading indicator's
  // shapes: the morph follows the effects spring, the turn and growth the spatial spring.
  // The burst's points reach further than the sunny's, so it settles 6% smaller to stay inside 32 pt.
  const shapeD = morph(BADGE_SHAPES.copy, BADGE_SHAPES.upload, s, BX, BY, BADGE_SIZE * scale * (1 - 0.06 * s), 22.5 * spatial);
  return arrowWith(layer([{ d: shapeD }], BADGE_FILL) + glyph(g, BADGE_ON));
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
// One builder keeps the three hands consistent:
//   - fingers are parallel pills that overlap their neighbours by 1 pt, so no hairline gaps
//     show between them at any size; seam lines mark where one finger ends and the next begins;
//   - the palm is flush with the outermost fingers, and its top corners sit under them, so no
//     palm corner peeks out beside a finger;
//   - both creases where the thumb meets the palm get a rounded fillet instead of a pinched notch.
const SEAM_W = 0.8;
const unit = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
// A true fillet: a circle of radius rho tangent to two straight edges that meet at C (u1, u2: unit
// directions along each edge, away from C; in1, in2: unit normals pointing into the solid shape).
// rho shrinks if needed so the tangent points stay within maxLen of C (on straight edge only).
// The patch also reaches 0.8 pt into the solid, so it overlaps both shapes and no seam shows.
function fillet(C, u1, u2, in1, in2, rho, maxLen = Infinity) {
  const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  rho = Math.min(rho, maxLen * Math.tan(theta / 2));
  const d = rho / Math.tan(theta / 2), m = unit([u1[0] + u2[0], u1[1] + u2[1]]);
  const T1 = add(C, u1, d), T2 = add(C, u2, d), O = add(C, m, rho / Math.sin(theta / 2));
  const sweep = (T1[0] - O[0]) * (T2[1] - O[1]) - (T1[1] - O[1]) * (T2[0] - O[0]) > 0 ? 1 : 0;
  return { d: `M${P(T1)}A${+rho.toFixed(3)},${+rho.toFixed(3)} 0 0,${sweep} ${P(T2)}` +
    `L${P(add(T2, in2, 0.8))}L${P(add(C, m, -0.8))}L${P(add(T1, in1, 0.8))}Z` };
}
// Where a line through p0 with direction u crosses x = X.
const atX = (p0, u, X) => add(p0, u, (X - p0[0]) / u[0]);
// fingers: [{ x, top, w }] left to right (top = highest point of the pill); palmTop: y where the
// palm starts (no higher than the outer fingers' cap centres); thumb: { base, tip, w }, with its
// base cap entirely inside the palm (inside its rounded corner too), so no part of the cap pokes out.
function hand({ fingers, palmTop, bottom, radius, thumb }) {
  const left = fingers[0].x - fingers[0].w / 2, last = fingers[fingers.length - 1];
  const right = last.x + last.w / 2, fingerBottom = palmTop + 3;
  const parts = fingers.map(({ x, top, w }) => ({ d: line([x, top + w / 2], [x, Math.max(fingerBottom, top + w / 2)]), w }));
  parts.push({ d: roundedPoly([[left, palmTop], [right, palmTop], [right, bottom], [left, bottom]], [0.6, 0.6, radius, radius]) });
  const { base: B, tip: T, w } = thumb, r = w / 2, u = unit([T[0] - B[0], T[1] - B[1]]), n = [-u[1], u[0]];
  parts.push({ d: line(B, T), w });
  // The left side is straight from the index finger's cap centre down to the palm's bottom corner.
  const straightTop = fingers[0].top + fingers[0].w / 2, straightBottom = bottom - radius;
  const up = add(B, n, r), low = add(B, n, -r), C1 = atX(up, u, left), C2 = atX(low, u, left);
  // Each fillet stays on straight edges: the palm's side and the thumb's side up to its tip cap.
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  parts.push(fillet(C1, [0, -1], u, [1, 0], [-n[0], -n[1]], 1.6, Math.min(C1[1] - straightTop, 0.85 * dist(C1, add(T, n, r)))));
  // A low thumb meets the palm's rounded bottom corner instead, where the angle is wide open and
  // needs no fillet.
  if (C2[1] < straightBottom - 0.2)
    parts.push(fillet(C2, [0, 1], u, [1, 0], n, 1.6, Math.min(straightBottom - C2[1], 0.85 * dist(C2, add(T, n, -r)))));
  // Seams sit in the middle of each 1 pt overlap, from just under the shorter finger's tip.
  const seams = fingers.slice(1).map((f, i) => {
    const p = fingers[i], x = (p.x + p.w / 2 + f.x - f.w / 2) / 2;
    return { d: line([x, Math.max(p.top, f.top) + Math.min(p.w, f.w) * 0.75], [x, fingerBottom + 0.6]), w: SEAM_W };
  });
  return svg(layer(parts) + glyph(seams, C.primary30));
}
// Pointing: index up, three folded knuckles, thumb out to the left.
const POINT_TIP = [12.4, 3.5];
const pointingSVG = () => hand({
  fingers: [{ x: 12.4, top: POINT_TIP[1], w: 4.4 }, { x: 15.7, top: 11.0, w: 4.2 }, { x: 18.9, top: 11.6, w: 4.2 }, { x: 22.0, top: 12.8, w: 4.0 }],
  palmTop: 14.8, bottom: 27, radius: 5.4, thumb: { base: [12.5, 22.4], tip: [7.2, 17.4], w: 4.2 },
});
// Open: four fingers up, middle longest, pinky short.
const openSVG = () => hand({
  fingers: [{ x: 12.4, top: 6.4, w: 4.2 }, { x: 15.6, top: 4.8, w: 4.2 }, { x: 18.8, top: 5.6, w: 4.2 }, { x: 21.8, top: 8.6, w: 3.8 }],
  palmTop: 10.5, bottom: 26.6, radius: 5.4, thumb: { base: [12.6, 22.2], tip: [6.6, 15.4], w: 4.2 },
});
// Closed: the same four fingers curled down to knuckles, thumb tucked in.
const closedSVG = () => hand({
  fingers: [{ x: 12.4, top: 11.8, w: 4.2 }, { x: 15.6, top: 11.0, w: 4.2 }, { x: 18.8, top: 11.4, w: 4.2 }, { x: 21.8, top: 12.4, w: 3.8 }],
  palmTop: 14.3, bottom: 25.4, radius: 4.8, thumb: { base: [12.6, 20.6], tip: [8.6, 17.2], w: 4.0 },
});

// ---------- Badge glyphs ---------------------------------------------------------------
const helpGlyph = glyph([
  { d: `M${P(at([[-2.3, -1.9]])[0])}C${P(at([[-2.3, -4.6]])[0])} ${P(at([[2.4, -4.6]])[0])} ${P(at([[2.4, -1.8]])[0])}` +
       `C${P(at([[2.4, -0.2]])[0])} ${P(at([[0, 0]])[0])} ${P(at([[0, 1.2]])[0])}`, w: G },
  { d: circle(BX, BY + 3.5, 1.1) },
], BADGE_ON);
const menuGlyph = glyph([-2.6, 0, 2.6].map((y, i) => ({ d: line(...at([[-3.2, y], [i === 1 ? 1.6 : 3.2, y]])), w: 1.6 })), BADGE_ON);
const aliasGlyph = glyph([
  { d: `M${P(at([[-3.2, 3.4]])[0])}L${P(at([[-3.2, 0.6]])[0])}Q${P(at([[-3.2, -2.2]])[0])} ${P(at([[-0.4, -2.2]])[0])}L${P(at([[3.0, -2.2]])[0])}`, w: G },
  { d: line(...at([[0.6, -4.6], [3.0, -2.2], [0.6, 0.2]])), w: G },
], BADGE_ON);
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
].map((s) => ({ d: line(...s), w: 1.8 }));
const zoom = (plus) => svg(
  layer([{ d: line([19.4, 19.4], [25.6, 25.6]), w: 4.2 }, { d: shape('12-sided-cookie', 13.5, 13.5, 18.4) }])
  + glyph([{ d: circle(13.5, 13.5, 6.2) }], C.primaryContainer)
  + glyph([{ d: line([10.2, 13.5], [16.8, 13.5]), w: G }].concat(plus ? [{ d: line([13.5, 10.2], [13.5, 16.8]), w: G }] : []), C.onPrimaryContainer));
const cellParts = [{ d: rrect(13.3, 6.5, 5.4, 19, 2.4) }, { d: rrect(6.5, 13.3, 19, 5.4, 2.4) }];
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
// Location pin and person, as FAB badge glyphs on the arrow.
const pinGlyph = glyph([{ d: `M${P(at([[0, 4.6]])[0])}L${P(at([[-2.9, 0.2]])[0])}` +
    `A3.4,3.4 0 1,1 ${P(at([[2.9, 0.2]])[0])}Z` }], BADGE_ON)
  + glyph([{ d: circle(BX, BY - 1.6, 1.2) }], BADGE_FILL);
const personGlyph = glyph([
  { d: circle(BX, BY - 2.3, 1.9) },
  { d: `M${P(at([[-3.6, 4.2]])[0])}C${P(at([[-3.6, 0.6]])[0])} ${P(at([[3.6, 0.6]])[0])} ${P(at([[3.6, 4.2]])[0])}Z` },
], BADGE_ON);

// For review sheets: any library shape behind any badge glyph.
export const GLYPHS = { help: () => helpGlyph, menu: () => menuGlyph, alias: () => aliasGlyph, pin: () => pinGlyph, person: () => personGlyph,
  plus: () => glyph([{ d: line(...at([[0, -3.6], [0, 3.6]])), w: G }, { d: line(...at([[-3.6, 0], [3.6, 0]])), w: G }], BADGE_ON) };
export const badgeArrow = (name, g, rot = 0) => arrowWith(badge(name, { rot }) + GLYPHS[g]());

// ---------- Definitions ----------------------------------------------------------------
export const cursors = [
  {
    name: 'arrow', label: 'Default arrow', group: 'Everyday',
    roles: ['Arrow', 'ArrowS'].map(ID), hotspot: ARROW_HOT,
    svg: () => arrowWith(''),
  },
  {
    name: 'pointer', label: 'Link pointer', group: 'Everyday',
    roles: ['cursor.13'].map(ID), hotspot: POINT_TIP,
    svg: pointingSVG,
  },
  {
    name: 'grab', label: 'Open hand', group: 'Movement',
    roles: ['cursor.12'].map(ID), hotspot: [16, 15],
    svg: openSVG,
  },
  {
    name: 'grabbing', label: 'Closed hand', group: 'Movement',
    roles: ['cursor.11'].map(ID), hotspot: [16, 16],
    svg: closedSVG,
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
    roles: ['cursor.40'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(badge(BADGE_SHAPES.help) + helpGlyph) },
  { name: 'context-menu', label: 'Context menu', group: 'Everyday',
    roles: ['ArrowCtx', 'cursor.24'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(badge(BADGE_SHAPES.menu) + menuGlyph) },
  { name: 'not-allowed', label: 'Unavailable', group: 'Everyday',
    roles: ['cursor.3'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(forbiddenBadge) },
  // Movement
  { name: 'alias', label: 'Alias / link drop', group: 'Movement',
    roles: ['Alias', 'cursor.2'].map(ID), hotspot: ARROW_HOT, svg: () => arrowWith(badge(BADGE_SHAPES.alias) + aliasGlyph) },
  { name: 'move', label: 'Move', group: 'Movement',
    roles: ['Move', 'cursor.39'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer([...arrows(0, { L: 11.5 }), ...arrows(90, { L: 11.5 })]) + layer([{ d: shape('4-sided-cookie', 16, 16, 5.6, 45) }], BADGE_FILL)) },
  // Precision
  { name: 'crosshair', label: 'Crosshair', group: 'Precision',
    roles: ['cursor.7', 'cursor.8', 'cursor.20', 'cursor.10'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer(crossParts) + layer([{ d: shape('4-sided-cookie', 16, 16, 4.4, 45) }], BADGE_FILL)) },
  { name: 'cell', label: 'Cell selection', group: 'Precision',
    roles: ['cursor.41'].map(ID), hotspot: [16, 16],
    svg: () => svg(layer(cellParts) + layer([{ d: shape('4-sided-cookie', 16, 16, 4.6, 45) }], BADGE_FILL)) },
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
  { name: 'alternate', label: 'Alternate select', group: 'Other platforms', roles: [], hotspot: [16, 5.4],
    svg: () => arrowsSVG(-90, { heads: 'pos', L: 11 }) },
  { name: 'location', label: 'Location select', group: 'Other platforms', roles: [], hotspot: ARROW_HOT,
    svg: () => arrowWith(badge(BADGE_SHAPES.location) + pinGlyph) },
  { name: 'person', label: 'Person select', group: 'Other platforms', roles: [], hotspot: ARROW_HOT,
    svg: () => arrowWith(badge(BADGE_SHAPES.person) + personGlyph) },
];

export const byName = Object.fromEntries(cursors.map((c) => [c.name, c]));
export { ID };
