// The simulation: Port Vela, a 240x240 m grid city. No drawing and no browser in here —
// the player's position, cars, pedestrians, police, enemies and the five-mission story.
// step() advances one fixed step and returns what happened as bit flags.
import { CAR, CITY, COMBAT, MISSIONS, PED, PLAYER, POLICE, STEP, TRAFFIC } from './config.js';
import { angleDiff, clamp, dist2, mulberry32, pick, range } from './random.js';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION = 8;
export const EVENT_WASTED = 16;
export const EVENT_CRASH = 32;
export const EVENT_STEAL = 64;
export const EVENT_ALL_DONE = 128;
export const EVENT_BUSTED = 256;

export const ROAD_CENTERS = [-110, -66, -22, 22, 66, 110];
export const BLOCK_CENTERS = [-88, -44, 0, 44, 88];

export const PLACES = {
  garage: { x: -110, z: -88, label: "Bengkel Mara" },
  dock: { x: 110, z: 88, label: 'Dermaga Timur' },
  bank: { x: 22, z: -110, label: 'Bank Vela' },
  plaza: { x: 0, z: 0, label: 'Plaza Vela' },
  safehouse: { x: -88, z: 110, label: 'Tempat Aman' },
};

const PALETTE_CARS = [0xc0392b, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xe67e22, 0x2c3e50];
const PALETTE_BUILDINGS = [0x8a7f70, 0x7d8a96, 0x9c8468, 0x6e7d6a, 0xa08b7a, 0x5f6b7a];
const PALETTE_SHIRTS = [0xc94f4f, 0x4f7ec9, 0xc9a44f, 0x8a4fc9, 0x4fc9a8];

function makeCar(rng, x, z, heading, police) {
  return {
    x, z, heading, speed: 0, color: police ? 0x1a1a2e : pick(rng, PALETTE_CARS),
    police: !!police, active: true, axis: 'x', road: 0, dir: 1, lane: 2.5,
    cruise: range(rng, 8, 13), turnAt: null, driver: !police, health: 100,
  };
}

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const state = {
    elapsed: 0,
    player: { x: -104, z: -66, heading: Math.PI / 2, health: PLAYER.health, inCar: false, car: null, ammo: COMBAT.pistolAmmo, reload: 0, fireCooldown: 0, invulnerable: 0 },
    cars: [],
    peds: [],
    police: [],
    enemies: [],
    buildings: [],
    trees: [],
    lamps: [],
    wanted: 0,
    wantedTimer: 0,
    bustTimer: 0,
    cash: 0,
    missionIndex: 0,
    missionStep: 0,
    missionDone: false,
    allDone: false,
    marker: { x: PLACES.garage.x, z: PLACES.garage.z, active: true, label: PLACES.garage.label },
    missionKills: 0,
    message: '',
    messageTimer: 0,
  };

  // ---- city geometry -------------------------------------------------------
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 0 && bz === 0) continue; // the centre block is Plaza Vela, open ground
      const count = rng() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i += 1) {
        const w = range(rng, 12, count === 1 ? 26 : 15);
        const d = range(rng, 12, count === 1 ? 26 : 15);
        const ox = count === 1 ? 0 : (i === 0 ? -8 : 8);
        const oz = count === 1 ? 0 : (i === 0 ? -8 : 8);
        state.buildings.push({
          x: bx + ox, z: bz + oz, w, d, h: range(rng, 8, 34),
          color: pick(rng, PALETTE_BUILDINGS), seed: Math.floor(rng() * 1e9),
        });
      }
      // trees on the block corners
      for (let i = 0; i < 2; i += 1) {
        state.trees.push({ x: bx + (rng() < 0.5 ? -14 : 14), z: bz + (rng() < 0.5 ? -14 : 14) });
      }
    }
  }
  for (const c of ROAD_CENTERS) {
    for (let p = -99; p <= 99; p += 33) {
      state.lamps.push({ x: c + 5.4, z: p });
      state.lamps.push({ x: p, z: c + 5.4 });
    }
  }

  function reset() {
    state.elapsed = 0;
    state.player.x = -104;
    state.player.z = -66;
    state.player.heading = Math.PI / 2;
    state.player.health = PLAYER.health;
    state.player.inCar = false;
    state.player.car = null;
    state.player.ammo = COMBAT.pistolAmmo;
    state.player.reload = 0;
    state.player.fireCooldown = 0;
    state.player.invulnerable = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.bustTimer = 0;
    state.cash = 0;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionDone = false;
    state.allDone = false;
    state.missionKills = 0;
    state.enemies = [];
    state.police = [];
    state.cars = [];
    state.peds = [];
    spawnTraffic();
    spawnPeds();
    setMission(0);
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const road = pick(rng, ROAD_CENTERS);
      const dir = rng() < 0.5 ? 1 : -1;
      const along = range(rng, -100, 100);
      const car = makeCar(rng, 0, 0, 0, false);
      car.axis = axis;
      car.road = road;
      car.dir = dir;
      car.lane = 2.6;
      car.speed = car.cruise;
      if (axis === 'x') {
        car.x = along;
        car.z = road + (dir > 0 ? car.lane : -car.lane);
        car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.z = along;
        car.x = road + (dir > 0 ? -car.lane : car.lane);
        car.heading = dir > 0 ? 0 : Math.PI;
      }
      state.cars.push(car);
    }
    // a few parked cars on the roads for the first mission
    const parked = [[-66, -99], [22, 55], [-22, -33], [66, -77], [-110, 33]];
    for (const [x, z] of parked) {
      const car = makeCar(rng, x, z, rng() < 0.5 ? 0 : Math.PI / 2, false);
      car.speed = 0;
      car.cruise = 0;
      car.parked = true;
      state.cars.push(car);
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PED.count; i += 1) {
      const block = { x: pick(rng, BLOCK_CENTERS), z: pick(rng, BLOCK_CENTERS) };
      const side = Math.floor(rng() * 4);
      const along = range(rng, -14, 14);
      let x = block.x;
      let z = block.z;
      if (side === 0) { z = block.z - 17; x = block.x + along; }
      else if (side === 1) { z = block.z + 17; x = block.x + along; }
      else if (side === 2) { x = block.x - 17; z = block.z + along; }
      else { x = block.x + 17; z = block.z + along; }
      state.peds.push({
        x, z, heading: rng() * Math.PI * 2, speed: PED.speed, color: pick(rng, PALETTE_SHIRTS),
        side, block, along, dir: rng() < 0.5 ? 1 : -1, state: 'walk', fleeTimer: 0, down: false, counted: false,
      });
    }
  }

  function mission() {
    return MISSIONS[state.missionIndex];
  }

  function setMission(index) {
    state.missionIndex = index;
    state.missionStep = 0;
    state.missionKills = 0;
    state.enemies = [];
    const m = MISSIONS[index];
    if (!m) {
      state.allDone = true;
      state.marker.active = false;
      return;
    }
    if (m.id === 1) setMarker(PLACES.garage);
    else if (m.id === 2) setMarker(PLACES.dock);
    else if (m.id === 3) {
      state.wanted = 2;
      state.wantedTimer = 0;
      setMarker(PLACES.garage);
    } else if (m.id === 4) {
      spawnEnemies();
      setMarker(PLACES.plaza);
    } else if (m.id === 5) setMarker(PLACES.bank);
    state.message = `${m.name} — ${m.giver}: ${m.brief}`;
    state.messageTimer = 9;
  }

  function setMarker(place) {
    state.marker.x = place.x;
    state.marker.z = place.z;
    state.marker.active = true;
    state.marker.label = place.label;
  }

  function spawnEnemies() {
    const spots = [[-10, -8], [10, -10], [-8, 10], [12, 8]];
    for (const [x, z] of spots) {
      state.enemies.push({
        x, z, heading: rng() * Math.PI * 2, health: COMBAT.enemyHealth, alive: true,
        fireCooldown: range(rng, 0.5, 1.5), color: 0xd43d2a, strafe: rng() < 0.5 ? 1 : -1, strafeTimer: 0,
      });
    }
  }

  function addWanted(n) {
    state.wanted = clamp(state.wanted + n, 0, 5);
    state.wantedTimer = 0;
  }

  // ---- collision -----------------------------------------------------------
  function collideCircle(pos, r) {
    for (const b of state.buildings) {
      const cx = clamp(pos.x, b.x - b.w / 2, b.x + b.w / 2);
      const cz = clamp(pos.z, b.z - b.d / 2, b.z + b.d / 2);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else if (d2 <= 0.0001) {
        // centre inside the box: push out along the smallest penetration axis
        const px = b.w / 2 + r - Math.abs(pos.x - b.x);
        const pz = b.d / 2 + r - Math.abs(pos.z - b.z);
        if (px < pz) pos.x = b.x + (pos.x > b.x ? 1 : -1) * (b.w / 2 + r);
        else pos.z = b.z + (pos.z > b.z ? 1 : -1) * (b.d / 2 + r);
      }
    }
    pos.x = clamp(pos.x, -CITY.half + 2, CITY.half - 2);
    pos.z = clamp(pos.z, -CITY.half + 2, CITY.half - 2);
  }

  function carHitsBuilding(car) {
    const fx = car.x + Math.sin(car.heading) * 1.9;
    const fz = car.z + Math.cos(car.heading) * 1.9;
    const bx = car.x - Math.sin(car.heading) * 1.9;
    const bz = car.z - Math.cos(car.heading) * 1.9;
    const before = { x: car.x, z: car.z };
    const front = { x: fx, z: fz };
    const back = { x: bx, z: bz };
    collideCircle(front, 1.3);
    collideCircle(back, 1.3);
    car.x = (front.x + back.x) / 2;
    car.z = (front.z + back.z) / 2;
    if (Math.abs(car.x - before.x) > 0.01 || Math.abs(car.z - before.z) > 0.01) {
      if (Math.abs(car.speed) > 6) return true;
      car.speed *= 0.4;
    }
    return false;
  }

  // ---- interaction ---------------------------------------------------------
  function nearestCar(maxDist) {
    const p = state.player;
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (!car.active || car.police) continue;
      const d = dist2(p.x, p.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car, events) {
    const p = state.player;
    p.inCar = true;
    p.car = car;
    car.speed = 0;
    if (car.driver) {
      car.driver = false;
      addWanted(1);
      state.message = 'Mobil dicuri! Wanted +1.';
      state.messageTimer = 3;
      return events | EVENT_STEAL;
    }
    return events;
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    p.inCar = false;
    p.car = null;
    p.x = car.x - Math.sin(car.heading) * 3;
    p.z = car.z - Math.cos(car.heading) * 3;
    p.heading = car.heading;
    collideCircle(p, PLAYER.radius);
  }

  function shoot(events) {
    const p = state.player;
    if (p.inCar || p.reload > 0 || p.fireCooldown > 0) return events;
    if (p.ammo <= 0) {
      p.reload = COMBAT.reloadSeconds;
      return events;
    }
    p.ammo -= 1;
    p.fireCooldown = COMBAT.pistolRate;
    events |= EVENT_SHOT;
    const aimX = Math.sin(p.heading);
    const aimZ = Math.cos(p.heading);
    let best = null;
    let bestD = COMBAT.pistolRange;
    const targets = [];
    for (const e of state.enemies) if (e.alive) targets.push({ x: e.x, z: e.z, kind: 'enemy', ref: e });
    for (const c of state.police) if (c.active) targets.push({ x: c.x, z: c.z, kind: 'cop', ref: c });
    for (const pd of state.peds) if (!pd.down) targets.push({ x: pd.x, z: pd.z, kind: 'ped', ref: pd });
    for (const t of targets) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > COMBAT.pistolRange || d < 0.5) continue;
      const dot = (dx * aimX + dz * aimZ) / d;
      if (dot < 0.86) continue; // ~30 degree cone
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      if (best.kind === 'enemy') {
        best.ref.health -= COMBAT.pistolDamage;
        events |= EVENT_HIT;
        if (best.ref.health <= 0) {
          best.ref.alive = false;
          state.missionKills += 1;
          addWanted(1);
        }
      } else if (best.kind === 'cop') {
        addWanted(1);
        state.message = 'Polisi ditembak! Wanted naik.';
        state.messageTimer = 3;
        events |= EVENT_HIT;
      } else {
        best.ref.down = true;
        best.ref.state = 'down';
        if (!best.ref.counted) {
          best.ref.counted = true;
          addWanted(1);
        }
        events |= EVENT_HIT;
      }
    }
    return events;
  }

  // ---- traffic / peds / police ---------------------------------------------
  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (!car.active || car.parked) continue;
      if (state.player.car === car) continue; // player drives it
      // slow down if a car is ahead on the same road
      let ahead = false;
      for (const other of state.cars) {
        if (other === car || !other.active) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 9 && d > 0.1) {
          const fx = Math.sin(car.heading);
          const fz = Math.cos(car.heading);
          if ((dx * fx + dz * fz) / d > 0.8) ahead = true;
        }
      }
      const target = ahead ? 0 : car.cruise;
      car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const along = car.axis === 'x' ? car.x : car.z;
      // turn at a random intersection
      if (car.turnAt === null) {
        for (const c of ROAD_CENTERS) {
          if (Math.abs(along - c) < 1.2 && rng() < 0.35) {
            car.turnAt = c;
            break;
          }
        }
      }
      // Turn at a random intersection: keep the along-coordinate, switch roads.
      if (car.turnAt !== null && Math.abs(along - car.turnAt) < 0.6) {
        const cross = car.turnAt;
        const newDir = rng() < 0.5 ? 1 : -1;
        if (car.axis === 'x') {
          // was driving along x on road z=car.road; now drive along z on road x=cross
          car.axis = 'z';
          car.road = cross;
          car.x = cross + (newDir > 0 ? -car.lane : car.lane);
          car.heading = newDir > 0 ? 0 : Math.PI;
        } else {
          // was driving along z on road x=car.road; now drive along x on road z=cross
          car.axis = 'x';
          car.road = cross;
          car.z = cross + (newDir > 0 ? car.lane : -car.lane);
          car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        car.dir = newDir;
        car.turnAt = null;
      }
      // wrap at the city edge
      if (along > 114 || along < -114) {
        car.dir *= -1;
        car.heading += Math.PI;
        if (car.axis === 'x') car.x = clamp(car.x, -112, 112);
        else car.z = clamp(car.z, -112, 112);
      }
    }
  }

  function stepPeds(dt, events) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) continue;
      const dPlayer = Math.sqrt(dist2(ped.x, ped.z, p.x, p.z));
      if (ped.state === 'walk' && dPlayer < 7 && (p.fireCooldown > 0 || (p.inCar && p.car && Math.abs(p.car.speed) > 8))) {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dx = ped.x - p.x;
        const dz = ped.z - p.z;
        const d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.x += Math.sin(ped.heading) * PED.speed * 2.6 * dt;
        ped.z += Math.cos(ped.heading) * PED.speed * 2.6 * dt;
        collideCircle(ped, PED.radius);
        if (ped.fleeTimer <= 0) ped.state = 'walk';
        continue;
      }
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along > 14 || ped.along < -14) ped.dir *= -1;
      if (ped.side === 0) { ped.z = ped.block.z - 17; ped.x = ped.block.x + ped.along; ped.heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else if (ped.side === 1) { ped.z = ped.block.z + 17; ped.x = ped.block.x + ped.along; ped.heading = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else if (ped.side === 2) { ped.x = ped.block.x - 17; ped.z = ped.block.z + ped.along; ped.heading = ped.dir > 0 ? 0 : Math.PI; }
      else { ped.x = ped.block.x + 17; ped.z = ped.block.z + ped.along; ped.heading = ped.dir > 0 ? 0 : Math.PI; }
      // run over by the player's car
      if (p.inCar && p.car) {
        const d = Math.sqrt(dist2(ped.x, ped.z, p.car.x, p.car.z));
        if (d < 2.4 && Math.abs(p.car.speed) > 3) {
          ped.down = true;
          ped.state = 'down';
          if (!ped.counted) {
            ped.counted = true;
            addWanted(1);
            state.message = 'Pejalan kaki tertabrak! Wanted +1.';
            state.messageTimer = 3;
          }
          events |= EVENT_CRASH;
        }
      }
    }
    return events;
  }

  function spawnPolice() {
    const p = state.player;
    const px = p.inCar && p.car ? p.car.x : p.x;
    const pz = p.inCar && p.car ? p.car.z : p.z;
    const road = pick(rng, ROAD_CENTERS);
    const edge = rng() < 0.5;
    const car = makeCar(rng, 0, 0, 0, true);
    if (edge) {
      car.x = px > 0 ? 112 : -112;
      car.z = road;
      car.heading = px > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      car.z = pz > 0 ? 112 : -112;
      car.x = road;
      car.heading = pz > 0 ? Math.PI : 0;
    }
    car.speed = 10;
    car.cruise = POLICE.chaseSpeed;
    state.police.push(car);
  }

  function stepPolice(dt, events) {
    const p = state.player;
    const target = p.inCar && p.car ? p.car : p;
    const want = Math.min(state.wanted, POLICE.maxCars);
    while (state.police.length < want) spawnPolice();
    while (state.police.length > want) state.police.pop();
    let nearest = Infinity;
    for (const cop of state.police) {
      const dx = target.x - cop.x;
      const dz = target.z - cop.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      nearest = Math.min(nearest, d);
      const wantHeading = Math.atan2(dx, dz);
      cop.heading += clamp(angleDiff(cop.heading, wantHeading), -2.4 * dt, 2.4 * dt);
      cop.speed = Math.min(POLICE.chaseSpeed, cop.speed + 12 * dt);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      // ramming the player
      if (d < 3.4 && cop.speed > 4) {
        if (p.inCar && p.car) {
          if (p.invulnerable <= 0) {
            p.health -= POLICE.ramDamage;
            p.invulnerable = 0.8;
            events |= EVENT_CRASH;
          }
          cop.speed *= 0.4;
        } else if (d < POLICE.bustRadius) {
          state.bustTimer += dt;
          if (state.bustTimer > 1.2) {
            events |= EVENT_BUSTED;
            state.bustTimer = 0;
          }
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt);
      }
      // keep police out of buildings
      collideCircle(cop, 1.6);
    }
    // wanted decays when no police is near
    if (state.wanted > 0 && state.police.length > 0 && nearest > 45) {
      state.wantedTimer += dt;
      if (state.wantedTimer > POLICE.decaySeconds) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        state.message = state.wanted === 0 ? 'Panas reda. Wanted 0.' : `Wanted turun ke ${state.wanted}.`;
        state.messageTimer = 3;
      }
    } else {
      state.wantedTimer = 0;
    }
    return events;
  }

  function stepEnemies(dt, events) {
    const p = state.player;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      e.fireCooldown -= dt;
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafe = -e.strafe;
        e.strafeTimer = range(rng, 1, 2.5);
      }
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      e.heading = Math.atan2(dx, dz);
      if (d < 30) {
        e.x += Math.sin(e.heading + Math.PI / 2) * e.strafe * 1.6 * dt;
        e.z += Math.cos(e.heading + Math.PI / 2) * e.strafe * 1.6 * dt;
      }
      if (d < COMBAT.enemyRange && e.fireCooldown <= 0 && !p.inCar) {
        e.fireCooldown = COMBAT.enemyRate;
        if (rng() < 0.45 && p.invulnerable <= 0) {
          p.health -= COMBAT.enemyDamage;
          p.invulnerable = 0.4;
          events |= EVENT_HIT;
        }
      }
    }
    return events;
  }

  // ---- missions ------------------------------------------------------------
  function stepMissions(dt, events) {
    const m = MISSIONS[state.missionIndex];
    if (!m) return events;
    const p = state.player;
    const px = p.inCar && p.car ? p.car.x : p.x;
    const pz = p.inCar && p.car ? p.car.z : p.z;
    const near = (place, r) => dist2(px, pz, place.x, place.z) < r * r;

    if (m.id === 1) {
      if (state.missionStep === 0 && p.inCar) {
        state.missionStep = 1;
        setMarker(PLACES.garage);
        state.message = 'Mobil didapat! Antar ke Bengkel Mara.';
        state.messageTimer = 4;
      } else if (state.missionStep === 1 && p.inCar && near(PLACES.garage, 9)) {
        return completeMission(events);
      }
    } else if (m.id === 2) {
      if (state.missionStep === 0 && near(PLACES.dock, 7)) {
        state.missionStep = 1;
        setMarker(PLACES.garage);
        state.message = 'Paket didapat! Bawa ke Bengkel Mara.';
        state.messageTimer = 4;
        events |= EVENT_PICKUP;
      } else if (state.missionStep === 1 && near(PLACES.garage, 9)) {
        return completeMission(events);
      }
    } else if (m.id === 3) {
      if (state.missionStep === 0 && state.wanted === 0) {
        state.missionStep = 1;
        setMarker(PLACES.garage);
        state.message = 'Panas reda! Kembali ke Bengkel Mara.';
        state.messageTimer = 4;
      } else if (state.missionStep === 1 && near(PLACES.garage, 9)) {
        return completeMission(events);
      }
    } else if (m.id === 4) {
      if (state.missionKills >= 4) return completeMission(events);
    } else if (m.id === 5) {
      if (state.missionStep === 0 && near(PLACES.bank, 7)) {
        state.missionStep = 1;
        addWanted(3);
        setMarker(PLACES.safehouse);
        state.message = 'Uang didapat! Kabur ke Tempat Aman — wanted 3!';
        state.messageTimer = 5;
        events |= EVENT_PICKUP;
      } else if (state.missionStep === 1 && near(PLACES.safehouse, 9)) {
        return completeMission(events);
      }
    }
    return events;
  }

  function completeMission(events) {
    const m = MISSIONS[state.missionIndex];
    state.cash += m.reward;
    state.message = `Misi selesai: ${m.name} (+$${m.reward})`;
    state.messageTimer = 5;
    events |= EVENT_MISSION;
    if (state.missionIndex + 1 >= MISSIONS.length) {
      state.allDone = true;
      state.marker.active = false;
      events |= EVENT_ALL_DONE;
      state.message = 'Semua misi selesai! Port Vela milikmu, Rook.';
      state.messageTimer = 8;
    } else {
      setMission(state.missionIndex + 1);
    }
    return events;
  }

  // ---- main step -----------------------------------------------------------
  function step(dt, input, actions) {
    let events = 0;
    state.elapsed += dt;
    const p = state.player;
    if (p.invulnerable > 0) p.invulnerable = Math.max(0, p.invulnerable - dt);
    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.reload > 0) {
      p.reload -= dt;
      if (p.reload <= 0) p.ammo = COMBAT.pistolAmmo;
    }
    if (state.messageTimer > 0) state.messageTimer -= dt;

    const move = input.move();

    if (actions & 4) { // interact (E)
      if (p.inCar) exitCar();
      else {
        const car = nearestCar(CAR.stealRadius);
        if (car) events = enterCar(car, events);
      }
    }
    if (actions & 8) events = shoot(events); // shoot (F or click)
    if (actions & 16 && p.ammo < COMBAT.pistolAmmo && p.reload <= 0) p.reload = COMBAT.reloadSeconds; // reload (R)

    if (p.inCar && p.car) {
      const car = p.car;
      const steer = move.s;
      if (move.f > 0) car.speed += CAR.accel * dt;
      else if (move.f < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
      car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
      const turnAmount = CAR.turn * steer * clamp(Math.abs(car.speed) / 8, 0, 1) * Math.sign(car.speed || 1);
      car.heading += turnAmount * dt;
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (carHitsBuilding(car)) events |= EVENT_CRASH;
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      // car-car collisions
      for (const other of state.cars) {
        if (other === car || !other.active) continue;
        const d = Math.sqrt(dist2(car.x, car.z, other.x, other.z));
        if (d < 3.6 && d > 0.01) {
          const push = (3.6 - d) / 2;
          const nx = (car.x - other.x) / d;
          const nz = (car.z - other.z) / d;
          car.x += nx * push;
          car.z += nz * push;
          if (!other.parked) {
            other.x -= nx * push;
            other.z -= nz * push;
          }
          if (Math.abs(car.speed) > 5) {
            car.speed *= 0.5;
            events |= EVENT_CRASH;
          }
        }
      }
    } else {
      // on foot: move relative to the camera yaw supplied by the renderer via input
      const camYaw = input.camYaw !== undefined ? input.camYaw : p.heading;
      const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      let mx = 0;
      let mz = 0;
      if (move.f !== 0 || move.s !== 0) {
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        const rx = Math.sin(camYaw + Math.PI / 2);
        const rz = Math.cos(camYaw + Math.PI / 2);
        mx = fx * move.f + rx * move.s;
        mz = fz * move.f + rz * move.s;
        const len = Math.sqrt(mx * mx + mz * mz);
        mx /= len;
        mz /= len;
        p.heading = Math.atan2(mx, mz);
      }
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      collideCircle(p, PLAYER.radius);
    }

    stepTraffic(dt);
    events = stepPeds(dt, events);
    events = stepPolice(dt, events);
    events = stepEnemies(dt, events);
    events = stepMissions(dt, events);

    if (p.health <= 0) {
      events |= EVENT_WASTED;
      p.health = PLAYER.health;
      p.x = -104;
      p.z = -66;
      if (p.inCar) {
        p.car = null;
        p.inCar = false;
      }
      state.wanted = 0;
      state.police = [];
      p.invulnerable = 2;
    }
    return events;
  }

  reset();
  return { state, reset, step, setMission, mission, addWanted };
}
