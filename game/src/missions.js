// Port Vela — the five missions. Each mission owns its title, its objective
// line for the HUD, a setup that stages the world, and an update that returns
// true the moment the mission is complete. The world owns cash and progress;
// this module only decides what "done" means.
import { EV, MISSION_REWARDS, SITES } from './config.js';
import { dist2 } from './util.js';

function near(state, site, radius) {
  const p = state.player;
  return dist2(p.x, p.z, site.x, site.z) < radius * radius;
}

function setMarker(state, site, label) {
  state.marker = { x: site.x, z: site.z, active: true, label: label || site.label };
}

export const MISSIONS = [
  {
    title: 'Misi 1 — Roda Pertama',
    objective: (state) =>
      state.mission.stage === 0
        ? 'Curi sebuah mobil — dekati mobil dan tekan E'
        : 'Bawa mobil curian ke Bengkel Mara',
    setup(state) {
      state.mission = { stage: 0, timer: 0 };
      state.marker = { x: 0, z: 0, active: false, label: '' };
    },
    update(state) {
      if (state.mission.stage === 0 && state.player.inCar) {
        state.mission.stage = 1;
        setMarker(state, SITES.garage);
      }
      if (state.mission.stage === 1 && state.player.inCar && near(state, SITES.garage, 6)) return true;
      return false;
    },
  },
  {
    title: 'Misi 2 — Paket Dermaga',
    objective: (state) =>
      state.mission.stage === 0
        ? 'Ambil paket di Bengkel Mara'
        : 'Antar paket ke Dermaga — jangan sampai rusak',
    setup(state) {
      state.mission = { stage: 0, timer: 0 };
      setMarker(state, SITES.garage);
    },
    update(state) {
      if (state.mission.stage === 0 && near(state, SITES.garage, 5)) {
        state.mission.stage = 1;
        state.events |= EV.PICKUP;
        setMarker(state, SITES.docks);
      }
      if (state.mission.stage === 1 && near(state, SITES.docks, 6)) return true;
      return false;
    },
  },
  {
    title: 'Misi 3 — Panas di Strip',
    objective: () => 'Polisi mengejarmu — hilangkan bintang wanted sampai 0',
    setup(state) {
      state.mission = { stage: 0, timer: 0 };
      state.wanted = 2;
      state.quietTimer = 0;
      state.marker = { x: 0, z: 0, active: false, label: '' };
      state.spawnPolice = 2;
    },
    update(state) {
      return state.wanted === 0;
    },
  },
  {
    title: 'Misi 4 — Perebutan Plaza',
    objective: (state) => {
      const left = state.enemies.filter((e) => e.alive).length;
      return `Kalahkan geng Kobra di Plaza Vela — tersisa ${left} dari 4 (polisi dibayar diam oleh Mara)`;
    },
    setup(state) {
      state.mission = { stage: 0, timer: 0 };
      state.enemies = [];
      const spots = [
        { x: -8, z: -8 },
        { x: 8, z: -8 },
        { x: -8, z: 8 },
        { x: 8, z: 8 },
      ];
      for (const s of spots) {
        state.enemies.push({
          x: s.x, z: s.z, heading: 0, health: 100, alive: true,
          home: { x: s.x, z: s.z },
          shootCd: 1.2 + state.rng.next() * 1.2, strafeDir: state.rng.chance(0.5) ? 1 : -1,
        });
      }
      setMarker(state, SITES.plaza);
    },
    update(state) {
      return state.enemies.length > 0 && state.enemies.every((e) => !e.alive);
    },
  },
  {
    title: 'Misi 5 — Skor Terakhir',
    objective: (state) => {
      if (state.mission.stage === 0) return 'Masuk ke Bank Vela dan ambil uangnya';
      if (state.mission.stage === 1) return 'Menguras brankas… tetap di dalam lingkaran!';
      return 'Kabur! Hilangkan wanted 3 sampai 0';
    },
    setup(state) {
      state.mission = { stage: 0, timer: 0 };
      setMarker(state, SITES.bank);
    },
    update(state, dt) {
      if (state.mission.stage === 0 && near(state, SITES.bank, 5)) {
        state.mission.stage = 1;
        state.mission.timer = 0;
      }
      if (state.mission.stage === 1) {
        if (near(state, SITES.bank, 6)) {
          state.mission.timer += dt;
          if (state.mission.timer >= 3) {
            state.mission.stage = 2;
            state.events |= EV.PICKUP;
            state.wanted = 3;
            state.quietTimer = 0;
            state.spawnPolice = 3;
            state.marker = { x: 0, z: 0, active: false, label: '' };
          }
        } else {
          state.mission.timer = Math.max(0, state.mission.timer - dt);
        }
      }
      if (state.mission.stage === 2) return state.wanted === 0;
      return false;
    },
  },
];

export function missionReward(index) {
  return MISSION_REWARDS[index] ?? 0;
}

export function missionTitle(index) {
  return MISSIONS[index] ? MISSIONS[index].title : 'Port Vela';
}
