// Builds previews/cursor-gallery.svg (+ .png) and previews/animation-preview/*.gif.
//   node tools/previews.mjs
// GIFs are flattened onto opaque light and dark backgrounds: GIF only has 1-bit transparency,
// which would fringe the anti-aliased rim.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'build/manifest.json')));
const frame = (name, px, i) => readFileSync(join(ROOT, 'build/frames', name, String(px), `${String(i).padStart(2, '0')}.png`));
const OUT = join(ROOT, 'previews');
rmSync(join(OUT, 'animation-preview'), { recursive: true, force: true });
mkdirSync(join(OUT, 'animation-preview'), { recursive: true });

// ---- gallery ----
const groups = [...new Set(manifest.map((c) => c.group))];
const COLS = 6, CELL_W = 150, CELL_H = 104, PAD = 24;
let y = PAD + 40, body = '';
const themes = [['#FEF7FF', '#1D1B20', '#49454F'], ['#141218', '#E6E0E9', '#CAC4D0']];
const W = COLS * CELL_W + PAD * 2;
for (const g of groups) {
  const items = manifest.filter((c) => c.group === g);
  body += `<text x="${PAD}" y="${y}" class="g">${g}</text>`;
  y += 14;
  items.forEach((c, i) => {
    const x = PAD + (i % COLS) * CELL_W, yy = y + Math.floor(i / COLS) * CELL_H;
    const href = 'data:image/png;base64,' + frame(c.name, 160, 0).toString('base64');
    body += `<g transform="translate(${x},${yy})"><rect class="cell" width="${CELL_W - 10}" height="${CELL_H - 10}" rx="16"/>
      <image href="${href}" x="${(CELL_W - 10) / 2 - 32}" y="6" width="64" height="64"/>
      <text x="${(CELL_W - 10) / 2}" y="${CELL_H - 18}" class="l" text-anchor="middle">${c.label.replace('&', '&amp;')}${c.frames > 1 ? ' ●' : ''}</text></g>`;
  });
  y += Math.ceil(items.length / COLS) * CELL_H + 22;
}
const H = y;
const gallery = (bg, fg, sub) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>text{font-family:-apple-system,'SF Pro Text',Roboto,sans-serif}.g{font-size:15px;font-weight:600;fill:${fg}}
.l{font-size:11.5px;fill:${sub}}.cell{fill:${fg};fill-opacity:.05}.t{font-size:22px;font-weight:700;fill:${fg}}</style>
<rect width="100%" height="100%" fill="${bg}"/><text x="${PAD}" y="${PAD + 12}" class="t">M3E Cursor — Purple</text>
<text x="${W - PAD}" y="${PAD + 12}" class="l" text-anchor="end">● animated · shown at 2× scale</text>${body}</svg>\n`;
writeFileSync(join(OUT, 'cursor-gallery.svg'), gallery(...themes[0]));
writeFileSync(join(OUT, 'cursor-gallery-dark.svg'), gallery(...themes[1]));
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const n of ['cursor-gallery', 'cursor-gallery-dark']) {
  await p.goto('file://' + join(OUT, `${n}.svg`));
  await p.screenshot({ path: join(OUT, `${n}.png`) });
}
await b.close();

// ---- animation GIFs ----
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
for (const c of manifest.filter((m) => m.frames > 1)) {
  for (const [tag, bg] of [['light', '#FFFFFF'], ['dark', '#1C1B1F']]) {
    const [br, bgc, bb] = hex(bg), px = 160;
    const gif = GIFEncoder();
    // Browsers play GIF delays under 20 ms as 100 ms, so long 60 fps strips are previewed at
    // every 3rd frame (~20 fps). Delays come from the cumulative timeline, so the loop length is exact.
    const step = Math.max(1, Math.ceil(0.04 / c.frameDuration));
    for (let i = 0; i < c.frames; i += step) {
      const src = PNG.sync.read(frame(c.name, px, i)).data, rgba = new Uint8Array(px * px * 4);
      for (let k = 0; k < px * px; k++) {
        const a = src[k * 4 + 3] / 255;
        rgba[k * 4] = src[k * 4] * a + br * (1 - a);
        rgba[k * 4 + 1] = src[k * 4 + 1] * a + bgc * (1 - a);
        rgba[k * 4 + 2] = src[k * 4 + 2] * a + bb * (1 - a);
        rgba[k * 4 + 3] = 255;
      }
      const palette = quantize(rgba, 256);
      // GIF delays are in 10 ms steps: round the cumulative timeline, not each frame.
      const cs = (n) => Math.round(n * c.frameDuration * 100) * 10;
      gif.writeFrame(applyPalette(rgba, palette), px, px, { palette, delay: cs(Math.min(i + step, c.frames)) - cs(i) });
    }
    gif.finish();
    writeFileSync(join(OUT, 'animation-preview', `${c.name}-${tag}.gif`), gif.bytes());
  }
}
console.log('previews written');
