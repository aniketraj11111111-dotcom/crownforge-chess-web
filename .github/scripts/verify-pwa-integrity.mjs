import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fail = (message) => {
  console.error(`PWA integrity failure: ${message}`);
  process.exitCode = 1;
};
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const cleanLocalRef = (value) => value.split(/[?#]/, 1)[0].replace(/^\.\//, '');

for (const file of [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'src/app-stable.js',
  'src/engine-stable.js',
  'src/keyboard-nav.js',
]) {
  if (!exists(file)) fail(`required file is missing: ${file}`);
}

if (process.exitCode) process.exit();

const serviceWorker = read('service-worker.js');
const shellMatch = serviceWorker.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
if (!shellMatch) {
  fail('service-worker APP_SHELL array was not found');
} else {
  const assets = [...shellMatch[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  if (!assets.includes('./index.html')) fail('APP_SHELL must cache ./index.html');
  if (!assets.some((asset) => asset.startsWith('./manifest.webmanifest'))) {
    fail('APP_SHELL must cache the web manifest');
  }
  for (const asset of assets) {
    const local = cleanLocalRef(asset);
    if (!local || local === '.') continue;
    if (!exists(local)) fail(`cached asset does not exist: ${asset}`);
  }
}

const index = read('index.html');
const localRefs = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((ref) => !/^(?:https?:|data:|mailto:|tel:|#)/i.test(ref));
for (const ref of localRefs) {
  const local = cleanLocalRef(ref);
  if (local && !exists(local)) fail(`index.html references missing local asset: ${ref}`);
}

let manifest;
try {
  manifest = JSON.parse(read('manifest.webmanifest'));
} catch (error) {
  fail(`manifest.webmanifest is not valid JSON: ${error.message}`);
}
if (manifest) {
  if (!manifest.name || !manifest.short_name) fail('manifest requires name and short_name');
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
    fail('manifest display must provide an installable app experience');
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail('manifest requires at least one icon');
  } else {
    for (const icon of manifest.icons) {
      const local = cleanLocalRef(icon.src ?? '');
      if (!local || !exists(local)) fail(`manifest icon does not exist: ${icon.src ?? '<missing src>'}`);
    }
  }
}

const app = read('src/app-stable.js');
for (const contract of [
  ['engine-authoritative game instance', /new\s+ChessGame\s*\(/],
  ['fixed white orientation', /dataset\.orientation\s*=\s*["']white["']/],
  ['terminal outcome guard', /game\.outcome\.isTerminal/],
  ['legal-move source', /getLegalMoves\s*\(/],
]) {
  if (!contract[1].test(app)) fail(`app contract missing: ${contract[0]}`);
}

const keyboardNavigation = read('src/keyboard-nav.js');
for (const contract of [
  ['roving tab index', /tabIndex\s*=\s*cellIndex\s*===\s*nextIndex\s*\?\s*0\s*:\s*-1/],
  ['arrow-key navigation', /case\s+["']Arrow(?:Left|Right|Up|Down)["']/],
  ['grid semantics', /setAttribute\(["']role["'],\s*["']grid["']\)/],
  ['fixed 64-square guard', /cells\.length\s*!==\s*64/],
]) {
  if (!contract[1].test(keyboardNavigation)) {
    fail(`keyboard navigation contract missing: ${contract[0]}`);
  }
}

if (!process.exitCode) {
  console.log('Crownforge PWA integrity audit passed.');
}
