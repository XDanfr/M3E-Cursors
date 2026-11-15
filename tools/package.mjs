// Packs rendered frames into MaCursor's native .cursor theme (an XML property list).
//
// The format follows MaCursor's own writer, MaCursor/SwiftUI/Services/CursorThemeWriter.swift:
//   root:   ThemeName, ThemeVersion, Creator, HiDPI, Identifier, UUID (uppercase), Cursors
//   cursor: FrameCount, FrameDuration (s per frame), HotSpotX/Y (pt), PointsWide/High (32),
//           Representations = PNG data, one per pixel size (32/64/160, plus 320 for short
//           animations), each a vertical strip of FrameCount frames with frame 0 at the top.
//           MaCursor's own writer stops at 24 frames. Longer strips import and play in its
//           preview, and its engine resamples them to 24 when it applies the theme.
//
//   node tools/package.mjs [variant ...]   -> dist/M3E-<Variant>.cursor + dist/M3E-<Variant>-ReducedMotion.cursor
import { PNG } from 'pngjs';
import { pixelSizesFor, VARIANTS } from '../design/geometry.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'build/manifest.json')));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json')));

const framePath = (variant, name, px, i) =>
  join(ROOT, 'build/frames', variant, name, String(px), `${String(i).padStart(2, '0')}.png`);

function strip(variant, name, px, frames) {
  const out = new PNG({ width: px, height: px * frames });
  for (let i = 0; i < frames; i++) {
    const f = PNG.sync.read(readFileSync(framePath(variant, name, px, i)));
    if (f.width !== px || f.height !== px) throw new Error(`${name} ${px}px frame ${i} is ${f.width}x${f.height}`);
    f.data.copy(out.data, i * px * px * 4);
  }
  return PNG.sync.write(out, { colorType: 6 });
}

// Name-based UUID (v5 layout) so rebuilds keep the same theme identity.
function uuid5(name) {
  const h = createHash('sha1').update('7A0F5A46-2A44-4F8E-8D1B-3C9A1F6E2B47' + name).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex').toUpperCase();
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const real = (n) => `<real>${Number.isInteger(n) ? n : +n.toFixed(5)}</real>`;
const b64 = (buf) => buf.toString('base64').replace(/.{1,68}/g, '\t\t\t\t$&\n');

// MaCursor derives a theme's Identifier from its name (spaces, '/' and ':' removed, as
// CursorThemeWriter.sanitizeIdentifier does) and renames anything else on import.
const sanitize = (name) => name.trim().replace(/[ /:]/g, '');

function build({ variant, themeName, file: fileName, reducedMotion }) {
  const identifier = sanitize(themeName);
  const entries = [];
  for (const c of manifest) {
    const frames = reducedMotion ? 1 : c.frames;
    const duration = frames > 1 ? c.frameDuration : 1;
    const reps = pixelSizesFor(c.frames).map((px) => strip(variant, c.name, px, frames));
    for (const role of c.roles) entries.push([role, `
\t\t<key>${role}</key>
\t\t<dict>
\t\t\t<key>FrameCount</key><integer>${frames}</integer>
\t\t\t<key>FrameDuration</key>${real(duration)}
\t\t\t<key>HotSpotX</key>${real(c.hotspot[0])}
\t\t\t<key>HotSpotY</key>${real(c.hotspot[1])}
\t\t\t<key>PointsHigh</key>${real(32)}
\t\t\t<key>PointsWide</key>${real(32)}
\t\t\t<key>Representations</key>
\t\t\t<array>
${reps.map((r) => `\t\t\t\t<data>\n${b64(r)}\t\t\t\t</data>`).join('\n')}
\t\t\t</array>
\t\t</dict>`]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Creator</key><string>M3E Cursor project</string>
\t<key>Cursors</key>
\t<dict>${entries.map(([, e]) => e).join('')}
\t</dict>
\t<key>HiDPI</key><true/>
\t<key>Identifier</key><string>${identifier}</string>
\t<key>ThemeName</key><string>${esc(themeName)}</string>
\t<key>ThemeVersion</key>${real(parseFloat(pkg.version))}
\t<key>UUID</key><string>${uuid5(identifier)}</string>
</dict>
</plist>
`;
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const file = join(ROOT, 'dist', `${fileName}.cursor`);
  writeFileSync(file, xml);
  console.log(`wrote ${file.slice(ROOT.length + 1)}  (${entries.length} roles, ${(xml.length / 1e6).toFixed(2)} MB)`);
}

const only = process.argv.slice(2);
for (const v of VARIANTS.filter((v) => !only.length || only.includes(v.id))) {
  build({ variant: v.id, themeName: `M3E Cursor ${v.name}`, file: `M3E-${v.name}`, reducedMotion: false });
  build({ variant: v.id, themeName: `M3E Cursor ${v.name} (Reduced Motion)`, file: `M3E-${v.name}-ReducedMotion`, reducedMotion: true });
}
