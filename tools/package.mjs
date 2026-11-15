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
//   node tools/package.mjs [variant ...]   -> dist/macos/M3E-<Variant>.cursor + M3E-<Variant>-ReducedMotion.cursor
//   node tools/package.mjs --gallery [variant ...]   -> dist/gallery/M3ECursor<Variant>.cursor (MaCursor gallery edition)
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

function strip(variant, name, px, picks) { // picks: the frame indices to stack, in order
  const out = new PNG({ width: px, height: px * picks.length });
  picks.forEach((i, k) => {
    const f = PNG.sync.read(readFileSync(framePath(variant, name, px, i)));
    if (f.width !== px || f.height !== px) throw new Error(`${name} ${px}px frame ${i} is ${f.width}x${f.height}`);
    f.data.copy(out.data, k * px * px * 4);
  });
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

// Gallery edition (for MaCursor's built-in theme gallery): the 280-frame busy cursors are thinned
// to 30 fps and kept at 32 / 64 px, like the MD3E Cursors gallery theme. That brings a theme from
// ~16 MB to ~5 MB. MaCursor's engine resamples anything over 24 frames when it applies a theme,
// so system-wide playback is the same; only the in-app preview drops from 60 to 30 fps.
const GALLERY_FPS = 30, GALLERY_SIZES = [32, 64];

function build({ variant, themeName, file: fileName, reducedMotion, gallery = false, dir = 'dist/macos', creator = pkg.author }) {
  const identifier = sanitize(themeName);
  const entries = [];
  for (const c of manifest) {
    if (!c.roles.length) continue; // Windows / Linux only
    const long = c.frames > 24 && gallery;
    const step = long ? Math.max(1, Math.round(1000 / GALLERY_FPS / (c.frameDuration * 1000))) : 1;
    const picks = reducedMotion ? [0] : [...Array(Math.ceil(c.frames / step)).keys()].map((k) => k * step);
    const frames = picks.length;
    const duration = frames > 1 ? (c.frames * c.frameDuration) / frames : 1;
    const sizes = long ? GALLERY_SIZES : pixelSizesFor(c.frames);
    const reps = sizes.map((px) => strip(variant, c.name, px, picks));
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
\t<key>Creator</key><string>${esc(creator)}</string>
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
  mkdirSync(join(ROOT, dir), { recursive: true });
  const file = join(ROOT, dir, `${fileName}.cursor`);
  writeFileSync(file, xml);
  console.log(`wrote ${file.slice(ROOT.length + 1)}  (${entries.length} roles, ${(xml.length / 1e6).toFixed(2)} MB)`);
}

const gallery = process.argv.includes('--gallery');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const v of VARIANTS.filter((v) => !only.length || only.includes(v.id))) {
  if (gallery) { // dist/gallery/M3ECursor<Colour>.cursor, named like the files in MaCursor's themes/
    const themeName = `M3E Cursor ${v.name}`;
    build({ variant: v.id, themeName, file: sanitize(themeName), reducedMotion: false, gallery: true, dir: 'dist/gallery' });
    continue;
  }
  build({ variant: v.id, themeName: `M3E Cursor ${v.name}`, file: `M3E-${v.slug}`, reducedMotion: false });
  build({ variant: v.id, themeName: `M3E Cursor ${v.name} (Reduced Motion)`, file: `M3E-${v.slug}-ReducedMotion`, reducedMotion: true });
}
