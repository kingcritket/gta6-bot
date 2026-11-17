// Port Vela — the entry program for make.fun gta6-01 (Node 22, standard library
// only). It hands the game in: copies game/ and screenshots/ from beside this file
// into the output directory and writes /output/dossier.json with the vendored
// make.fun library, so the judge reads exactly the game the browser plays.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The scorer's own caps shape the checks below: at most 4 screenshots, each at
// most 256 KiB; game/ at most 993 files and 48 MiB in all, each path at most
// 1,000 bytes; the dossier text at most 163,840 bytes. Anything over those
// limits is refused here first, with a plain error, instead of travelling on.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const SCREENSHOT_LIMIT = 4;
const SCREENSHOT_MAX_BYTES = 262144;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;
const GAME_PATH_MAX_BYTES = 1000;
const DOSSIER_TEXT_MAX_BYTES = 163840;

function fail(message) {
  throw new Error(`port-vela main.ts: ${message}`);
}

function countEntries(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    total += 1;
    if (entry.isDirectory()) total += countEntries(path.join(dir, entry.name));
  }
  return total;
}

function totalBytes(dir) {
  let sum = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sum += totalBytes(full);
    else if (entry.isFile()) sum += fs.statSync(full).size;
  }
  return sum;
}

function checkShots(repo) {
  const shotsDir = path.join(repo, 'screenshots');
  if (!fs.existsSync(shotsDir)) fail('screenshots/ is missing');
  const shots = fs.readdirSync(shotsDir).filter((name) => !name.startsWith('.')).sort();
  if (shots.length < 3 || shots.length > SCREENSHOT_LIMIT) {
    fail(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
  }
  for (const name of shots) {
    const full = path.join(shotsDir, name);
    const size = fs.statSync(full).size;
    if (size > SCREENSHOT_MAX_BYTES) {
      fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
    }
  }
  return shots;
}

function checkGame(repo) {
  const gameDir = path.join(repo, 'game');
  if (!fs.existsSync(path.join(gameDir, 'index.html'))) {
    fail('game/index.html is missing');
  }
  const entries = countEntries(gameDir);
  if (entries > GAME_MAX_FILES) fail(`game/ holds ${entries} entries, over the 993 cap`);
  const bytes = totalBytes(gameDir);
  if (bytes > GAME_MAX_BYTES) fail(`game/ is ${bytes} bytes, over the 48 MiB cap`);
  return { entries, bytes };
}

function main() {
  const shots = checkShots(REPO);
  const game = checkGame(REPO);

  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(REPO, 'game'), path.join(OUT, 'game'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  fs.cpSync(path.join(REPO, 'screenshots'), path.join(OUT, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUT, {
    text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
    screenshots: { max: SCREENSHOT_LIMIT, max_bytes: SCREENSHOT_MAX_BYTES },
    game_max_files: GAME_MAX_FILES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: GAME_PATH_MAX_BYTES,
  });
  fs.writeFileSync(path.join(OUT, 'dossier.json'), dossier);

  const dossierBytes = Buffer.byteLength(dossier, 'utf8');
  console.log(
    `port-vela: game/ ${game.entries} entries, ${game.bytes} bytes; ` +
      `screenshots ${shots.join(', ')}; dossier.json ${dossierBytes} bytes -> ${OUT}`,
  );
}

main();
