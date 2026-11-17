// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, wasted and done (all missions finished).
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, renders it, and sets window.__shotReady.
import { CAMERA, SAVE_KEY, STEP } from './config.js';
import {
  EVENT_ALL_DONE, EVENT_BUSTED, EVENT_CRASH, EVENT_HIT, EVENT_MISSION,
  EVENT_PICKUP, EVENT_SHOT, EVENT_STEAL, EVENT_WASTED, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_RELOAD, ACTION_SHOOT,
  createInput,
} from './input.js';
import {
  SCREEN_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
  createRenderer,
} from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { angleDiff, clamp, dist2 } from './random.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayLines = document.getElementById('overlay-lines');
const overlayButtons = document.getElementById('overlay-buttons');
const hudEl = document.getElementById('hud');

const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const hud = createHud({
  cashEl: document.getElementById('cash'),
  missionEl: document.getElementById('mission'),
  objectiveEl: document.getElementById('objective'),
  starsEl: document.getElementById('stars'),
  healthFill: document.getElementById('health-fill'),
  healthText: document.getElementById('health-text'),
  ammoEl: document.getElementById('ammo'),
  promptEl: document.getElementById('prompt'),
  messageEl: document.getElementById('message'),
  minimap: document.getElementById('minimap'),
});

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.missionIndex !== 'number' || typeof save.cash !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: world.state.missionIndex,
      cash: world.state.cash,
    }));
  } catch { /* storage can be off: progress then lasts this visit only */ }
}

let camYaw = Math.PI / 2;
let camDist = 1;
let lastDragAt = -10;

function showOverlay(title, lines, buttons) {
  overlayTitle.textContent = title;
  overlayLines.innerHTML = '';
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    overlayLines.appendChild(p);
  }
  overlayButtons.innerHTML = '';
  for (const button of buttons) {
    const b = document.createElement('button');
    b.textContent = button.label;
    b.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      button.onClick();
    });
    overlayButtons.appendChild(b);
  }
  overlay.style.display = 'flex';
  hudEl.style.display = 'none';
}

function hideOverlay() {
  overlay.style.display = 'none';
  hudEl.style.display = 'block';
}

function announce(message) {
  statusEl.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, world);
  camYaw = scene.camYaw;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, camYaw, scene.screen, 1);
    hud.update(world.state, '');
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  if (scene.screen === SCREEN_TITLE) {
    showOverlay('PORT VELA', ['Kota ini milik siapa yang berani mengambilnya.', 'Lima misi. Satu nama: Rook.'], []);
    overlay.style.pointerEvents = 'none';
    overlay.style.background = 'rgba(8, 10, 14, 0.45)';
  } else {
    hideOverlay();
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  const save = readSave();

  function startGame(fromSave) {
    world.reset();
    if (fromSave && save) {
      world.state.cash = save.cash;
      world.setMission(Math.min(save.missionIndex, 4));
      if (save.missionIndex >= 5) {
        world.state.allDone = true;
        world.state.marker.active = false;
      }
    }
    camYaw = Math.PI / 2;
    accumulator = 0;
    screen = SCREEN_PLAY;
    hideOverlay();
    announce('Bermain. Misi 1: curi mobil.');
  }

  function showTitle() {
    screen = SCREEN_TITLE;
    const buttons = [{ label: 'Mulai Baru', onClick: () => startGame(false) }];
    const lines = [
      'Port Vela — kota pelabuhan yang tidak pernah tidur. Kau Rook, pendatang baru dengan utang dan ambisi.',
      'Lima misi menantimu: curi mobil, antar paket, kabur dari polisi, rebut plaza, dan satu skor terakhir.',
      'WASD bergerak / menyetir · E curi & keluar mobil · F / klik menembak · R isi ulang · Shift lari · P jeda · drag mouse memutar kamera.',
    ];
    if (save && save.missionIndex > 0) {
      lines.push(`Save ditemukan: misi ${save.missionIndex + 1}/5, uang $${save.cash.toLocaleString('en-US')}.`);
      buttons.unshift({ label: `Lanjutkan (Misi ${save.missionIndex + 1})`, onClick: () => startGame(true) });
    }
    showOverlay('PORT VELA', lines, buttons);
    announce('Port Vela. Tekan tombol untuk mulai.');
  }

  function showWasted(reason) {
    screen = SCREEN_WASTED;
    writeSave();
    audio.wasted();
    showOverlay(reason, [
      `Misi ${world.state.missionIndex + 1}/5 — uang $${world.state.cash.toLocaleString('en-US')} tetap tersimpan.`,
      'Rook bangun lagi di bengkel Mara. Kota ini belum selesai denganmu.',
    ], [{ label: 'Bangun Lagi', onClick: () => startGame(true) }]);
    announce(`${reason}. Bangun lagi.`);
  }

  function showDone() {
    screen = SCREEN_DONE;
    writeSave();
    audio.mission();
    showOverlay('PORT VELA MILIKMU', [
      `Semua 5 misi selesai. Total uang: $${world.state.cash.toLocaleString('en-US')}.`,
      'Rook dan Mara meninggalkan Port Vela saat fajar — legenda baru kota ini.',
      'Jelajahi kota dengan bebas, atau mulai dari awal.',
    ], [
      { label: 'Jelajah Bebas', onClick: () => { screen = SCREEN_PLAY; hideOverlay(); } },
      { label: 'Main Lagi', onClick: () => startGame(false) },
    ]);
    announce('Semua misi selesai. Port Vela milikmu.');
  }

  function pauseGame() {
    screen = SCREEN_PAUSED;
    showOverlay('Jeda', ['Kota menunggu. Rook tidak.'], [{ label: 'Lanjutkan', onClick: () => { screen = SCREEN_PLAY; hideOverlay(); } }]);
    announce('Jeda.');
  }

  function promptFor() {
    const p = world.state.player;
    if (p.inCar) return 'E — keluar dari mobil';
    let best = Infinity;
    for (const car of world.state.cars) {
      if (!car.active || car.police) continue;
      best = Math.min(best, dist2(p.x, p.z, car.x, car.z));
    }
    if (best < 4.5 * 4.5) return 'E — curi mobil';
    if (world.state.missionIndex === 3 && world.state.enemies.some((e) => e.alive)) {
      return 'F / klik — tembak anggota geng Kobra';
    }
    return '';
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
    }
    if (events & EVENT_WASTED) showWasted('WASTED');
    else if (events & EVENT_BUSTED) showWasted('DITANGKAP');
    else if (events & EVENT_ALL_DONE) showDone();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) {
      startGame(false);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      pauseGame();
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      hideOverlay();
      announce('Bermain.');
    }
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) return;
    const simInput = {
      move: () => input.move(),
      takeMouse: () => ({ dx: 0, dy: 0 }),
      camYaw,
    };
    const events = world.step(STEP, simInput, actions & (ACTION_INTERACT | ACTION_SHOOT | ACTION_RELOAD));
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    // Camera yaw: mouse drag rotates it; otherwise it drifts behind the heading.
    const mouse = input.takeMouse();
    const wheel = input.takeWheel();
    if (wheel !== 0) camDist = clamp(camDist * (1 + wheel * 0.0006), CAMERA.zoomMin, CAMERA.zoomMax);
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      camYaw -= mouse.dx * 0.004;
      lastDragAt = now / 1000;
    } else if (screen === SCREEN_PLAY) {
      const p = world.state.player;
      const moving = p.inCar ? Math.abs(p.car.speed) > 2 : true;
      if (moving && now / 1000 - lastDragAt > 1.5) {
        camYaw += clamp(angleDiff(camYaw, p.heading), -1.1 * dt, 1.1 * dt);
      }
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      accumulator += dt;
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
      if (screen === SCREEN_TITLE) accumulator = 0;
    } else {
      accumulator = 0;
    }
    if (screen === SCREEN_PLAY) {
      saveTimer += dt;
      if (saveTimer > 5) {
        saveTimer = 0;
        writeSave();
      }
      const p = world.state.player;
      const speedNorm = p.inCar && p.car ? Math.abs(p.car.speed) / 30 : 0;
      audio.update(dt, speedNorm, world.state.wanted);
      hud.update(world.state, promptFor());
    }
    renderer.draw(world.state, camYaw, screen, camDist);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) pauseGame();
  });

  showTitle();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
