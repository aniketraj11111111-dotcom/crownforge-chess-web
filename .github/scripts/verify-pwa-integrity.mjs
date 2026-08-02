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
  'history-controls.css',
  'src/app-stable.js',
  'src/session-state.js',
  'src/board3d.js',
  'src/board3d-meshes.js',
  'src/board3d-materials.js',
  'src/engine-stable.js',
  'src/keyboard-nav.js',
  'src/promotion-focus.js',
  'src/board-semantics.js',
  'src/touch-feedback.js',
  'touch-feedback.css',
  'src/screen-wake.js',
  'src/connectivity-status.js',
  'offline-status.css',
  'src/fullscreen-control.js',
  'fullscreen-control.css',
  'src/premium-soundtrack.js',
  'premium-soundtrack.css',
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
  ['authoritative history rebuild', /function\s+rebuildAuthoritativeGame[\s\S]*new\s+ChessGame\s*\(/],
  ['history replay through engine', /rebuiltGame\.play\(replayMove\)/],
  ['future branch replacement', /moveTimeline\.slice\(0,\s*historyCursor\)/],
]) {
  if (!contract[1].test(app)) fail(`app contract missing: ${contract[0]}`);
}
for (const contract of [
  ['immutable audio event payload', /Object\.freeze\(\{[\s\S]*?version:\s*1/],
  ['engine-approved audio event', /game\.play\(move\)[\s\S]*publishAudioEvent\(["']move["']/],
  ['capture audio metadata', /capture:\s*move\.isCapture/],
  ['castling audio metadata', /MoveFlags\.CastleKingSide[\s\S]*MoveFlags\.CastleQueenSide/],
  ['promotion audio metadata', /pieceName\(move\.promotion\)/],
]) {
  if (!contract[1].test(app)) fail(`engine-to-audio bridge missing: ${contract[0]}`);
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

const promotionFocus = read('src/promotion-focus.js');
for (const contract of [
  ['promotion dialog label', /aria-labelledby/],
  ['promotion modal semantics', /aria-modal/],
  ['promotion choice focus', /buttons\[0\]\?\.focus/],
  ['board focus restoration', /target\.focus\(\{\s*preventScroll:\s*true\s*\}\)/],
  ['four promotion choices', /buttons\.length\s*!==\s*4/],
]) {
  if (!contract[1].test(promotionFocus)) {
    fail(`promotion focus contract missing: ${contract[0]}`);
  }
}

const boardSemantics = read('src/board-semantics.js');
for (const contract of [
  ['selected-square semantics', /setAttribute\(["']aria-selected["']/],
  ['legal move announcement', /legal move destination/],
  ['legal capture announcement', /legal capture destination/],
  ['fixed 64-square guard', /cells\.length\s*!==\s*64/],
  ['presentation-only observer', /new\s+MutationObserver\s*\(/],
]) {
  if (!contract[1].test(boardSemantics)) {
    fail(`board semantics contract missing: ${contract[0]}`);
  }
}

const touchFeedback = read('src/touch-feedback.js');
for (const contract of [
  ['primary pointer guard', /event\.isPrimary/],
  ['square-only targeting', /button\[data-square\]/],
  ['drag cancellation threshold', /DRAG_CANCEL_DISTANCE/],
  ['pointer cancellation cleanup', /pointercancel/],
  ['visibility cleanup', /visibilitychange/],
]) {
  if (!contract[1].test(touchFeedback)) {
    fail(`touch feedback contract missing: ${contract[0]}`);
  }
}

const screenWake = read('src/screen-wake.js');
for (const contract of [
  ['feature detection', /["']wakeLock["']\s+in\s+navigator/],
  ['screen wake request', /navigator\.wakeLock\.request\(["']screen["']\)/],
  ['user activation gate', /userActivated/],
  ['visibility lifecycle', /visibilitychange/],
  ['terminal release', /dataset\.turn\s*!==\s*["']terminal["']/],
  ['pagehide cleanup', /pagehide/],
]) {
  if (!contract[1].test(screenWake)) {
    fail(`screen wake contract missing: ${contract[0]}`);
  }
}

const connectivityStatus = read('src/connectivity-status.js');
for (const contract of [
  ['dedicated status target', /querySelector\(["']#connection-status["']\)/],
  ['online-state detection', /navigator\.onLine/],
  ['offline-ready detection', /serviceWorker\.controller/],
  ['online lifecycle', /addEventListener\(["']online["']/],
  ['offline lifecycle', /addEventListener\(["']offline["']/],
  ['service-worker lifecycle', /addEventListener\(["']controllerchange["']/],
]) {
  if (!contract[1].test(connectivityStatus)) {
    fail(`connectivity status contract missing: ${contract[0]}`);
  }
}
if (/ChessGame|makeMove|getLegalMoves/.test(connectivityStatus)) {
  fail('connectivity status must remain presentation-only');
}

const fullscreenControl = read('src/fullscreen-control.js');
for (const contract of [
  ['dedicated fullscreen target', /querySelector\(["']#fullscreen-app["']\)/],
  ['fullscreen feature detection', /document\.fullscreenEnabled/],
  ['standalone-mode guard', /display-mode:\s*standalone/],
  ['fullscreen request', /requestFullscreen\s*\(/],
  ['fullscreen exit', /document\.exitFullscreen\s*\(/],
  ['fullscreen lifecycle', /fullscreenchange/],
  ['pressed-state semantics', /aria-pressed/],
]) {
  if (!contract[1].test(fullscreenControl)) {
    fail(`fullscreen control contract missing: ${contract[0]}`);
  }
}
if (/ChessGame|makeMove|getLegalMoves/.test(fullscreenControl)) {
  fail('fullscreen control must remain presentation-only');
}

const premiumSoundtrack = read('src/premium-soundtrack.js');
for (const contract of [
  ['dedicated soundtrack target', /querySelector\(["']#soundtrack-toggle["']\)/],
  ['user-gesture activation', /addEventListener\(["']pointerdown["']/],
  ['keyboard activation', /addEventListener\(["']keydown["']/],
  ['Web Audio feature detection', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/],
  ['master dynamics protection', /createDynamicsCompressor\s*\(/],
  ['soft peak limiter', /createWaveShaper\s*\(/],
  ['local concert-hall reverb', /createConvolver\s*\(/],
  ['adaptive audio event channel', /crownforge:audio/],
  ['ambience stem', /ambienceInput/],
  ['strategy stem', /strategyInput/],
  ['tension stem', /tensionInput/],
  ['persistent listener preference', /localStorage\.setItem\(STORAGE_KEY/],
  ['visibility lifecycle', /visibilitychange/],
  ['accessible pressed state', /aria-pressed/],
  ['original score identity', /The Living Crown/],
  ['checkmate cinematic score', /playCheckmateCue/],
  ['draw resolution', /playDrawCue/],
  ['history navigation cue', /playHistoryCue/],
]) {
  if (!contract[1].test(premiumSoundtrack)) {
    fail(`premium soundtrack contract missing: ${contract[0]}`);
  }
}
const masterGain = Number(premiumSoundtrack.match(/const\s+MASTER_GAIN\s*=\s*([\d.]+)/)?.[1]);
if (!Number.isFinite(masterGain) || masterGain < 0.3 || masterGain > 0.4) {
  fail(`Living Crown master gain must be audibly raised but limiter-safe; found ${masterGain}`);
}
if (/ChessGame|makeMove|getLegalMoves|applyLegalMove|generateLegalMoves/.test(premiumSoundtrack)) {
  fail('premium soundtrack must remain presentation-only');
}
if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//.test(premiumSoundtrack)) {
  fail('premium soundtrack must remain original, local and offline-only');
}
for (const piece of ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King']) {
  if (!new RegExp(`function\\s+play${piece}Cue\\s*\\(`).test(premiumSoundtrack)) {
    fail(`premium soundtrack piece identity missing: ${piece}`);
  }
}
const feedback = read('src/feedback.js');
const cinematicDirector = read('src/cinematic-director.js');
if (/AudioContext|createOscillator/.test(feedback) || /AudioContext|createOscillator/.test(cinematicDirector)) {
  fail('legacy presentation modules must not create duplicate audio contexts');
}

const sessionState = read('src/session-state.js');
for (const contract of [
  ['history schema v2', /SESSION_SCHEMA_VERSION\s*=\s*2/],
  ['legacy schema migration', /LEGACY_SESSION_SCHEMA_VERSION\s*=\s*1/],
  ['timeline cursor validation', /cursor\s*>\s*payload\.moves\.length/],
  ['legal full-timeline replay', /fullTimelineGame\.getLegalMoves\s*\(\)/],
]) {
  if (!contract[1].test(sessionState)) fail(`session history contract missing: ${contract[0]}`);
}

if (!process.exitCode) {
  console.log('Crownforge PWA integrity audit passed.');
}
