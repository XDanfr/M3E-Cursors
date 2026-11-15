// Validates rendered assets and every packaged theme.
//   node tools/validate.mjs
// Checks: frame counts, dimensions, alpha channel and transparent margins, hotspot placement,
// role coverage against MaCursor's slot list, and the same plist rules MaCursor's
// CursorThemeWriter.validateThemePlist applies to its own output. Windows .cur / .ani files and
// Linux Xcursor files are parsed back: structure, sizes, hotspots, frame counts and loop length.
import { PNG } from 'pngjs';
import { pixelSizesFor, windowsSizesFor, linuxSizes, VARIANTS } from '../design/geometry.mjs';
import { WINDOWS, LINUX } from '../design/platforms.mjs';
import { readFileSync, existsSync, lstatSync, readlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'build/manifest.json')));
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

// Every identifier MaCursor names in MACCursorDefinitions.cursorMap, with the roles this theme
// deliberately leaves to macOS (documented in README "Supported roles").
const KNOWN = ['Arrow', 'IBeam', 'IBeamXOR', 'Alias', 'Copy', 'Move', 'ArrowCtx', 'Wait', 'Empty', 'ArrowS', 'IBeamS']
  .map((s) => 'com.apple.coregraphics.' + s)
  .concat([...Array(44).keys()].filter((n) => n !== 6).map((n) => 'com.apple.cursor.' + n));
const INTENTIONALLY_UNSET = new Set(['com.apple.coregraphics.Empty', 'com.apple.cursor.0', 'com.apple.cursor.1',
  'com.apple.cursor.14', 'com.apple.cursor.15', 'com.apple.cursor.16', 'com.apple.cursor.25']);

// ---- assets ----
const seen = new Map(), clipped = new Set();
for (const c of manifest) {
  // MaCursor imports longer strips as-is and plays them in its preview; its engine resamples
  // anything over 24 frames to 24 when the theme is applied (MACCursorActions.prepareImages).
  if (c.frames < 1 || c.frames > 300) err(`${c.name}: ${c.frames} frames`);
  if (c.frames > 24) warn(`${c.name}: ${c.frames} frames - MaCursor resamples to 24 when applying`);
  const [hx, hy] = c.hotspot;
  if (!(hx >= 0 && hx < 32 && hy >= 0 && hy < 32)) err(`${c.name}: hotspot ${c.hotspot} outside the 32 pt canvas`);
  for (const r of c.roles) {
    if (seen.has(r)) err(`${r} assigned twice (${seen.get(r)}, ${c.name})`);
    seen.set(r, c.name);
    if (!KNOWN.includes(r)) err(`${c.name}: ${r} is not a MaCursor slot`);
  }
  for (const v of VARIANTS) for (const px of pixelSizesFor(c.frames)) for (let i = 0; i < c.frames; i++) {
    const file = join(ROOT, 'build/frames', v.id, c.name, String(px), `${String(i).padStart(2, '0')}.png`);
    if (!existsSync(file)) { err(`${v.id}/${c.name}: missing ${px}px frame ${i}`); continue; }
    const png = PNG.sync.read(readFileSync(file));
    if (png.width !== px || png.height !== px) err(`${v.id}/${c.name}: ${px}px frame ${i} is ${png.width}x${png.height}`);
    const a = (x, y) => png.data[(y * px + x) * 4 + 3];
    let opaque = 0, edge = 0;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      if (a(x, y) > 0) { opaque++; if (x === 0 || y === 0 || x === px - 1 || y === px - 1) edge++; }
    }
    if (!opaque) err(`${v.id}/${c.name}: ${px}px frame ${i} is empty`);
    if (opaque === px * px) err(`${v.id}/${c.name}: ${px}px frame ${i} has no transparency`);
    if (edge && !clipped.has(`${v.id}/${c.name}@${px}`)) { clipped.add(`${v.id}/${c.name}@${px}`); warn(`${v.id}/${c.name}: ${px}px artwork touches the canvas edge (frame ${i}) - possible clipping`); }
    if (px === pixelSizesFor(c.frames).at(-1)) { // hotspot must sit on (or within 1 pt of) visible artwork
      const k = px / 32;
      let near = false;
      for (let dy = -k; dy <= k && !near; dy++) for (let dx = -k; dx <= k && !near; dx++) {
        const x = Math.round(hx * k) + dx, y = Math.round(hy * k) + dy;
        if (dx * dx + dy * dy <= k * k && x >= 0 && y >= 0 && x < px && y < px && a(x, y) > 128) near = true;
      }
      if (!near) err(`${v.id}/${c.name}: frame ${i} hotspot (${hx}, ${hy}) is more than 1 pt from the artwork`);
    }
  }
}
const missing = KNOWN.filter((r) => !seen.has(r) && !INTENTIONALLY_UNSET.has(r));
if (missing.length) err(`roles with no cursor: ${missing.join(', ')}`);

// ---- packaged themes ----
for (const name of VARIANTS.flatMap((v) => [`M3E-${v.name}`, `M3E-${v.name}-ReducedMotion`])) {
  const file = join(ROOT, 'dist/macos', `${name}.cursor`);
  if (!existsSync(file)) { err(`dist/macos/${name}.cursor not built`); continue; }
  execFileSync('plutil', ['-lint', '-s', file]);
  // Parse with Apple's plist rules via Python's plistlib (plutil's JSON output can't carry <data>).
  const d = JSON.parse(execFileSync('python3', ['-I', '-c',
    'import plistlib,json,sys,base64;print(json.dumps(plistlib.load(open(sys.argv[1],"rb")),' +
    'default=lambda b: base64.b64encode(b).decode()))', file], { maxBuffer: 1 << 30 }));
  for (const k of ['ThemeName', 'Creator', 'Identifier', 'UUID']) if (typeof d[k] !== 'string') err(`${name}: ${k} missing`);
  if (typeof d.ThemeVersion !== 'number') err(`${name}: ThemeVersion missing`);
  if (typeof d.HiDPI !== 'boolean') err(`${name}: HiDPI missing`);
  if (d.UUID !== d.UUID?.toUpperCase()) err(`${name}: UUID not uppercase`);
  for (const [id, cur] of Object.entries(d.Cursors ?? {})) {
    for (const k of ['FrameCount', 'FrameDuration', 'HotSpotX', 'HotSpotY', 'PointsWide', 'PointsHigh'])
      if (typeof cur[k] !== 'number') err(`${name} ${id}: ${k} missing`);
    const widths = cur.Representations.map((b64) => {
      const png = PNG.sync.read(Buffer.from(b64, 'base64'));
      if (png.height !== png.width * cur.FrameCount) err(`${name} ${id}: strip ${png.width}x${png.height} != FrameCount ${cur.FrameCount}`);
      return png.width;
    });
    const src = manifest.find((m) => m.roles.includes(id));
    if (widths.join() !== pixelSizesFor(src.frames).join()) err(`${name} ${id}: representation widths ${widths}`);
    if (name.endsWith('ReducedMotion') && cur.FrameCount !== 1) err(`${name} ${id}: animated in reduced-motion theme`);
  }
  console.log(`${name}.cursor: ${Object.keys(d.Cursors).length} roles, plist OK`);
}

// ---- Windows ----
const byName = Object.fromEntries(manifest.map((c) => [c.name, c]));
function readCur(buf, where, sizes) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 2) return err(`${where}: not a .cur`);
  const n = buf.readUInt16LE(4), got = [];
  for (let k = 0; k < n; k++) {
    const e = 6 + 16 * k, px = buf[e] || 256, hx = buf.readUInt16LE(e + 4), hy = buf.readUInt16LE(e + 6);
    const png = PNG.sync.read(buf.subarray(buf.readUInt32LE(e + 12), buf.readUInt32LE(e + 12) + buf.readUInt32LE(e + 8)));
    if (png.width !== px || png.height !== px) err(`${where}: entry ${px} decodes as ${png.width}x${png.height}`);
    if (hx >= px || hy >= px) err(`${where}: hotspot ${hx},${hy} outside ${px}px`);
    got.push(px);
  }
  if (got.join() !== sizes.join()) err(`${where}: sizes ${got} != ${sizes}`);
}
function riff(buf, at, end, out = []) { // flat list of [id, data] incl. LIST children
  while (at + 8 <= end) {
    const id = buf.toString('ascii', at, at + 4), len = buf.readUInt32LE(at + 4), data = buf.subarray(at + 8, at + 8 + len);
    out.push([id, data]);
    if (id === 'LIST') riff(buf, at + 12, at + 8 + len, out);
    at += 8 + len + (len % 2);
  }
  return out;
}
for (const v of VARIANTS) {
  const dir = join(ROOT, 'dist/windows', `M3E-${v.name}`);
  if (!existsSync(dir)) { err(`dist/windows/M3E-${v.name} not built`); continue; }
  const inf = readFileSync(join(dir, 'install.inf'), 'utf8');
  for (const [role, name, file] of WINDOWS) {
    const c = byName[name], where = `windows/${v.id}/${file}`;
    if (!inf.includes(`,${role},`) || !inf.includes(`\r\n${file}\r\n`)) err(`${where}: missing from install.inf`);
    const buf = readFileSync(join(dir, file));
    if (file.endsWith('.cur')) { readCur(buf, where, windowsSizesFor(1)); continue; }
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'ACON') { err(`${where}: not an ACON RIFF`); continue; }
    const chunks = riff(buf, 12, buf.length), anih = chunks.find(([id]) => id === 'anih')[1];
    const icons = chunks.filter(([id]) => id === 'icon'), rate = chunks.find(([id]) => id === 'rate')[1];
    if (anih.readUInt32LE(4) !== c.frames || icons.length !== c.frames) err(`${where}: ${icons.length} frames, expected ${c.frames}`);
    let jiffies = 0; for (let k = 0; k < rate.length; k += 4) jiffies += rate.readUInt32LE(k);
    const cycle = Math.round(c.frames * c.frameDuration * 60);
    if (jiffies !== cycle) err(`${where}: loop is ${jiffies} jiffies, expected ${cycle}`);
    icons.forEach(([, d], k) => k % 40 === 0 && readCur(d, `${where} frame ${k}`, windowsSizesFor(c.frames)));
  }
}

// ---- Linux ----
for (const v of VARIANTS) {
  const dir = join(ROOT, 'dist/linux', `M3E-${v.name}`);
  if (!existsSync(join(dir, 'index.theme'))) { err(`dist/linux/M3E-${v.name} not built`); continue; }
  if (!existsSync(join(ROOT, 'dist/linux', `M3E-${v.name}.tar.gz`))) err(`dist/linux/M3E-${v.name}.tar.gz missing`);
  for (const [name, [file, ...aliases]] of Object.entries(LINUX)) {
    const c = byName[name], where = `linux/${v.id}/${file}`;
    for (const a of aliases) {
      const p = join(dir, 'cursors', a);
      if (!existsSync(p) || !lstatSync(p).isSymbolicLink() || readlinkSync(p) !== file) err(`linux/${v.id}/${a}: not a link to ${file}`);
    }
    const buf = readFileSync(join(dir, 'cursors', file));
    if (buf.toString('ascii', 0, 4) !== 'Xcur') { err(`${where}: not an Xcursor file`); continue; }
    const n = buf.readUInt32LE(12), per = {};
    for (let k = 0; k < n; k++) {
      const pos = buf.readUInt32LE(24 + 12 * k), nominal = buf.readUInt32LE(pos + 8);
      const [w, h, hx, hy, delay] = [16, 20, 24, 28, 32].map((o) => buf.readUInt32LE(pos + o));
      const px = linuxSizes.find(([nm]) => nm === nominal)?.[1];
      if (w !== px || h !== px) err(`${where}: ${nominal} image is ${w}x${h}, expected ${px}`);
      if (hx >= w || hy >= h) err(`${where}: hotspot outside image`);
      (per[nominal] ??= []).push(delay);
    }
    for (const [nominal] of linuxSizes) {
      const d = per[nominal] ?? [];
      if (!d.length) err(`${where}: no ${nominal} images`);
      const total = d.reduce((a, b) => a + b, 0), want = c.frames > 1 ? Math.round(c.frames * c.frameDuration * 1000) : 0;
      if (total !== want) err(`${where}: ${nominal} loop is ${total} ms, expected ${want}`);
    }
  }
}

console.log(`windows: ${VARIANTS.length} schemes x ${WINDOWS.length} roles; linux: ${VARIANTS.length} themes x ${Object.keys(LINUX).length} cursors, ${Object.values(LINUX).flat().length} names`);
console.log(`${manifest.length} cursors x ${VARIANTS.length} variants, ${seen.size} roles covered`);
for (const w of warnings) console.log('warning:', w);
for (const e of errors) console.log('ERROR:', e);
process.exit(errors.length ? 1 : 0);
