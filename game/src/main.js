// Port Vela boot + the one game loop. Input is read every frame, the world moves in
// fixed 1/60 s steps, and the renderer paints what is there. Five screens: title,
// play, paused, wasted and done. ?shot=start|play|end (with &seed=N) stages one
// scene instead of running the loop, renders it, and sets window.__shotReady.
import { createWorld, resetWorld, stepWorld, setMission, EV_BUSTED, EV_CRASH, EV_HIT, EV_MISSION, EV_SHOT, EV_STEAL, EV_WASTED, EV_DONE } from './world.js';
import { ACT, createInput } from './input.js';
import { createRenderer, SCREEN_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { angleDiff, clamp, dist2 } from './rng.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'port-vela-save-v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayLines = document.getElementById('overlay-lines');
const overlayButtons = document.getElementById('overlay-buttons');
const hudEl = document.getElementById('hud');

const world = createWorld(seed);
const renderer = createRenderer(canvas, world.city);
const audio = createAudio();

// HUD element ids in the markup are cash/mission/objective/stars/health-fill/
// health-text/ammo-count/prompt/message/minimap.
const hudBound = createHud({
  cash: document.getElementById('cash'),
  mission: document.getElementById('mission'),
  objective: document.getElementById('objective'),
  stars: document.getElementById('stars'),
  healthFill: document.getElementById('health-fill'),
  healthText: document.getElementById('health-text'),
  ammoCount: document.getElementById('ammo-count'),
  prompt: document.getElementById('prompt'),
  message: document.getElementById('message'),
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
      missionIndex: world.missionIndex,
      cash: world.cash,
    }));
  } catch { /* storage can be off: progress then lasts this visit only */ }
}

let camYaw = Math.PI / 2;
let camDist = 10;
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

function runShot(name) {
  const scene = stageShot(name, world);
  camYaw = scene.camYaw;
  let painted = 0;
  function paint() {
    renderer.draw(world, camYaw, scene.screen, camDist, performance.now() / 1000);
    hudBound.update(world, '');
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

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fromSave) {
    resetWorld(world);
    if (fromSave && save) {
      world.cash = save.cash;
      setMission(world, Math.min(save.missionIndex, 5));
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
      `Misi ${world.missionIndex + 1}/5 — uang $${world.cash.toLocaleString('en-US')} tetap tersimpan.`,
      'Rook bangun lagi di bengkel Mara. Kota ini belum selesai denganmu.',
    ], [{ label: 'Bangun Lagi', onClick: () => startGame(true) }]);
    announce(`${reason}. Bangun lagi.`);
  }

  function showDone() {
    screen = SCREEN_DONE;
    writeSave();
    audio.mission();
    showOverlay('PORT VELA MILIKMU', [
      `Semua 5 misi selesai. Total uang: $${world.cash.toLocaleString('en-US')}.`,
      'Rook dan Mara meninggalkan Port Vela saat fajar — legenda baru kota ini.',
      'Jelajahi kota dengan bebas, atau mulai dari awal.',
    ], [
      { label: 'Jelajah Bebas', onClick: () => { screen = SCREEN_PLAY; hideOverlay(); } },
      { label: 'Main Lagi', onClick: () => startGame(false) },
    ]);
    announce('Semua misi selesai. Port Vela milikmu.');
  }

  function promptFor() {
    const p = world.player;
    if (p.inCar) return 'E — keluar dari mobil';
    let best = Infinity;
    for (const car of world.cars) {
      if (!car.active || car.kind === 'police') continue;
      best = Math.min(best, dist2(p.x, p.z, car.x, car.z));
    }
    if (best < 4.5 * 4.5) return 'E — curi mobil';
    if (world.missionIndex === 3 && world.enemies.some((e) => e.alive)) {
      return 'F / klik — tembak anggota geng Kobra';
    }
    return '';
  }

  function handleEvents(events) {
    if (events & EV_SHOT) audio.shoot();
    if (events & EV_HIT) audio.hit();
    if (events & EV_CRASH) audio.crash();
    if (events & EV_STEAL) audio.steal();
    if (events & EV_MISSION) {
      audio.mission();
      writeSave();
    }
    if (events & EV_WASTED) showWasted('WASTED');
    else if (events & EV_BUSTED) showWasted('DITANGKAP');
    else if (events & EV_DONE) showDone();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACT.CONFIRM && screen === SCREEN_TITLE) {
      startGame(false);
    } else if (actions & ACT.PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showOverlay('Jeda', ['Kota menunggu. Rook tidak.'], [{ label: 'Lanjutkan', onClick: () => { screen = SCREEN_PLAY; hideOverlay(); } }]);
      announce('Jeda.');
    } else if (actions & (ACT.PAUSE | ACT.CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      hideOverlay();
      announce('Bermain.');
    }
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) return;
    const axis = input.axis();
    const events = stepWorld(world, STEP, {
      ax: axis.x,
      az: axis.z,
      run: input.runHeld(),
      interact: !!(actions & ACT.INTERACT),
      shoot: !!(actions & ACT.SHOOT),
      reload: !!(actions & ACT.RELOAD),
      camYaw,
    });
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    const mouse = input.takeDrag();
    const wheel = input.takeWheel();
    if (wheel !== 0) camDist = clamp(camDist * (1 + wheel * 0.0006), 6, 16);
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      camYaw -= mouse.dx * 0.004;
      lastDragAt = now / 1000;
    } else if (screen === SCREEN_PLAY) {
      const p = world.player;
      const moving = p.inCar ? Math.abs(p.speed) > 2 : true;
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
      const p = world.player;
      const speedNorm = p.inCar ? Math.abs(p.speed) / 30 : 0;
      audio.update(dt, speedNorm, world.wanted);
      hudBound.update(world, promptFor());
    }
    renderer.draw(world, camYaw, screen, camDist, now / 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showOverlay('Jeda', ['Kota menunggu. Rook tidak.'], [{ label: 'Lanjutkan', onClick: () => { screen = SCREEN_PLAY; hideOverlay(); } }]);
      announce('Jeda.');
    }
  });

  showTitle();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
