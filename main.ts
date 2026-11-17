// Port Vela — the entry program (Node 22, standard library only). It hands
// the game in: copies game/ and screenshots/ beside this file into the output
// directory and writes output/dossier.json with the kit's buildDossier from
// vendor/makefun-game.ts. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps below are the scorer's own (reference/gate.json): a run that
// would hand in an entry the scorer refuses fails loudly here instead.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const CAPS = {
  textMaxBytes: 163840,
  shotsMax: 4,
  shotMaxBytes: 262144,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  pathMaxBytes: 1000,
};

function listFiles(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) found.push(...listFiles(path, base));
    else if (name.isFile()) found.push(path.slice(base.length + 1));
  }
  return found;
}

function checkShots(dir) {
  if (!existsSync(dir)) throw new Error('screenshots/ is missing: take 3 or 4 screenshots first');
  const shots = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  if (shots.length < 3 || shots.length > CAPS.shotsMax) {
    throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
  }
  for (const name of shots) {
    if (!/\.jpe?g$/i.test(name)) throw new Error(`screenshot ${name} is not a JPEG`);
    const size = statSync(join(dir, name)).size;
    if (size > CAPS.shotMaxBytes) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  return shots;
}

function checkGame(dir) {
  const files = listFiles(dir);
  if (files.length > CAPS.gameMaxFiles) throw new Error(`game/ holds ${files.length} files, over the 993 cap`);
  let bytes = 0;
  for (const rel of files) {
    if (Buffer.byteLength(rel, 'utf8') > CAPS.pathMaxBytes) {
      throw new Error(`game path over the 1000-byte cap: ${rel}`);
    }
    bytes += statSync(join(dir, rel)).size;
  }
  if (bytes > CAPS.gameMaxBytes) throw new Error(`game/ is ${bytes} bytes, over the 48 MiB cap`);
  return { files: files.length, bytes };
}

function handIn() {
  const gameDir = join(ROOT, 'game');
  const shotsDir = join(ROOT, 'screenshots');
  const game = checkGame(gameDir);
  const shots = checkShots(shotsDir);

  mkdirSync(OUT, { recursive: true });
  // Skip dotfiles: editor backups and OS metadata must never reach the dossier.
  const noDotfiles = (src) => !/(^|\/)\./.test(src.slice(ROOT.length));
  cpSync(gameDir, join(OUT, 'game'), { recursive: true, filter: noDotfiles });
  mkdirSync(join(OUT, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(OUT, 'screenshots'), { recursive: true, filter: noDotfiles });

  const dossier = buildDossier(OUT, {
    text_max_bytes: CAPS.textMaxBytes,
    screenshots: { max: CAPS.shotsMax, max_bytes: CAPS.shotMaxBytes },
    game_max_files: CAPS.gameMaxFiles,
    game_max_bytes: CAPS.gameMaxBytes,
    game_path_max_bytes: CAPS.pathMaxBytes,
  });
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  return { shots: shots.length, dossierBytes: Buffer.byteLength(dossier, 'utf8'), game };
}

const result = handIn();
console.log(`Port Vela handed in: game ${result.game.files} files (${result.game.bytes} bytes), ${result.shots} screenshots, dossier ${result.dossierBytes} bytes -> ${OUT}`);
