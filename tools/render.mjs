// Renders every cursor to PNG frames at 32, 64, 160 and 320 px, and exports editable SVG sources.
//
//   node tools/render.mjs [name ...]                    every colour variant
//   M3E_VARIANT=blue node tools/render.mjs [name ...]   one variant
//
// Static and SVG-animated cursors are vector-rendered at each device scale (no bitmap upscaling).
// Loading cursors are rendered by the official <m3e-loading-indicator variant="contained">
// from @m3e/web, paused and seeked with the Web Animations API, one frame at a time.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cursors } from '../design/cursors.mjs';
import { T, C, VARIANT, VARIANTS, rgba, pixelSizesFor } from '../design/geometry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// No variant named: render each one in its own process (colours are fixed at module load).
if (!process.env.M3E_VARIANT) {
  for (const v of VARIANTS) {
    console.log(`== ${v.name}`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      { stdio: 'inherit', env: { ...process.env, M3E_VARIANT: v.id } });
    if (r.status) process.exit(r.status);
  }
  process.exit(0);
}
const M3E = join(ROOT, 'node_modules/@m3e/web/dist/all.min.js');
const RIM = T.edge.rimWidth.value, HAIR = T.edge.hairlineWidth.value;
const LOADING_MS = T.motion.loadingIndicator.cycleMs;

const only = new Set(process.argv.slice(2));
const list = cursors.filter((c) => !only.size || only.has(c.name));

const page0 = (body) => `<!doctype html><html><head><style>
  html,body{margin:0;background:transparent}
  #c{position:relative;width:32px;height:32px;overflow:hidden}
  #c>svg{position:absolute;inset:0}
  m3e-loading-indicator{position:absolute;border-radius:50%;
    box-shadow:0 0 0 ${RIM}px ${C.rim},0 0 0 ${RIM + HAIR}px ${rgba(C.hairline, T.color.hairline.opacity)}}
</style></head><body><div id="c">${body}</div></body></html>`;

function loadingHTML(c) {
  const { container, center: [cx, cy], under } = c.loading;
  const active = container * 38 / 48; // documented 48 : 38 container : active ratio
  return page0(`${under ? under() : ''}<m3e-loading-indicator variant="contained" style="
    left:${cx - container / 2}px;top:${cy - container / 2}px;
    --m3e-loading-indicator-container-size:${container}px;
    --m3e-loading-indicator-active-indicator-size:${active}px;
    --m3e-loading-indicator-contained-container-color:${C.primaryContainer};
    --m3e-loading-indicator-contained-active-indicator-color:${C.onPrimaryContainer};"></m3e-loading-indicator>`);
}

async function seek(page, ms) {
  await page.evaluate((t) => {
    const root = document.querySelector('m3e-loading-indicator').shadowRoot;
    for (const el of root.querySelectorAll('*'))
      for (const a of el.getAnimations()) { a.pause(); a.currentTime = t; }
  }, ms);
}

const browser = await chromium.launch({ channel: 'chrome' });
for (const c of list) {
  const frames = c.frames ?? 1;
  const srcDir = join(ROOT, 'cursors', c.name);
  const outDir = join(ROOT, 'build/frames', VARIANT.id, c.name);
  rmSync(outDir, { recursive: true, force: true });

  // Editable sources: the SVG (first frame for animated vector cursors), exported in purple.
  // Other variants differ only in the colours from design/variants.json.
  if (VARIANT.id === 'purple') {
    mkdirSync(srcDir, { recursive: true });
    if (c.svg) writeFileSync(join(srcDir, `${c.name}.svg`), c.svg(0) + '\n');
    if (c.loading?.under) writeFileSync(join(srcDir, `${c.name}-base.svg`), c.loading.under() + '\n');
    if (c.svg && frames > 1) {
      mkdirSync(join(srcDir, 'frames'), { recursive: true });
      for (let i = 0; i < frames; i++)
        writeFileSync(join(srcDir, 'frames', `${String(i).padStart(2, '0')}.svg`), c.svg(i) + '\n');
    }
  }

  await Promise.all(pixelSizesFor(frames).map(async (px) => {
    const s = px / 32;
    const dir = join(outDir, String(px));
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ deviceScaleFactor: s, viewport: { width: 64, height: 64 } });
    if (!c.loading) await page.setContent(page0(''));
    if (c.loading) {
      await page.setContent(loadingHTML(c));
      await page.addScriptTag({ path: M3E, type: 'module' });
      await page.waitForFunction(() => document.querySelector('m3e-loading-indicator')?.shadowRoot
        ?.querySelector('.active-indicator')?.getAnimations().length === 1);
    }
    for (let i = 0; i < frames; i++) {
      if (c.loading) await seek(page, (i * LOADING_MS) / frames);
      else await page.evaluate((s) => { document.getElementById('c').innerHTML = s; }, c.svg(i));
      await page.screenshot({ path: join(dir, `${String(i).padStart(2, '0')}.png`),
        clip: { x: 0, y: 0, width: 32, height: 32 }, omitBackground: true, animations: 'allow' });
    }
    await page.close();
  }));
  console.log(`rendered ${VARIANT.id}/${c.name} (${frames} frame${frames > 1 ? 's' : ''})`);
}
await browser.close();

// Metadata for packaging comes straight from the definitions, so it is always complete.
const manifest = cursors.map((c) => ({ name: c.name, label: c.label, group: c.group, roles: c.roles,
  hotspot: c.hotspot, frames: c.frames ?? 1, frameDuration: (c.frames ?? 1) > 1 ? +(c.frameMs / 1000).toFixed(5) : 1 }));
writeFileSync(join(ROOT, 'build/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
