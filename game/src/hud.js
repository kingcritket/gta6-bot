// HUD + minimap for Port Vela: plain DOM text plus a 2D canvas map of the city.
import { MISSIONS } from './missions.js';
import { ROAD_COORDS } from './city.js';

const MAP_EXTENT = 125;

export function createHud(els) {
  const map = els.minimap.getContext('2d');
  const scale = els.minimap.width / (MAP_EXTENT * 2);

  function toMap(v) {
    return (v + MAP_EXTENT) * scale;
  }

  function drawMinimap(world, now) {
    const w = els.minimap.width;
    const h = els.minimap.height;
    map.fillStyle = '#0d1420';
    map.fillRect(0, 0, w, h);
    // Roads.
    map.strokeStyle = '#66707e';
    map.lineWidth = 3;
    for (const c of ROAD_COORDS) {
      map.beginPath();
      map.moveTo(0, toMap(c));
      map.lineTo(w, toMap(c));
      map.stroke();
      map.beginPath();
      map.moveTo(toMap(c), 0);
      map.lineTo(toMap(c), h);
      map.stroke();
    }
    // Buildings.
    map.fillStyle = '#42506a';
    for (const b of world.city.buildings) {
      map.fillRect(toMap(b.x - b.w / 2), toMap(b.z - b.d / 2), b.w * scale, b.d * scale);
    }
    // Plaza.
    map.fillStyle = '#8a7a5a';
    map.beginPath();
    map.arc(toMap(0), toMap(0), 19 * scale, 0, Math.PI * 2);
    map.fill();
    // Mission marker, pulsing.
    if (world.marker.active) {
      const pulse = 3 + Math.sin(now * 4) * 1.5;
      map.fillStyle = '#ffd166';
      map.beginPath();
      map.arc(toMap(world.marker.x), toMap(world.marker.z), pulse, 0, Math.PI * 2);
      map.fill();
    }
    // Cars.
    for (const car of world.cars) {
      if (!car.active) continue;
      map.fillStyle = car.kind === 'police' ? '#4a90ff' : '#9aa4b0';
      map.beginPath();
      map.arc(toMap(car.x), toMap(car.z), car.kind === 'police' ? 3 : 2, 0, Math.PI * 2);
      map.fill();
    }
    // Gang members.
    map.fillStyle = '#ff4a4a';
    for (const e of world.enemies) {
      if (!e.alive) continue;
      map.beginPath();
      map.arc(toMap(e.x), toMap(e.z), 3, 0, Math.PI * 2);
      map.fill();
    }
    // Player arrow.
    const p = world.player;
    map.fillStyle = '#ffffff';
    map.save();
    map.translate(toMap(p.x), toMap(p.z));
    map.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI);
    map.beginPath();
    map.moveTo(0, -6);
    map.lineTo(4.5, 5);
    map.lineTo(-4.5, 5);
    map.closePath();
    map.fill();
    map.restore();
  }

  return {
    update(world, prompt) {
      const p = world.player;
      els.cash.textContent = `$${world.cash.toLocaleString('en-US')}`;
      if (world.allDone) {
        els.mission.textContent = 'Port Vela Milikmu';
        els.objective.textContent = 'Semua misi selesai. Jelajahi kota dengan bebas.';
      } else {
        const def = MISSIONS[world.missionIndex];
        els.mission.textContent = def.title;
        els.objective.textContent = def.objective;
      }
      els.stars.textContent = '★'.repeat(world.wanted) + '☆'.repeat(5 - world.wanted);
      els.healthFill.style.width = `${Math.max(0, p.health)}%`;
      els.healthText.textContent = String(Math.round(p.health));
      els.ammoCount.textContent = `${p.ammo}${p.reloading ? ' …' : ''}`;
      if (prompt) {
        els.prompt.textContent = prompt;
        els.prompt.style.display = 'block';
      } else {
        els.prompt.style.display = 'none';
      }
      if (world.message) {
        els.message.textContent = world.message;
        els.message.style.display = 'block';
      } else {
        els.message.style.display = 'none';
      }
      drawMinimap(world, world.time);
    },
  };
}
