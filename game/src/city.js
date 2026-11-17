// Port Vela — the city itself, generated from a seed. No three.js here: this
// module only produces plain layout data (buildings, roads, trees, lamps and
// the named sites), so the headless sim can use it too. The renderer draws
// whatever this returns.
import { CITY_HALF, ROAD_HALF, SITES, STREETS } from './config.js';
import { Rng } from './rng.js';

const PALETTE = ['#c9a37e', '#b8b0a4', '#9fb4c0', '#c0a58e', '#a8b09a', '#d0c0a0', '#b98d7a'];
const PLAZA_MIN = -20;
const PLAZA_MAX = 20;

export function buildCity(seed) {
  const rng = new Rng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];

  // Blocks are the gaps between neighbouring streets, plus the outer margins.
  const edges = [-CITY_HALF, ...STREETS, CITY_HALF];
  for (let i = 0; i < edges.length - 1; i++) {
    for (let j = 0; j < edges.length - 1; j++) {
      const x0 = edges[i];
      const x1 = edges[i + 1];
      const z0 = edges[j];
      const z1 = edges[j + 1];
      // The middle block is the plaza, not buildings.
      if (x0 >= PLAZA_MIN && x1 <= PLAZA_MAX && z0 >= PLAZA_MIN && z1 <= PLAZA_MAX) continue;
      const inset = ROAD_HALF + 2;
      const bx0 = x0 + inset;
      const bx1 = x1 - inset;
      const bz0 = z0 + inset;
      const bz1 = z1 - inset;
      if (bx1 - bx0 < 12 || bz1 - bz0 < 12) continue;
      // One or two buildings per block, split along the longer side.
      const lots = [];
      if (bx1 - bx0 > bz1 - bz0) {
        const mid = (bx0 + bx1) / 2 + rng.range(-4, 4);
        lots.push([bx0, mid, bz0, bz1]);
        lots.push([mid, bx1, bz0, bz1]);
      } else {
        const mid = (bz0 + bz1) / 2 + rng.range(-4, 4);
        lots.push([bx0, bx1, bz0, mid]);
        lots.push([bx0, bx1, mid, bz1]);
      }
      for (const [lx0, lx1, lz0, lz1] of lots) {
        if (rng.chance(0.18)) continue; // an empty lot keeps the city breathing
        const w = lx1 - lx0 - rng.range(2, 5);
        const d = lz1 - lz0 - rng.range(2, 5);
        const cx = (lx0 + lx1) / 2;
        const cz = (lz0 + lz1) / 2;
        const nearCentre = Math.abs(cx) + Math.abs(cz) < 90;
        const h = nearCentre ? rng.range(14, 36) : rng.range(8, 20);
        buildings.push({ x: cx, z: cz, w, d, h, tint: rng.pick(PALETTE) });
      }
    }
  }

  // Trees and lamps line the sidewalks.
  for (const s of STREETS) {
    for (let t = -110; t <= 110; t += 20) {
      lamps.push({ x: t, z: s + ROAD_HALF + 1.2 });
      lamps.push({ x: s + ROAD_HALF + 1.2, z: t });
      if (rng.chance(0.55)) trees.push({ x: t + rng.range(-6, 6), z: s - ROAD_HALF - 2.2, s: rng.range(0.8, 1.3) });
      if (rng.chance(0.55)) trees.push({ x: s - ROAD_HALF - 2.2, z: t + rng.range(-6, 6), s: rng.range(0.8, 1.3) });
    }
  }
  // A ring of palms around the plaza.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + rng.range(-0.1, 0.1);
    trees.push({ x: Math.cos(a) * 17, z: Math.sin(a) * 17, s: rng.range(1.0, 1.4) });
  }

  return {
    seed,
    streets: [...STREETS],
    buildings,
    trees,
    lamps,
    plaza: { x: 0, z: 0, r: 15 },
    fountain: { x: 0, z: 0, r: 5 },
    docks: { x: 40, z: 104, w: 44, d: 14 },
    sites: { ...SITES },
  };
}

// Push a circle (x, z, radius r) out of every building and the city bounds.
// Returns [x, z, hit] where hit is true when something pushed back.
export function collideCircle(city, x, z, r) {
  let hit = false;
  for (const b of city.buildings) {
    const hx = b.w / 2 + r;
    const hz = b.d / 2 + r;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      hit = true;
      const px = hx - Math.abs(dx);
      const pz = hz - Math.abs(dz);
      if (px < pz) x = b.x + (dx > 0 ? hx : -hx);
      else z = b.z + (dz > 0 ? hz : -hz);
    }
  }
  const lim = CITY_HALF - 2;
  if (x < -lim) { x = -lim; hit = true; }
  if (x > lim) { x = lim; hit = true; }
  if (z < -lim) { z = -lim; hit = true; }
  if (z > lim) { z = lim; hit = true; }
  return [x, z, hit];
}

export function pointInBuilding(city, x, z) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return true;
  }
  return false;
}

// Nearest point on a street centreline to (x, z): used to snap spawns onto roads.
export function nearestStreetPoint(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const s of city.streets) {
    const dH = Math.abs(z - s);
    if (dH < bestD) { bestD = dH; best = { x, z: s, axis: 'x', line: s }; }
    const dV = Math.abs(x - s);
    if (dV < bestD) { bestD = dV; best = { x: s, z, axis: 'z', line: s }; }
  }
  return best;
}
