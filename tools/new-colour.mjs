// Adds one or more colour variants to the theme.
//
//   npm run new-colour -- [options] <Name=colour> [<Name=colour> ...]
//
// Colours:
//   "Mint=#3EB489"                    one seed colour: every role comes from its M3 tonal palette
//   "Sky=#0288D1:light"               a light cursor (dark badges, reversed edge), like Light Blue
//   "Sky=#0288D1:pale"                lighter still, like Pale Blue
//   "Slate=#5F6B7A:neutral"           the seed's hue at very low chroma, like Graphite
//   "Brand=#1A73E8,#D2E3FC,#062E6F"   explicit body, badge and glyph colours; the detail colour
//                                     and edge are derived (a body with tone 60 or more gets the
//                                     reversed light-cursor edge)
// Quote each argument: the shell treats # as a comment otherwise.
//
// Options:
//   --dry-run    print the roles and contrast checks, change nothing
//   --preview    also render a few cursors to build/preview-<Slug>.png on four backgrounds
//   --build      also build the new colours for every platform (render, macOS, Windows,
//                Hyprcursor, Linux), validate them and refresh the variants sheet
//   --replace    allow redefining an existing colour with the same name
//
// The colour is added to design/palettes.json, design/variants.json is regenerated, and the
// README colour table is updated. Nothing is committed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { variantOf, warnings, generate, slugOf } from './palettes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(`--${f}`);
const specs = args.filter((a) => !a.startsWith('--'));
const fail = (m) => { console.error(`new-colour: ${m}`); process.exit(1); };
if (!specs.length || flag('help')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport')[0].replace(/^\/\/ ?/gm, ''));
  process.exit(specs.length ? 0 : 1);
}

const HEX = /^#?[0-9a-fA-F]{6}$/;
const norm = (h) => (h.startsWith('#') ? h : `#${h}`).toUpperCase();
function parse(spec) {
  const m = spec.match(/^([^=]+)=(.+)$/);
  if (!m) fail(`"${spec}" should look like Name=#RRGGBB`);
  const name = m[1].trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z][A-Za-z0-9 ]*$/.test(name)) fail(`"${name}": use letters, digits and spaces, starting with a letter`);
  const [value, mod] = m[2].trim().split(':');
  const parts = value.split(',').map((x) => x.trim());
  if (!parts.every((p) => HEX.test(p))) fail(`"${spec}": colours must be hex, like #3EB489`);
  const id = name.toLowerCase().replace(/\s+/g, '');
  if (parts.length === 3) {
    if (mod) fail(`"${spec}": :${mod} only applies to a single seed colour`);
    const [body, badge, glyph] = parts.map(norm);
    return { id, name, colors: { body, badge, glyph } };
  }
  if (parts.length !== 1) fail(`"${spec}": give one seed colour, or three (body, badge, glyph)`);
  const e = { id, name, seed: norm(parts[0]) };
  if (mod === 'light' || mod === 'pale') e.style = mod;
  else if (mod === 'neutral') e.chroma = 6;
  else if (mod) fail(`"${spec}": unknown style :${mod} (use :light, :pale or :neutral)`);
  return e;
}

const file = join(ROOT, 'design/palettes.json');
const entries = JSON.parse(readFileSync(file));
const added = specs.map(parse);
for (const e of added) {
  const clash = entries.findIndex((x) => x.id === e.id || slugOf(x.name) === slugOf(e.name));
  if (clash >= 0 && !flag('replace')) fail(`"${e.name}" already exists (use --replace to redefine it)`);
  if (added.filter((x) => x.id === e.id).length > 1) fail(`"${e.name}" is given twice`);
}

for (const e of added) {
  const v = variantOf(e), c = v.colors;
  console.log(`\n${v.name}  (M3E-${v.slug}, ${v.scheme === 'light' ? 'light cursor' : 'standard'}, seed ${v.seed})`);
  console.log(`  body ${c.primary}  detail ${c.primary30}  badge ${c.primaryContainer}  glyph ${c.onPrimaryContainer}  ` +
    `rim ${c.rim ?? '#FFFFFF'}  hairline ${c.hairline}`);
  for (const w of warnings(v)) console.log(`  warning: ${w}`);
}
if (flag('dry-run')) process.exit(0);

for (const e of added) {
  const i = entries.findIndex((x) => x.id === e.id);
  if (i >= 0) entries[i] = e; else entries.push(e);
}
writeFileSync(file, '[\n' + entries.map((e) => '  ' + JSON.stringify(e, null, 1).replace(/\n\s*/g, ' ')).join(',\n') + '\n]\n');
generate();
console.log('\nupdated design/palettes.json, design/variants.json and the README colour table');

const run = (cmd, argv, env = {}) => {
  console.log(`> ${[...Object.entries(env).map(([k, v]) => `${k}=${v}`), cmd.replace(ROOT + '/', ''), ...argv].join(' ')}`);
  const r = spawnSync(process.execPath, [cmd, ...argv], { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status) fail(`${cmd} failed`);
};
const tool = (t) => join(ROOT, 'tools', `${t}.mjs`);
const ids = added.map((e) => e.id);

if (flag('preview') || flag('build')) {
  const sample = ['arrow', 'pointer', 'text', 'help', 'upload', 'wait', 'grab', 'resize-nwse'];
  for (const id of ids) {
    if (!flag('build')) run(tool('render'), sample, { M3E_VARIANT: id });
    else run(tool('render'), [], { M3E_VARIANT: id });
    const slug = added.find((e) => e.id === id).name.replace(/\s+/g, '');
    run(tool('sheet'), [join(ROOT, 'build', `preview-${slug}.png`), '120', ...sample], { M3E_VARIANT: id });
    console.log(`preview: build/preview-${slug}.png`);
  }
}
if (flag('build')) {
  run(tool('package'), ids);
  run(tool('windows'), ids);
  for (const id of ids) run(tool('hyprcursor'), [], { M3E_VARIANT: id });
  run(tool('linux'), ids);
  run(tool('validate'), ids);
  // The variants sheet shows every colour, so it needs all of them rendered.
  const all = JSON.parse(readFileSync(join(ROOT, 'design/variants.json')));
  if (all.every((v) => existsSync(join(ROOT, 'build/frames', v.id, 'arrow')))) run(tool('previews'), []);
  else console.log('skipped previews: run `npm run render` first so every colour has frames, then `npm run previews`');
  console.log(`\nbuilt ${ids.join(', ')} for macOS (dist/macos), Windows (dist/windows) and Linux (dist/linux)`);
}
