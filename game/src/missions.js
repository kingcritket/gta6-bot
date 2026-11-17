// The five missions of Rook & Mara. Each definition is static data; missionTick
// drives the current one from the live world and calls back into the world API.
export const MISSIONS = [
  {
    title: 'Misi 1 — Roda Pertama',
    briefing: 'Mara butuh roda. Curi sebuah mobil, lalu antar ke bengkelnya.',
    objective: 'Curi mobil (E), lalu bawa ke Bengkel Mara.',
    reward: 500,
  },
  {
    title: 'Misi 2 — Paket Dermaga',
    briefing: 'Ada paket menunggu di dermaga selatan. Ambil, lalu antar ke titik antar.',
    objective: 'Ambil paket di Dermaga, antar ke Titik Antar.',
    reward: 900,
  },
  {
    title: 'Misi 3 — Panas di Strip',
    briefing: 'Polisi sudah mengendusmu. Kabur sampai bintang wanted-mu padam.',
    objective: 'Bertahan sampai wanted kembali ke 0.',
    reward: 1200,
  },
  {
    title: 'Misi 4 — Perebutan Plaza',
    briefing: 'Geng Kobra menguasai Plaza Vela. Usir keempat anggotanya.',
    objective: 'Kalahkan 4 anggota geng Kobra di plaza.',
    reward: 1800,
  },
  {
    title: 'Misi 5 — Skor Terakhir',
    briefing: 'Bank Vela. Ambil uangnya, lalu kabur dari kejaran polisi.',
    objective: 'Ambil uang di Bank Vela, kabur sampai wanted 0.',
    reward: 5000,
  },
];

function near(world, x, z, r) {
  const p = world.player;
  const dx = p.x - x;
  const dz = p.z - z;
  return dx * dx + dz * dz < r * r;
}

// Runs one tick of the active mission. api: { setMarker, spawnGang, setWanted,
// addCash, finishMission, say } — all provided by world.js.
export function missionTick(world, dt, api) {
  const idx = world.missionIndex;
  const sites = world.city.sites;
  const m = world.mission;
  if (idx >= MISSIONS.length) return;

  if (idx === 0) {
    if (!m.stage) {
      m.stage = 'steal';
      api.setMarker(sites.garage.x, sites.garage.z, 'Bengkel Mara');
    }
    if (m.stage === 'steal' && world.player.inCar) {
      m.stage = 'drive';
      api.say('Mobil didapat. Bawa ke bengkel Mara!');
    }
    if (m.stage === 'drive' && near(world, sites.garage.x, sites.garage.z, 8)) {
      api.finishMission();
    }
  } else if (idx === 1) {
    if (!m.stage) {
      m.stage = 'fetch';
      api.setMarker(sites.docks.x, sites.docks.z, 'Dermaga');
    }
    if (m.stage === 'fetch' && near(world, sites.docks.x, sites.docks.z, 6)) {
      m.stage = 'deliver';
      api.setMarker(sites.dropoff.x, sites.dropoff.z, 'Titik Antar');
      api.say('Paket diambil. Antar ke titik antar!');
    }
    if (m.stage === 'deliver' && near(world, sites.dropoff.x, sites.dropoff.z, 6)) {
      api.finishMission();
    }
  } else if (idx === 2) {
    if (!m.stage) {
      m.stage = 'evade';
      api.setWanted(2);
      api.setMarker(null, null, null);
      api.say('Wanted 2! Kabur dari polisi sampai bintang padam.');
    }
    if (m.stage === 'evade' && world.wanted === 0) {
      api.finishMission();
    }
  } else if (idx === 3) {
    if (!m.stage) {
      m.stage = 'fight';
      api.spawnGang(4);
      api.setMarker(sites.plaza.x, sites.plaza.z, 'Plaza Vela');
      api.say('Geng Kobra di plaza. Habisi mereka!');
    }
    if (m.stage === 'fight' && world.enemies.every((e) => !e.alive)) {
      api.finishMission();
    }
  } else if (idx === 4) {
    if (!m.stage) {
      m.stage = 'grab';
      api.setMarker(sites.bank.x, sites.bank.z, 'Bank Vela');
    }
    if (m.stage === 'grab' && near(world, sites.bank.x, sites.bank.z, 6)) {
      m.stage = 'escape';
      api.setWanted(3);
      api.setMarker(null, null, null);
      api.say('Uang didapat! Kabur sampai wanted padam.');
    }
    if (m.stage === 'escape' && world.wanted === 0) {
      api.finishMission();
    }
  }
}
