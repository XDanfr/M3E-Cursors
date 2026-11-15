// Screenshots for MaCursor's theme gallery: dist/gallery/screenshots/M3ECursor<Colour>.png.
//   node tools/gallery-shot.mjs [variant ...]
// Matches the existing gallery images (themes/screenshots/*.png): 2598 x 840, MaCursor's theme
// detail view with the title, "by <creator> • v<version>", the cursor count, and the first three
// rows of 13 cards in MaCursor's alphabetical order, each labelled with MaCursor's slot name
// (MACCursorDefinitions.cursorMap).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VARIANTS } from '../design/geometry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'build/manifest.json')));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json')));
const NAMES = {
  'coregraphics.Arrow': 'Arrow', 'coregraphics.IBeam': 'IBeam', 'coregraphics.IBeamXOR': 'IBeamXOR',
  'coregraphics.Alias': 'Alias', 'coregraphics.Copy': 'Copy', 'coregraphics.Move': 'Move',
  'coregraphics.ArrowCtx': 'Ctx Arrow', 'coregraphics.Wait': 'Wait',
  'cursor.2': 'Link', 'cursor.3': 'Forbidden', 'cursor.4': 'Busy', 'cursor.5': 'Copy Drag', 'cursor.7': 'Crosshair',
  'cursor.8': 'Crosshair 2', 'cursor.9': 'Camera 2', 'cursor.10': 'Camera', 'cursor.11': 'Closed', 'cursor.12': 'Open',
  'cursor.13': 'Pointing', 'cursor.17': 'Resize W', 'cursor.18': 'Resize E', 'cursor.19': 'Resize W-E',
  'cursor.20': 'Cell XOR', 'cursor.21': 'Resize N', 'cursor.22': 'Resize S', 'cursor.23': 'Resize N-S',
  'cursor.24': 'Ctx Menu', 'cursor.26': 'IBeam H.', 'cursor.27': 'Window E', 'cursor.28': 'Window E-W',
  'cursor.29': 'Window NE', 'cursor.30': 'Window NE-SW', 'cursor.31': 'Window N', 'cursor.32': 'Window N-S',
  'cursor.33': 'Window NW', 'cursor.34': 'Window NW-SE', 'cursor.35': 'Window SE', 'cursor.36': 'Window S',
  'cursor.37': 'Window SW', 'cursor.38': 'Window W', 'cursor.39': 'Resize Square', 'cursor.40': 'Help',
  'cursor.41': 'Cell', 'cursor.42': 'Zoom In', 'cursor.43': 'Zoom Out',
};
// MaCursor truncates long labels in the middle: "Wind…E-SW", "Resiz…quare".
const short = (s) => (s.length < 12 ? s : s.length === 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : `${s.slice(0, 5)}…${s.slice(-5)}`);

const slots = manifest.flatMap((c) => c.roles.map((r) => ({ label: NAMES[r.replace(/^com\.apple\./, '')], cursor: c.name })))
  .filter((s) => s.label) // ArrowS / IBeamS are hidden in MaCursor
  .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
const img = (v, name) => 'data:image/png;base64,' +
  readFileSync(join(ROOT, 'build/frames', v, name, '160', '00.png')).toString('base64');

const page = (v) => `<!doctype html><html><head><style>
  /* Measured from themes/screenshots/*.png at 1299 x 420 CSS px (2x = 2598 x 840). */
  body{margin:0;width:1299px;height:420px;overflow:hidden;background:#fff;
    font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;-webkit-font-smoothing:antialiased}
  header{height:64px;border-bottom:1px solid #e3e3e6;position:relative}
  h1{position:absolute;left:16px;top:10px;margin:0;font-size:17px;font-weight:700;color:#1d1d1f;letter-spacing:-.2px}
  .by{position:absolute;left:16px;top:34px;font-size:11px;color:#6e6e73}
  .count{position:absolute;right:16px;top:23px;font-size:11.5px;color:#6e6e73}
  main{display:grid;grid-template-columns:repeat(13,80px);column-gap:18.7px;row-gap:16.3px;padding:16.5px 17.5px}
  .card{height:98.7px;box-sizing:border-box;border:.7px solid #dcdce0;border-radius:7px;background:#fff;
    box-shadow:0 .6px 2px rgba(0,0,0,.07);display:flex;flex-direction:column;align-items:center}
  .card img{width:68px;height:68px;margin-top:3px}
  .card span{margin-top:auto;margin-bottom:9px;font-size:10.4px;color:#1d1d1f;letter-spacing:.1px}
</style></head><body>
<header><h1>M3E Cursor ${v.name}</h1><div class="by">by ${pkg.author} • v${parseFloat(pkg.version).toFixed(1)}</div><div class="count">${slots.length} cursors</div></header>
<main>${slots.slice(0, 39).map((s) => `<div class="card"><img src="${img(v.id, s.cursor)}"><span>${short(s.label)}</span></div>`).join('')}</main>
</body></html>`;

const only = process.argv.slice(2);
const out = join(ROOT, 'dist/gallery/screenshots');
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1299, height: 420 }, deviceScaleFactor: 2 });
for (const v of VARIANTS.filter((v) => !only.length || only.includes(v.id))) {
  await p.setContent(page(v));
  const file = join(out, `M3ECursor${v.slug}.png`);
  await p.screenshot({ path: file });
  console.log(`wrote ${file.slice(ROOT.length + 1)}`);
}
await b.close();
