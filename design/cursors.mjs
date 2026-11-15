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

// ---------- Definitions ----------------------------------------------------------------
export const cursors = [
  {
    name: 'arrow', label: 'Default arrow', group: 'Everyday',
    roles: ['Arrow', 'ArrowS'].map(ID), hotspot: ARROW_HOT,
    svg: () => arrowWith(''),
  },
];

export const byName = Object.fromEntries(cursors.map((c) => [c.name, c]));
export { ID };
