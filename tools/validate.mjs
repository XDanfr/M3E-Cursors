// Validates rendered assets and the packaged theme.
//   node tools/validate.mjs
// Checks: frame counts, dimensions, alpha channel and transparent margins, hotspot placement,
// role coverage against MaCursor's slot list, and the same plist rules MaCursor's
// CursorThemeWriter.validateThemePlist applies to its own output.
import { PNG } from 'pngjs';
import { pixelSizesFor } from '../design/geometry.mjs';
import { readFileSync, existsSync } from 'node:fs';
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
  for (const px of pixelSizesFor(c.frames)) for (let i = 0; i < c.frames; i++) {
    const file = join(ROOT, 'build/frames', c.name, String(px), `${String(i).padStart(2, '0')}.png`);
    if (!existsSync(file)) { err(`${c.name}: missing ${px}px frame ${i}`); continue; }
    const png = PNG.sync.read(readFileSync(file));
    if (png.width !== px || png.height !== px) err(`${c.name}: ${px}px frame ${i} is ${png.width}x${png.height}`);
    const a = (x, y) => png.data[(y * px + x) * 4 + 3];
    let opaque = 0, edge = 0;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      if (a(x, y) > 0) { opaque++; if (x === 0 || y === 0 || x === px - 1 || y === px - 1) edge++; }
    }
    if (!opaque) err(`${c.name}: ${px}px frame ${i} is empty`);
    if (opaque === px * px) err(`${c.name}: ${px}px frame ${i} has no transparency`);
    if (edge && !clipped.has(`${c.name}@${px}`)) { clipped.add(`${c.name}@${px}`); warn(`${c.name}: ${px}px artwork touches the canvas edge (frame ${i}) - possible clipping`); }
    if (px === pixelSizesFor(c.frames).at(-1)) { // hotspot must sit on (or within 1 pt of) visible artwork
      const k = px / 32;
      let near = false;
      for (let dy = -k; dy <= k && !near; dy++) for (let dx = -k; dx <= k && !near; dx++) {
        const x = Math.round(hx * k) + dx, y = Math.round(hy * k) + dy;
        if (dx * dx + dy * dy <= k * k && x >= 0 && y >= 0 && x < px && y < px && a(x, y) > 128) near = true;
      }
      if (!near) err(`${c.name}: frame ${i} hotspot (${hx}, ${hy}) is more than 1 pt from the artwork`);
    }
  }
}
const missing = KNOWN.filter((r) => !seen.has(r) && !INTENTIONALLY_UNSET.has(r));
if (missing.length) err(`roles with no cursor: ${missing.join(', ')}`);

// ---- packaged themes ----
for (const name of ['M3E-Purple', 'M3E-Purple-ReducedMotion']) {
  const file = join(ROOT, 'dist', `${name}.cursor`);
  if (!existsSync(file)) { err(`dist/${name}.cursor not built`); continue; }
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

console.log(`${manifest.length} cursors, ${seen.size} roles covered`);
for (const w of warnings) console.log('warning:', w);
for (const e of errors) console.log('ERROR:', e);
process.exit(errors.length ? 1 : 0);
