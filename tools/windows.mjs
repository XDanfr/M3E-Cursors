// Builds Windows cursor schemes: dist/windows/M3E-<Colour>/ with .cur / .ani files and install.inf.
//   node tools/windows.mjs [variant ...]
//
// .cur: an ICONDIR of type 2 whose entries carry their own hotspot. Every size is stored as a
//       PNG-compressed image (supported since Windows Vista).
// .ani: RIFF 'ACON' with an 'anih' header, a 'rate' chunk in jiffies (1/60 s) and a LIST 'fram'
//       of 'icon' chunks, each a complete multi-size .cur. 280 frames x 1 jiffy = 4.666 s, the
//       loading indicator's own cycle.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VARIANTS, windowsSizesFor } from '../design/geometry.mjs';
import { WINDOWS } from '../design/platforms.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'build/manifest.json'))).map((c) => [c.name, c]));
const frame = (v, name, px, i) => readFileSync(join(ROOT, 'build/frames', v, name, String(px), `${String(i).padStart(2, '0')}.png`));

export function cur(images) { // images: [{ px, hot: [x, y], png }]
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(2, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ px, hot, png }, k) => {
    const e = 6 + 16 * k;
    head.writeUInt8(px >= 256 ? 0 : px, e); head.writeUInt8(px >= 256 ? 0 : px, e + 1);
    head.writeUInt16LE(hot[0], e + 4); head.writeUInt16LE(hot[1], e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
}

const chunk = (id, data) => {
  const h = Buffer.alloc(8); h.write(id, 0, 'ascii'); h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, Buffer.alloc(data.length % 2)]);
};
const list = (type, chunks) => chunk('LIST', Buffer.concat([Buffer.from(type, 'ascii'), ...chunks]));
const zstr = (s) => Buffer.from(s + '\0', 'utf8');

export function ani(frames, jiffies, title) {
  const anih = Buffer.alloc(36);
  [36, frames.length, frames.length, 0, 0, 0, 0, jiffies[0], 1 /* AF_ICON */].forEach((v, k) => anih.writeUInt32LE(v, k * 4));
  const rate = Buffer.alloc(4 * jiffies.length);
  jiffies.forEach((j, k) => rate.writeUInt32LE(j, k * 4));
  const body = Buffer.concat([
    Buffer.from('ACON', 'ascii'),
    list('INFO', [chunk('INAM', zstr(title)), chunk('IART', zstr('M3E Cursors'))]),
    chunk('anih', anih), chunk('rate', rate),
    list('fram', frames.map((f) => chunk('icon', f))),
  ]);
  return chunk('RIFF', body).subarray(0, 8 + body.length);
}

const images = (v, c, i) => windowsSizesFor(c.frames).map((px) => ({
  px, png: frame(v, c.name, px, i),
  hot: c.hotspot.map((h) => Math.min(px - 1, Math.round(h * px / 32))),
}));

function inf(v, dir) {
  const files = WINDOWS.map(([, , file]) => file);
  const path = (file) => `%10%\\%CUR_DIR%\\${file}`;
  const lines = [
    `; M3E Cursors - ${v.name}`,
    '; Right-click this file and choose Install (on Windows 11: Show more options > Install).',
    '; Then open Settings > Bluetooth & devices > Mouse > Additional mouse settings > Pointers,',
    `; pick "${dir}" from the Scheme list and click Apply.`,
    '',
    '[Version]',
    'signature="$CHICAGO$"',
    '',
    '[DefaultInstall]',
    'CopyFiles = Scheme.Cur',
    'AddReg    = Scheme.Reg, Wreg',
    '',
    '[DestinationDirs]',
    'Scheme.Cur = 10,"%CUR_DIR%"',
    '',
    '[Scheme.Reg]',
    `HKCU,"Control Panel\\Cursors\\Schemes","%SCHEME_NAME%",,"${files.map(path).join(',')}"`,
    '',
    '[Wreg]',
    'HKCU,"Control Panel\\Cursors",,0x00020000,"%SCHEME_NAME%"',
    ...WINDOWS.map(([role, , file]) => `HKCU,"Control Panel\\Cursors",${role},0x00020000,"${path(file)}"`),
    '',
    '[Scheme.Cur]',
    ...files,
    '',
    '[Strings]',
    `CUR_DIR     = "Cursors\\${dir}"`,
    `SCHEME_NAME = "${dir}"`,
    '',
  ];
  return lines.join('\r\n');
}

const only = process.argv.slice(2);
for (const v of VARIANTS.filter((v) => !only.length || only.includes(v.id))) {
  const dir = `M3E ${v.name}`;
  const out = join(ROOT, 'dist/windows', `M3E-${v.name}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let bytes = 0;
  for (const [, name, file] of WINDOWS) {
    const c = manifest[name];
    let data;
    if (file.endsWith('.ani')) {
      const frames = [...Array(c.frames).keys()].map((i) => cur(images(v.id, c, i)));
      // Jiffies from the cumulative timeline, so rounding never drifts the cycle length.
      const at = (n) => Math.round(n * c.frameDuration * 60);
      data = ani(frames, frames.map((_, i) => Math.max(1, at(i + 1) - at(i))), `${dir} ${c.label}`);
    } else {
      data = cur(images(v.id, c, 0));
    }
    writeFileSync(join(out, file), data);
    bytes += data.length;
  }
  writeFileSync(join(out, 'install.inf'), inf(v, dir));
  console.log(`wrote dist/windows/M3E-${v.name}/  (${WINDOWS.length} cursors, ${(bytes / 1e6).toFixed(1)} MB)`);
}
