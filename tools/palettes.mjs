// Generates design/variants.json: one colour set per theme variant, taken from the M3 tonal
// palette of a seed colour with Google's material-color-utilities.
//   node tools/palettes.mjs
//
// Each variant uses the same tones as the purple theme:
//   primary = T40, primary30 = T30, primaryContainer = T90, onPrimaryContainer = T10, hairline = T10.
// Purple keeps the M3 baseline values from tokens.json (#6750A4 / #EADDFF / #21005D), which are
// hand-tuned and differ from the generated tones by a hair.
import { TonalPalette, argbFromHex, hexFromArgb, Hct } from '@material/material-color-utilities';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(ROOT, 'design/tokens.json')));
const base = Object.fromEntries(['primary', 'primary30', 'primaryContainer', 'onPrimaryContainer', 'hairline']
  .map((k) => [k, tokens.color[k].value]));

const SEEDS = [
  ['blue', 'Blue', '#0B57D0'],
  ['teal', 'Teal', '#006A6A'],
  ['green', 'Green', '#386A20'],
  ['orange', 'Orange', '#8B5000'],
  ['red', 'Red', '#B3261E'],
  ['pink', 'Pink', '#984061'],
];
const fromPalette = (p) => ({
  primary: hexFromArgb(p.tone(40)), primary30: hexFromArgb(p.tone(30)),
  primaryContainer: hexFromArgb(p.tone(90)), onPrimaryContainer: hexFromArgb(p.tone(10)),
  hairline: hexFromArgb(p.tone(10)),
});
const up = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toUpperCase()]));

const variants = [
  { id: 'purple', name: 'Purple', seed: '#6750A4', colors: base },
  ...SEEDS.map(([id, name, seed]) => ({ id, name, seed, colors: up(fromPalette(TonalPalette.fromInt(argbFromHex(seed)))) })),
  // Graphite: the purple hue at very low chroma, a near-neutral grey with a faint cool cast.
  { id: 'graphite', name: 'Graphite', seed: 'hue 285, chroma 6',
    colors: up(fromPalette(TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex('#6750A4')).hue, 6))) },
];
writeFileSync(join(ROOT, 'design/variants.json'), JSON.stringify(variants, null, 2) + '\n');
for (const v of variants) console.log(v.id.padEnd(9), Object.values(v.colors).slice(0, 4).join(' '));
