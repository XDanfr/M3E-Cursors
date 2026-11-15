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
    frames: 24, frameMs: 4666 / 24,
    loading: { container: 24, center: [16, 16] },
  },
  {
    name: 'progress', label: 'Busy in background', group: 'Status',
    roles: ['cursor.4'].map(ID), hotspot: ARROW_HOT,
    frames: 24, frameMs: 4666 / 24,
    loading: { container: 13, center: [BX - 0.5, BY - 0.5], under: () => arrowWith('') },
  },
];

export const byName = Object.fromEntries(cursors.map((c) => [c.name, c]));
export { ID };
