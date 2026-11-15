// Inspection contact sheet: each cursor at true 1x and 2x pixels (magnified without smoothing)
// and at 10x, over light, mid and dark backgrounds, with the hotspot marked.
//   node tools/sheet.mjs out.png [frame] [name ...]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cursors } from '../design/cursors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, frameArg = '0', ...names] = process.argv.slice(2);
const list = cursors.filter((c) => !names.length || names.includes(c.name));
const img = (c, px) => {
  const f = String(Math.min(+frameArg, (c.frames ?? 1) - 1)).padStart(2, '0');
  return 'data:image/png;base64,' + readFileSync(join(ROOT, 'build/frames', c.name, String(px), `${f}.png`)).toString('base64');
};
const bgs = ['#ffffff', '#8a8a8a', '#1c1b1f', 'linear-gradient(135deg,#f4b400,#0f9d58 50%,#4285f4)'];
const rows = list.map((c) => `<tr><td class=l>${c.name}</td>${bgs.map((bg) => `<td style="background:${bg}">
  <img src="${img(c, 32)}" style="width:96px;image-rendering:pixelated">
  <img src="${img(c, 64)}" style="width:96px;image-rendering:pixelated">
  <span class=h><img src="${img(c, (c.frames ?? 1) > 24 ? 160 : 320)}" style="width:128px">
  <i style="left:${c.hotspot[0] * 4 - 3}px;top:${c.hotspot[1] * 4 - 3}px"></i></span></td>`).join('')}</tr>`).join('');
const html = `<style>body{margin:0;font:12px system-ui}td{padding:6px;vertical-align:middle}
.l{width:70px}.h{position:relative;display:inline-block}
.h i{position:absolute;width:6px;height:6px;border-radius:50%;background:#ff0040;outline:1px solid #fff}</style>
<table cellspacing=0>${rows}</table>`;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1500, height: 200 } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
