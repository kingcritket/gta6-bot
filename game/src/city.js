// Port Vela city layout: pure data, no three.js here. The world is a 240 x 240 m
// harbour town on a road grid, with a plaza at its heart and named sites for missions.
// Roads run at fixed coordinates so traffic, pedestrians and the minimap all agree.
import { createRng } from './rng.js';

export const CITY_HALF = 120;
export const ROAD_COORDS = [-100, -60, -20, 20, 60, 100];
export const ROAD_WIDTH = 10;
export const BLOCK_CENTERS = [-80, -40, 0, 40, 80];

// Facade palettes: warm plaster, cool glass, brick red, sage green.
export const FACADE_COLORS = [0xc9a37e, 0x9fb4c7, 0xb98a7a, 0x8fa38a];

export function buildCity(seed) {
  const rng = createRng(seed);
  const buildings = [];
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      // The middle block is Plaza Vela, not buildings.
      if (bx === 0 && bz === 0) continue;
      const twin = rng.chance(0.28);
      const spots = twin
        ? [
            { dx: -7, dz: -7 },
            { dx: 7, dz: 7 },
          ]
        : [{ dx: 0, dz: 0 }];
      for (const s of spots) {
        const w = twin ? rng.range(11, 14) : rng.range(15, 23);
        const d = twin ? rng.range(11, 14) : rng.range(15, 23);
        buildings.push({
          x: bx + s.dx + rng.range(-1.5, 1.5),
          z: bz + s.dz + rng.range(-1.5, 1.5),
          w,
          d,
          h: rng.range(9, 32),
          color: rng.pick(FACADE_COLORS),
          variant: rng.int(0, 3),
        });
      }
    }
  }

  // Trees line the sidewalks; lamps stand at the intersection corners.
  const trees = [];
  const lamps = [];
  for (const c of ROAD_COORDS) {
    for (let t = -110; t <= 110; t += 22) {
      const j = rng.range(-3, 3);
      trees.push({ x: c + 8.5, z: t + j });
      trees.push({ x: t + j, z: c - 8.5 });
    }
  }
  for (const cx of ROAD_COORDS) {
    for (const cz of ROAD_COORDS) {
      lamps.push({ x: cx + 7, z: cz + 7 });
    }
  }

  const sites = {
    garage: { x: -80, z: 60, label: 'Bengkel Mara' },
    docks: { x: 0, z: -100, label: 'Dermaga' },
    dropoff: { x: 80, z: 20, label: 'Titik Antar' },
    bank: { x: 80, z: -60, label: 'Bank Vela' },
    plaza: { x: 0, z: 0, label: 'Plaza Vela' },
  };

  return { buildings, trees, lamps, sites, plaza: { x: 0, z: 0, r: 19 } };
}

// True when a circle at (x, z) with radius r overlaps any building footprint.
export function hitsBuilding(buildings, x, z, r) {
  for (const b of buildings) {
    if (
      x + r > b.x - b.w / 2 &&
      x - r < b.x + b.w / 2 &&
      z + r > b.z - b.d / 2 &&
      z - r < b.z + b.d / 2
    ) {
      return true;
    }
  }
  return false;
}

// Push a circle out of a building it overlaps; returns the corrected position.
export function resolveBuilding(buildings, x, z, r) {
  for (const b of buildings) {
    const minX = b.x - b.w / 2 - r;
    const maxX = b.x + b.w / 2 + r;
    const minZ = b.z - b.d / 2 - r;
    const maxZ = b.z + b.d / 2 + r;
    if (x > minX && x < maxX && z > minZ && z < maxZ) {
      const pushLeft = x - minX;
      const pushRight = maxX - x;
      const pushUp = z - minZ;
      const pushDown = maxZ - z;
      const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (m === pushLeft) x = minX;
      else if (m === pushRight) x = maxX;
      else if (m === pushUp) z = minZ;
      else z = maxZ;
    }
  }
  return { x, z };
}

// Nearest road coordinate to a position (used to snap traffic onto the grid).
export function nearestRoad(v) {
  let best = ROAD_COORDS[0];
  for (const c of ROAD_COORDS) {
    if (Math.abs(v - c) < Math.abs(v - best)) best = c;
  }
  return best;
}
