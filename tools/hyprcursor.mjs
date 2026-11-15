// Builds Hyprcursor themes: dist/hyprcursor/M3E-<Colour>/ with manifest.hl and hyprcursors/*.hlc.
// tools/linux.mjs copies them into the matching Xcursor theme folder, so one extracted archive
// serves both Hyprland (Hyprcursor) and everything else (Xcursor).
//   node tools/hyprcursor.mjs              every colour (one process each: colours are fixed at load)
//   M3E_VARIANT=blue node tools/hyprcursor.mjs
//
// Format, from hyprwm/hyprcursor (docs/MAKING_THEMES.md, libhyprcursor/hyprcursor.cpp, meta.cpp):
//   - a theme folder with manifest.hl (name, description, version, author, cursors_directory);
//   - per cursor, <cursors_directory>/<name>.hlc: a zip holding meta.hl and the images at its root;
//   - meta.hl: hotspot_x / hotspot_y as fractions of the image, resize_algorithm, nominal_size,
//     define_override for every alias, and define_size = <size>, <file>[, <delay ms>] per image.
//     Repeated define_size lines of one size are an animation. SVG shapes ignore the size, and a
//     shape can't mix SVG and PNG.
//   - the loader picks the smallest image at or above (requested size / nominal_size) and resamples.
// Static cursors and the upload animation are SVG, so they stay sharp at any size. The loading
// indicator comes from the live M3E component, so it ships as PNG frames.
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { T, VARIANT, VARIANTS } from '../design/geometry.mjs';
import { cursors } from '../design/cursors.mjs';
import { LINUX } from '../design/platforms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.M3E_VARIANT) {
  for (const v of VARIANTS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, M3E_VARIANT: v.id } });
    if (r.status) process.exit(r.status);
  }
  process.exit(0);
}

// Same sizing as the Xcursor theme: a 24 px request draws the 32 px canvas.
export const NOMINAL_SIZE = 24 / T.targets.linux.nominalToPx['24'];
const PNG_SIZES = [32, 64, 128]; // loading indicator: exact at 24 / 48 / 96, resampled down otherwise
const MAX_FPS = 30;              // the loader decodes every frame at every size, so 60 fps is halved

// Minimal zip writer (deflate, no directories). libzip only needs a valid central directory.
export function zip(files) { // [[name, Buffer]]
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const body = deflateRawSync(data, { level: 9 }), fname = Buffer.from(name, 'utf8'), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); // 1980-01-01, so archives are reproducible
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(fname.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(fname.length, 28);
    c.writeUInt32LE(offset, 42);
    local.push(h, fname, body); central.push(c, fname);
    offset += 30 + fname.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const manifest = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'build/manifest.json'))).map((c) => [c.name, c]));
const defs = Object.fromEntries(cursors.map((c) => [c.name, c]));
const framePng = (name, px, i) => readFileSync(join(ROOT, 'build/frames', VARIANT.id, name, String(px), `${String(i).padStart(2, '0')}.png`));
const f4 = (n) => +n.toFixed(4);

const out = join(ROOT, 'dist/hyprcursor', `M3E-${VARIANT.slug}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'hyprcursors'), { recursive: true });
writeFileSync(join(out, 'manifest.hl'), [
  `name = M3E ${VARIANT.name}`,
  `description = Material 3 Expressive cursors, ${VARIANT.name.toLowerCase()} palette`,
  'version = 1.0',
  'author = XDanfr',
  'cursors_directory = hyprcursors', '',
].join('\n'));

let bytes = 0;
for (const [cursor, names] of Object.entries(LINUX)) {
  const c = manifest[cursor], def = defs[cursor], files = [], sizes = [];
  // Delays from the cumulative timeline in whole ms (> 0), so the loop length never drifts.
  const step = c.frames > 1 ? Math.max(1, Math.round(1000 / MAX_FPS / (c.frameDuration * 1000))) : 1;
  const picks = [...Array(Math.ceil(c.frames / step)).keys()].map((k) => k * step);
  const t = (i) => Math.round(Math.min(i, c.frames) * c.frameDuration * 1000);
  const delay = (i) => (c.frames > 1 ? `, ${Math.max(1, t(i + step) - t(i))}` : '');
  if (def.svg) { // vector: one SVG per frame
    for (const i of picks) {
      const file = c.frames > 1 ? `${cursor}-${String(i).padStart(2, '0')}.svg` : `${cursor}.svg`;
      files.push([file, Buffer.from(def.svg(i))]);
      sizes.push(`define_size = 32, ${file}${delay(i)}`);
    }
  } else { // the M3E loading indicator: PNG frames
    for (const px of PNG_SIZES) for (const i of picks) {
      const file = `${cursor}-${px}-${String(i).padStart(3, '0')}.png`;
      files.push([file, framePng(cursor, px, i)]);
      sizes.push(`define_size = ${px}, ${file}${delay(i)}`);
    }
  }
  const meta = [
    'resize_algorithm = bilinear',
    `hotspot_x = ${f4(c.hotspot[0] / 32)}`,
    `hotspot_y = ${f4(c.hotspot[1] / 32)}`,
    `nominal_size = ${NOMINAL_SIZE}`,
    ...names.map((n) => `define_override = ${n}`),
    ...sizes, '',
  ].join('\n');
  const hlc = zip([['meta.hl', Buffer.from(meta)], ...files]);
  writeFileSync(join(out, 'hyprcursors', `${names[0]}.hlc`), hlc);
  bytes += hlc.length;
}
console.log(`wrote dist/hyprcursor/M3E-${VARIANT.slug}/  (${Object.keys(LINUX).length} shapes, ${(bytes / 1e6).toFixed(1)} MB)`);
