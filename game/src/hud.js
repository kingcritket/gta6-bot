// Port Vela — the HUD: cash, mission, wanted stars, health, ammo, prompts,
// toasts and the 2D minimap. DOM only; the sim never touches it.
import { MISSIONS, missionTitle } from './missions.js';
import { CITY_HALF, STREETS } from './config.js';

export function createHud(els) {
  const ctx = els.minimap.getContext('2d');
  let toastUntil = 0;

  function drawMinimap(state) {
    const W = els.minimap.width;
    const H = els.minimap.height;
    const scale = W / (CITY_HALF * 2 + 20);
    const px = (v) => (v + CITY_HALF + 10) * scale;
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#565d66';
    ctx.lineWidth = 3;
    for (const s of STREETS) {
      ctx.beginPath();
      ctx.moveTo(px(-CITY_HALF - 10), px(s));
      ctx.lineTo(px(CITY_HALF + 10), px(s));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(s), px(-CITY_HALF - 10));
      ctx.lineTo(px(s), px(CITY_HALF + 10));
      ctx.stroke();
    }
    ctx.fillStyle = '#3e7d3a';
    ctx.beginPath();
    ctx.arc(px(0), px(0), 7, 0, Math.PI * 2);
    ctx.fill();
    const m = state.marker;
    if (m.active) {
      ctx.fillStyle = '#ffd94d';
      ctx.save();
      ctx.translate(px(m.x), px(m.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px(x), px(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const car of state.cars) {
      if (!car.active) continue;
      if (car.kind === 'police') dot(car.x, car.z, '#3a86ff', 3);
    }
    for (const e of state.enemies) {
      if (e.alive) dot(e.x, e.z, '#ff3b30', 3);
    }
    const p = state.player;
    ctx.save();
    ctx.translate(px(p.x), px(p.z));
    ctx.rotate(-p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function update(state, prompt) {
    const p = state.player;
    els.cashEl.textContent = `$${state.cash.toLocaleString('en-US')}`;
    els.missionEl.textContent = state.allDone ? 'Port Vela Milikmu' : missionTitle(state.missionIndex);
    els.objectiveEl.textContent = state.allDone
      ? 'Semua misi selesai — jelajahi kota dengan bebas.'
      : MISSIONS[state.missionIndex].objective(state);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    els.starsEl.textContent = stars;
    els.starsEl.style.color = state.wanted > 0 ? '#ffd94d' : '#888888';
    els.healthFill.style.width = `${Math.max(0, p.health)}%`;
    els.healthFill.style.background = p.health > 50 ? '#2ecc71' : p.health > 25 ? '#f39c12' : '#e74c3c';
    els.healthText.textContent = `${Math.ceil(Math.max(0, p.health))}`;
    els.ammoEl.textContent = p.reloading > 0 ? '──' : `${p.ammo} / 12`;
    els.promptEl.textContent = prompt || '';
    if (state.toast && state.time * 1000 > toastUntil) {
      els.messageEl.textContent = state.toast;
      els.messageEl.style.opacity = '1';
      toastUntil = state.time * 1000 + 2800;
    } else if (state.time * 1000 > toastUntil) {
      els.messageEl.style.opacity = '0';
    }
    drawMinimap(state);
  }

  return { update };
}
