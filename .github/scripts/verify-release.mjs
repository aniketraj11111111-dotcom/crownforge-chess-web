import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const errors = [];
const fail = (message) => errors.push(message);
const filePath = (relative) => path.join(root, relative);
const exists = (relative) => fs.existsSync(filePath(relative));
const read = (relative) => fs.readFileSync(filePath(relative), 'utf8');
const cleanRef = (value) => value.split(/[?#]/, 1)[0].replace(/^\.\//, '');

const required = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'styles.css',
  'history-controls.css',
  'production-board.css',
  'board-geometry-lock.css',
  'webgl-phase2.css',
  'touch-feedback.css',
  'offline-status.css',
  'install-control.css',
  'fullscreen-control.css',
  'sonic-forge.css',
  'cinematic-endgame.css',
  'last-move.css',
  'turn-guidance.css',
  'premium-phase1.css',
  'src/app-stable.js',
  'src/session-state.js',
  'src/engine-stable.js',
  'src/board3d.js',
  'src/board3d-meshes.js',
  'src/board3d-materials.js',
  'src/touch-feedback.js',
  'src/cinematic-director.js',
  'src/fullscreen-control.js',
  'src/install-control.js',
  'src/connectivity-status.js',
  'src/sonic-forge.js',
  'public/audio/crownforge-sonic-forge-v33.wav',
  'public/audio/crownforge-sonic-forge-v33.json',
  'public/icon.svg',
];

for (const file of required) {
  if (!exists(file)) fail(`required release asset is missing: ${file}`);
}

if (errors.length === 0) {
  const index = read('index.html');
  const localRefs = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((ref) => !/^(?:https?:|data:|mailto:|tel:|#)/i.test(ref));

  for (const ref of localRefs) {
    const local = cleanRef(ref);
    if (local && !exists(local)) fail(`index.html references a missing asset: ${ref}`);
  }

  const versions = [...index.matchAll(/[?&]v=(\d+)/g)].map((match) => match[1]);
  const uniqueVersions = new Set(versions);
  if (uniqueVersions.size !== 1 || !uniqueVersions.has('33')) {
    fail(`index asset versions must all be v33; found: ${[...uniqueVersions].join(', ') || '<none>'}`);
  }

  for (const id of [
    'board', 'board-3d', 'status', 'substatus', 'history', 'restart',
    'claim-draw', 'promotion-dialog', 'victory', 'rematch',
    'connection-status', 'sound-toggle', 'fullscreen-app', 'install-app',
    'timeline-controls', 'undo-move', 'redo-move', 'history-position',
    'history-depth', 'undo-terminal',
  ]) {
    if (!new RegExp(`id=["']${id}["']`).test(index)) fail(`required UI id is missing: ${id}`);
  }

  const production = read('production-board.css');
  for (const contract of [
    ['stable viewport sizing', /100svh/],
    ['horizontal clipping', /overflow-x:\s*clip/],
    ['root horizontal overscroll lock', /overscroll-behavior-x:\s*none/],
    ['board touch pan lock', /\.square[\s\S]*touch-action:\s*none/],
    ['fixed eight-column grid', /grid-template-columns:\s*repeat\(8/],
    ['fixed eight-row grid', /grid-template-rows:\s*repeat\(8/],
  ]) {
    if (!contract[1].test(production)) fail(`production board contract missing: ${contract[0]}`);
  }
  if (/\bdvh\b|touch-action:\s*manipulation|72vw|92dvh/.test(production)) {
    fail('production board still contains a dynamic viewport or horizontal-pan regression');
  }

  const app = read('src/app-stable.js');
  for (const contract of [
    ['engine-authoritative game', /new\s+ChessGame\s*\(/],
    ['fixed White orientation', /dataset\.orientation\s*=\s*["']white["']/],
    ['64-square grid guard', /cellViews\.size\s*===\s*64/],
    ['promotion handling', /MoveFlags\.Promotion/],
    ['terminal handling', /GameStatus\.Checkmate/],
    ['legal moves from engine', /getLegalMoves\s*\(/],
    ['authoritative history rebuild', /function\s+rebuildAuthoritativeGame[\s\S]*new\s+ChessGame\s*\(/],
    ['history replay transition', /rebuiltGame\.play\(replayMove\)/],
    ['forward branch replacement', /moveTimeline\.slice\(0,\s*historyCursor\)/],
  ]) {
    if (!contract[1].test(app)) fail(`gameplay contract missing: ${contract[0]}`);
  }

  const renderer = read('src/board3d.js');
  if (!/getContext\(["']webgl2["']/.test(renderer)) fail('WebGL2 renderer bootstrap is missing');
  if (/new\s+ChessGame|game\.play|applyLegalMove|generateLegalMoves/.test(renderer)) {
    fail('presentation renderer attempted to own chess state');
  }

  const session = read('src/session-state.js');
  if (!/SESSION_SCHEMA_VERSION\s*=\s*2/.test(session) ||
      !/LEGACY_SESSION_SCHEMA_VERSION\s*=\s*1/.test(session) ||
      !/timelineCursor/.test(session)) {
    fail('versioned unlimited-history session contract is incomplete');
  }

  const sonicForge = read('src/sonic-forge.js');
  if (!/createDynamicsCompressor\s*\(/.test(sonicForge) ||
      !/createWaveShaper\s*\(/.test(sonicForge) ||
      !/createConvolver\s*\(/.test(sonicForge)) {
    fail('Sonic Forge mastering graph is incomplete');
  }
  if (!/crownforge-sonic-forge/.test(sonicForge) || !/crownforge:audio/.test(sonicForge)) {
    fail('Crownforge Sonic Forge contract is missing');
  }
  if (!/history-back/.test(sonicForge) || !/history-forward/.test(sonicForge)) {
    fail('Sonic Forge history-navigation cues are missing');
  }
  if (/ChessGame|makeMove|getLegalMoves|applyLegalMove|generateLegalMoves/.test(sonicForge)) {
    fail('Sonic Forge attempted to own chess state');
  }
  if (/const\s+BPM\b|const\s+SCORE\b|scheduleChord|duckMusic|The Living Crown/.test(sonicForge)) {
    fail('Sonic Forge still contains a background-music system');
  }
  const masterGain = Number(sonicForge.match(/const\s+MASTER_GAIN\s*=\s*([\d.]+)/)?.[1]);
  if (!Number.isFinite(masterGain) || masterGain < 0.68 || masterGain > 0.8) {
    fail(`Sonic Forge master gain is outside its limiter-safe audible range: ${masterGain}`);
  }
  const feedback = read('src/feedback.js');
  const cinematicDirector = read('src/cinematic-director.js');
  if (/AudioContext|createOscillator/.test(feedback) || /AudioContext|createOscillator/.test(cinematicDirector)) {
    fail('legacy modules still create duplicate audio contexts');
  }
  if (!/game\.play\(move\)[\s\S]*publishAudioEvent\(["']move["']/.test(app)) {
    fail('audio events are not downstream of the authoritative engine transition');
  }

  const worker = read('service-worker.js');
  if (!/crownforge-v33-sonic-forge/.test(worker)) fail('service-worker cache is not the v33 Sonic Forge shell');
  for (const asset of [
    './index.html',
    './history-controls.css?v=33',
    './production-board.css?v=33',
    './src/app-stable.js?v=33',
    './src/board3d.js?v=33',
    './src/board3d-materials.js?v=33',
    './src/sonic-forge.js?v=33',
    './sonic-forge.css?v=33',
    './public/audio/crownforge-sonic-forge-v33.wav',
    './public/audio/crownforge-sonic-forge-v33.json',
    './src/engine-stable.js',
    './manifest.webmanifest?v=33',
  ]) {
    if (!worker.includes(JSON.stringify(asset))) fail(`offline shell is missing: ${asset}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(read('manifest.webmanifest'));
  } catch (error) {
    fail(`manifest is invalid JSON: ${error.message}`);
  }
  if (manifest) {
    if (!manifest.name || !manifest.short_name) fail('manifest name/short_name is missing');
    if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
      fail('manifest display mode is not installable');
    }
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      fail('manifest icons are missing');
    } else {
      for (const icon of manifest.icons) {
        const local = cleanRef(icon.src ?? '');
        if (!local || !exists(local)) fail(`manifest icon is missing: ${icon.src ?? '<empty>'}`);
      }
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`Release verification failure: ${error}`);
  process.exit(1);
}

console.log('Crownforge release verification passed: authoritative history, stable viewport, gameplay, PWA and WebGL contracts.');
