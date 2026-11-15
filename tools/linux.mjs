// Builds Xcursor themes for KDE Plasma, GNOME and other X11 / Wayland desktops:
// dist/linux/M3E-<Colour>/ (index.theme + cursors/) and dist/linux/M3E-<Colour>.tar.gz.
// If tools/hyprcursor.mjs has run, its manifest.hl and hyprcursors/ go into the same folder, so
// the archive also works as a Hyprcursor theme on Hyprland.
//   node tools/linux.mjs [variant ...]
//
// Xcursor file (all little-endian): "Xcur", header size 16, version 0x10000, TOC count, then one
// TOC entry per image (type 0xfffd0002, nominal size, file offset). Each image chunk is a 36-byte
// header (size, type, nominal size, version 1, width, height, xhot, yhot, delay ms) followed by
// premultiplied ARGB pixels, top row first. Frames of an animation are consecutive images of the
// same nominal size.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VARIANTS, linuxSizes } from '../design/geometry.mjs';
import { LINUX } from '../design/platforms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'build/manifest.json'))).map((c) => [c.name, c]));
const frame = (v, name, px, i) => readFileSync(join(ROOT, 'build/frames', v, name, String(px), `${String(i).padStart(2, '0')}.png`));
const MAX_FPS = 30; // 60 fps strips are halved: the cycle length stays exact, the files stay a sane size

export function xcursor(images) { // images: [{ nominal, px, hot, delay, rgba }]
  const head = Buffer.alloc(16 + 12 * images.length);
  head.write('Xcur', 0, 'ascii'); head.writeUInt32LE(16, 4); head.writeUInt32LE(0x10000, 8);
  head.writeUInt32LE(images.length, 12);
  let offset = head.length;
  const chunks = images.map(({ nominal, px, hot, delay, rgba }, k) => {
    head.writeUInt32LE(0xfffd0002, 16 + 12 * k); head.writeUInt32LE(nominal, 20 + 12 * k); head.writeUInt32LE(offset, 24 + 12 * k);
    const c = Buffer.alloc(36 + px * px * 4);
    [36, 0xfffd0002, nominal, 1, px, px, hot[0], hot[1], delay].forEach((n, j) => c.writeUInt32LE(n, j * 4));
    for (let p = 0; p < px * px; p++) {
      const [r, g, b, a] = rgba.subarray(p * 4, p * 4 + 4);
      const m = (x) => Math.round((x * a) / 255);
      c.writeUInt32LE(((a << 24) | (m(r) << 16) | (m(g) << 8) | m(b)) >>> 0, 36 + p * 4);
    }
    offset += c.length;
    return c;
  });
  return Buffer.concat([head, ...chunks]);
}

function build(v) {
  const name = `M3E-${v.name}`;
  const out = join(ROOT, 'dist/linux', name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'cursors'), { recursive: true });
  for (const [cursor, [file, ...aliases]] of Object.entries(LINUX)) {
    const c = manifest[cursor];
    const step = c.frames > 1 ? Math.max(1, Math.round(1000 / MAX_FPS / (c.frameDuration * 1000))) : 1;
    const picks = [...Array(Math.ceil(c.frames / step)).keys()].map((k) => k * step);
    // Delays from the cumulative timeline (whole ms), so the loop length never drifts.
    const t = (i) => Math.round(Math.min(i, c.frames) * c.frameDuration * 1000);
    const images = linuxSizes.flatMap(([nominal, px]) => picks.map((i) => ({
      nominal, px,
      hot: c.hotspot.map((h) => Math.min(px - 1, Math.round(h * px / 32))),
      delay: c.frames > 1 ? t(i + step) - t(i) : 0,
      rgba: PNG.sync.read(frame(v.id, cursor, px, i)).data,
    })));
    writeFileSync(join(out, 'cursors', file), xcursor(images));
    for (const a of aliases) symlinkSync(file, join(out, 'cursors', a));
  }
  writeFileSync(join(out, 'index.theme'), [
    '[Icon Theme]', `Name=M3E ${v.name}`,
    `Comment=Material 3 Expressive cursors, ${v.name.toLowerCase()} palette`,
    'Inherits=breeze_cursors,Adwaita', '',
  ].join('\n'));
  const hypr = join(ROOT, 'dist/hyprcursor', name);
  if (existsSync(hypr)) cpSync(hypr, out, { recursive: true });
  execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: join(ROOT, 'dist/linux'), env: { ...process.env, COPYFILE_DISABLE: '1' } });
  console.log(`wrote dist/linux/${name}/ and ${name}.tar.gz`);
}

const only = process.argv.slice(2);
for (const v of VARIANTS.filter((v) => !only.length || only.includes(v.id))) build(v);
