// DOM HUD: cash, mission, wanted stars, health, ammo, prompts, message toast, and the
// 2D minimap. Pure DOM/canvas — no three.js in here.
import { MISSIONS } from './config.js';

const MAP_SIZE = 180;
const SCALE = MAP_SIZE / 260; // city spans -130..130 on the minimap

export function createHud(elements) {
  const { cashEl, missionEl, objectiveEl, starsEl, healthFill, healthText, ammoEl, promptEl, messageEl, minimap } = elements;
  const mapCtx = minimap.getContext('2d');
  let lastCash = -1;
  let lastMission = -1;
  let lastStars = -1;
  let lastHealth = -1;
  let lastAmmo = -1;
  let lastPrompt = null;
  let lastMessage = null;

  function drawMinimap(state) {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    const toMap = (x, z) => [(x + 130) * SCALE, (z + 130) * SCALE];
    // roads
    ctx.fillStyle = '#3a3f46';
    for (const c of [-110, -66, -22, 22, 66, 110]) {
      const [x] = toMap(c, 0);
      ctx.fillRect(x - 4.5, 0, 9, MAP_SIZE);
      const [, z] = toMap(0, c);
      ctx.fillRect(0, z - 4.5, MAP_SIZE, 9);
    }
    // plaza
    const [px, pz] = toMap(0, 0);
    ctx.fillStyle = '#7fb3d5';
    ctx.beginPath();
    ctx.arc(px, pz, 6, 0, Math.PI * 2);
    ctx.fill();
    // marker
    if (state.marker.active) {
      const [mx, mz] = toMap(state.marker.x, state.marker.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(mx, mz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(mx, mz, 8 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // enemies
    ctx.fillStyle = '#ff4b33';
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const [ex, ez] = toMap(e.x, e.z);
      ctx.fillRect(ex - 2, ez - 2, 4, 4);
    }
    // police
    ctx.fillStyle = '#4f8cff';
    for (const cop of state.police) {
      const [cx, cz] = toMap(cop.x, cop.z);
      ctx.beginPath();
      ctx.arc(cx, cz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // traffic
    ctx.fillStyle = '#cfd6dd';
    for (const car of state.cars) {
      if (!car.active) continue;
      const [cx, cz] = toMap(car.x, car.z);
      ctx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    // player arrow
    const p = state.player;
    const [ux, uz] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(ux, uz);
    ctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
    ctx.fillStyle = '#2f9e44';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function update(state, prompt) {
    if (state.cash !== lastCash) {
      lastCash = state.cash;
      cashEl.textContent = `$${state.cash.toLocaleString('en-US')}`;
    }
    if (state.missionIndex !== lastMission) {
      lastMission = state.missionIndex;
      const m = MISSIONS[state.missionIndex];
      if (m) {
        missionEl.textContent = `Misi ${m.id}/5: ${m.name}`;
        objectiveEl.textContent = m.objective;
      } else {
        missionEl.textContent = 'Port Vela milikmu!';
        objectiveEl.textContent = 'Jelajahi kota dengan bebas.';
      }
    }
    if (state.wanted !== lastStars) {
      lastStars = state.wanted;
      starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
      starsEl.classList.toggle('hot', state.wanted > 0);
    }
    const health = Math.max(0, Math.round(state.player.health));
    if (health !== lastHealth) {
      lastHealth = health;
      healthFill.style.width = `${health}%`;
      healthText.textContent = `${health}`;
      healthFill.classList.toggle('low', health <= 30);
    }
    const ammo = state.player.inCar ? '—' : `${state.player.ammo} / ∞`;
    if (ammo !== lastAmmo) {
      lastAmmo = ammo;
      ammoEl.textContent = state.player.reload > 0 ? 'Reloading…' : ammo;
    }
    if (prompt !== lastPrompt) {
      lastPrompt = prompt;
      promptEl.textContent = prompt || '';
      promptEl.style.display = prompt ? 'block' : 'none';
    }
    const msg = state.messageTimer > 0 ? state.message : '';
    if (msg !== lastMessage) {
      lastMessage = msg;
      messageEl.textContent = msg;
      messageEl.style.display = msg ? 'block' : 'none';
    }
    drawMinimap(state);
  }

  return { update };
}
