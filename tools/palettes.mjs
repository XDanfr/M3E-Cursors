// Generates design/variants.json (and the README colour table) from design/palettes.json.
//   node tools/palettes.mjs
// To add a colour, use tools/new-colour.mjs rather than editing palettes.json by hand.
//
// A palettes.json entry is one of:
//   { id, name, seed }                       standard: tones from the seed's M3 tonal palette
//   { id, name, seed, style: "light" }       light cursor, M3 dark-scheme roles (Light Blue)
//   { id, name, seed, style: "pale" }        lighter still (Pale Blue)
//   { id, name, seed, chroma }               the seed's hue at a fixed chroma (Graphite)
//   { id, name, seed, style: "baseline" }    Purple: the hand-tuned M3 baseline values in tokens.json
//   { id, name, colors: { body, badge, glyph } }   explicit colours; detail and edge are derived
//
// Standard roles: body = T40, detail = T30, badge (FAB) = T90, glyph = T10, hairline = T10, white rim.
// Light roles: body T80 / T90 (pale), detail T60 / T70, badge T30 / T40, glyph T90 / T95, and a
// reversed edge (dark rim T10 / T20 inside, white hairline outside), the way white system cursors are
// drawn. Without that a light body vanishes on white.
//
// `slug` is the file-safe name used for files and folders (M3E-<slug>); `name` is what menus show.
import { TonalPalette, argbFromHex, hexFromArgb, Hct } from '@material/material-color-utilities';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(ROOT, 'design/tokens.json')));
const hex = (argb) => hexFromArgb(argb).toUpperCase();
const hct = (h) => Hct.fromInt(argbFromHex(h));

// Tertiary (the expressive accent on shape badges and cursor centres) follows M3's tonal-spot
// scheme: the primary hue + 60 degrees at chroma 24 (less for near-neutral colours).
const tertiaryOf = (p, chroma = 24) => TonalPalette.fromHueAndChroma((p.hue + 60) % 360, Math.min(chroma, 24));
const standard = (p, t = tertiaryOf(p)) => ({
  primary: hex(p.tone(40)), primary30: hex(p.tone(30)),
  primaryContainer: hex(p.tone(90)), onPrimaryContainer: hex(p.tone(10)), hairline: hex(p.tone(10)),
  tertiaryContainer: hex(t.tone(90)), onTertiaryContainer: hex(t.tone(10)),
});
const light = (p, lift, t = tertiaryOf(p)) => ({
  primary: hex(p.tone(80 + lift)), primary30: hex(p.tone(60 + lift)),
  primaryContainer: hex(p.tone(30 + lift)), onPrimaryContainer: hex(p.tone(90 + lift / 2)),
  tertiaryContainer: hex(t.tone(30 + lift)), onTertiaryContainer: hex(t.tone(90 + lift / 2)),
  rim: hex(p.tone(10 + lift)), hairline: '#FFFFFF',
});
// Explicit body / badge / glyph. The detail colour and the edge follow the body: a light body
// (tone 60 or more) gets the reversed dark-rim edge, a darker one the standard white rim.
function explicit({ body, badge, glyph }) {
  const b = hct(body), p = TonalPalette.fromHueAndChroma(b.hue, Math.min(b.chroma, 48));
  const isLight = b.tone >= 60, t = tertiaryOf(TonalPalette.fromHueAndChroma(b.hue, b.chroma));
  return {
    primary: body.toUpperCase(),
    primary30: hex(Hct.from(b.hue, b.chroma, Math.max(5, b.tone - (isLight ? 20 : 10))).toInt()),
    primaryContainer: badge.toUpperCase(), onPrimaryContainer: glyph.toUpperCase(),
    tertiaryContainer: hex(t.tone(isLight ? 30 : 90)), onTertiaryContainer: hex(t.tone(isLight ? 90 : 10)),
    ...(isLight ? { rim: hex(p.tone(10)), hairline: '#FFFFFF' } : { hairline: hex(p.tone(10)) }),
  };
}

export function roles(e) {
  if (e.colors) return { scheme: hct(e.colors.body).tone >= 60 ? 'light' : undefined, colors: explicit(e.colors) };
  if (e.style === 'baseline') return { colors: Object.fromEntries(['primary', 'primary30', 'primaryContainer', 'onPrimaryContainer', 'hairline', 'tertiaryContainer', 'onTertiaryContainer'].map((k) => [k, tokens.color[k].value])) };
  if (e.chroma != null) { const p = TonalPalette.fromHueAndChroma(hct(e.seed).hue, e.chroma);
    return { seedLabel: `hue ${Math.round(hct(e.seed).hue)}, chroma ${e.chroma}`, colors: standard(p, tertiaryOf(p, e.chroma * 2)) }; }
  const p = TonalPalette.fromInt(argbFromHex(e.seed));
  if (e.style === 'light') return { scheme: 'light', colors: light(p, 0) };
  if (e.style === 'pale') return { scheme: 'light', colors: light(p, 10) };
  return { colors: standard(p) };
}

export const slugOf = (name) => name.replace(/\s+/g, '');
export const variantOf = (e) => {
  const { scheme, seedLabel, colors } = roles(e);
  return { id: e.id, name: e.name, slug: slugOf(e.name), seed: seedLabel ?? e.seed ?? 'explicit',
    ...(scheme ? { scheme } : {}), colors };
};

// WCAG 2 contrast ratio, used to warn about badge / glyph and body / edge pairs that blend together.
const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export function warnings(v) {
  const c = v.colors, out = [], rim = c.rim ?? tokens.color.rim.value;
  if (contrast(c.primaryContainer, c.onPrimaryContainer) < 3) out.push(`badge ${c.primaryContainer} and glyph ${c.onPrimaryContainer} contrast is ${contrast(c.primaryContainer, c.onPrimaryContainer).toFixed(1)}:1 (aim for 3:1)`);
  if (c.tertiaryContainer && contrast(c.tertiaryContainer, c.onTertiaryContainer) < 3) out.push(`tertiary badge ${c.tertiaryContainer} and glyph ${c.onTertiaryContainer} contrast is ${contrast(c.tertiaryContainer, c.onTertiaryContainer).toFixed(1)}:1 (aim for 3:1)`);
  if (contrast(c.primary, rim) < 3) out.push(`body ${c.primary} and rim ${rim} contrast is ${contrast(c.primary, rim).toFixed(1)}:1 (aim for 3:1)`);
  return out;
}

export function generate() {
  const entries = JSON.parse(readFileSync(join(ROOT, 'design/palettes.json')));
  const variants = entries.map(variantOf);
  writeFileSync(join(ROOT, 'design/variants.json'), JSON.stringify(variants, null, 2) + '\n');
  // README colour table between the markers.
  const readme = join(ROOT, 'README.md'), md = readFileSync(readme, 'utf8');
  const [a, b] = ['<!-- colours:start -->', '<!-- colours:end -->'];
  if (md.includes(a) && md.includes(b)) {
    const table = ['| Variant | Body | Container | Accent badge | Accent glyph |', '|---|---|---|---|---|',
      ...variants.map((v) => `| ${v.name} | \`${v.colors.primary}\` | \`${v.colors.primaryContainer}\` | \`${v.colors.tertiaryContainer}\` | \`${v.colors.onTertiaryContainer}\` |`)].join('\n');
    writeFileSync(readme, md.slice(0, md.indexOf(a) + a.length) + '\n' + table + '\n' + md.slice(md.indexOf(b)));
  }
  return variants;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const v of generate()) console.log(v.id.padEnd(10), Object.values(v.colors).slice(0, 4).join(' '));
}
