// Port Vela simulation: the player, traffic, pedestrians, police, combat and the
// wanted system. Pure logic — rendering lives in render.js, missions in missions.js.
import { buildCity, CITY_HALF, hitsBuilding, resolveBuilding, ROAD_COORDS } from './city.js';
import { angleDiff, clamp, createRng, dist2, wrapAngle } from './rng.js';
import { MISSIONS, missionTick } from './missions.js';

export const EV_SHOT = 1;
export const EV_HIT = 2;
export const EV_CRASH = 4;
export const EV_PICKUP = 8;
export const EV_STEAL = 16;
export const EV_MISSION = 32;
export const EV_WASTED = 64;
export const EV_BUSTED = 128;
export const EV_DONE = 256;

const CAR_COLORS = [0xd8d3c8, 0x8a2f2f, 0x2f5d8a, 0xd8a13c, 0x4a7a4f, 0x6a4a8a, 0x3a3f46];
const PED_SHIRTS = [0xd8d3c8, 0xc96a3c, 0x4a7a9e, 0x9e4a6a, 0x6a9e4a, 0xd8c13c];
const MAX_COPS = 5;
const WANTED_QUIET_SECONDS = 10;

function laneOffset(axis, dir) {
  // Right-hand traffic: the lane sits 2.5 m to the right of the travel direction.
  if (axis === 'x') return dir > 0 ? 2.5 : -2.5;
  return dir > 0 ? -2.5 : 2.5;
}

function randomRoadPoint(rng) {
  const c = rng.pick(ROAD_COORDS);
  const along = rng.range(-110, 110);
  return { c, along };
}

export function createWorld(seed) {
  const city = buildCity(seed);
  const world = {
    seed,
    city,
    rng: createRng(seed * 7 + 13),
    time: 0,
    cash: 0,
    missionIndex: 0,
    mission: { stage: null },
    allDone: false,
    wasted: false,
    busted: false,
    wanted: 0,
    quietTimer: 0,
    bustTimer: 0,
    alarmTimer: 0,
    player: null,
    cars: [],
    peds: [],
    enemies: [],
    marker: { x: 0, z: 0, label: '', active: false },
    message: '',
    messageTimer: 0,
  };
  resetWorld(world);
  return world;
}

export function resetWorld(world) {
  const rng = createRng(world.seed * 7 + 13);
  world.rng = rng;
  world.time = 0;
  world.cash = 0;
  world.missionIndex = 0;
  world.mission = { stage: null };
  world.allDone = false;
  world.wasted = false;
  world.busted = false;
  world.wanted = 0;
  world.quietTimer = 0;
  world.bustTimer = 0;
  world.alarmTimer = 0;
  world.player = {
    x: -40, z: 40, heading: Math.PI / 4,
    health: 100, ammo: 12, reloading: false, reloadTimer: 0,
    shootCooldown: 0, inCar: false, carId: -1, speed: 0,
  };
  world.cars = [];
  world.peds = [];
  world.enemies = [];
  world.marker = { x: 0, z: 0, label: '', active: false };
  world.message = '';
  world.messageTimer = 0;
  spawnTraffic(world, rng);
  spawnParked(world, rng);
  spawnPeds(world, rng);
}

function spawnTraffic(world, rng) {
  for (let i = 0; i < 10; i++) {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const road = rng.pick(ROAD_COORDS);
    const along = rng.range(-105, 105);
    const dir = rng.chance(0.5) ? 1 : -1;
    world.cars.push({
      id: world.cars.length,
      kind: 'traffic',
      x: axis === 'x' ? along : road + laneOffset('z', dir),
      z: axis === 'x' ? road + laneOffset('x', dir) : along,
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: rng.range(7, 11),
      cruise: rng.range(8, 12),
      color: rng.pick(CAR_COLORS),
      active: true,
      tx: 0, tz: 0,
      target: null,
    });
    const car = world.cars[world.cars.length - 1];
    car.target = pickNextJunction(world, rng, car);
  }
}

function pickNextJunction(world, rng, car) {
  // The car's next waypoint: a neighbouring road crossing.
  const cx = car.x;
  const cz = car.z;
  const nearX = ROAD_COORDS.reduce((a, b) => (Math.abs(b - cx) < Math.abs(a - cx) ? b : a));
  const nearZ = ROAD_COORDS.reduce((a, b) => (Math.abs(b - cz) < Math.abs(a - cz) ? b : a));
  const options = [];
  for (const c of ROAD_COORDS) {
    if (c !== nearX) options.push({ x: c, z: nearZ });
    if (c !== nearZ) options.push({ x: nearX, z: c });
  }
  const t = rng.pick(options);
  return { x: t.x, z: t.z };
}

function spawnParked(world, rng) {
  for (let i = 0; i < 6; i++) {
    const road = rng.pick(ROAD_COORDS);
    const along = rng.range(-100, 100);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    world.cars.push({
      id: world.cars.length,
      kind: 'parked',
      x: horizontal ? along : road + side * 6.8,
      z: horizontal ? road + side * 6.8 : along,
      heading: horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      speed: 0,
      cruise: 0,
      color: rng.pick(CAR_COLORS),
      active: true,
      target: null,
    });
  }
}

function spawnPeds(world, rng) {
  for (let i = 0; i < 26; i++) {
    const road = rng.pick(ROAD_COORDS);
    const along = rng.range(-108, 108);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    world.peds.push({
      x: horizontal ? along : road + side * 8,
      z: horizontal ? road + side * 8 : along,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.1, 2.1),
      shirt: rng.pick(PED_SHIRTS),
      state: 'walk',
      turnTimer: rng.range(2, 8),
      alive: true,
    });
  }
}

function spawnCop(world) {
  const rng = world.rng;
  const p = world.player;
  // Spawn on a road at the far edge from the player.
  const road = rng.pick(ROAD_COORDS);
  const edge = rng.chance(0.5) ? -112 : 112;
  const horizontal = rng.chance(0.5);
  const startX = horizontal ? edge : road;
  const startZ = horizontal ? road : edge;
  const cop = {
    id: world.cars.length,
    kind: 'police',
    x: startX,
    z: startZ,
    heading: Math.atan2(p.x - startX, p.z - startZ),
    speed: 0,
    cruise: 15,
    color: 0xf2f2f2,
    active: true,
    target: null,
  };
  // First waypoint: the road crossing nearest the cop's spawn point.
  const nearX = ROAD_COORDS.reduce((a, b) => (Math.abs(b - startX) < Math.abs(a - startX) ? b : a));
  const nearZ = ROAD_COORDS.reduce((a, b) => (Math.abs(b - startZ) < Math.abs(a - startZ) ? b : a));
  cop.target = { x: nearX, z: nearZ };
  world.cars.push(cop);
  return cop;
}

function say(world, text) {
  world.message = text;
  world.messageTimer = 4.5;
}

function setMarker(world, x, z, label) {
  if (x === null || x === undefined) {
    world.marker.active = false;
    return;
  }
  world.marker = { x, z, label: label || '', active: true };
}

function finishMission(world) {
  const def = MISSIONS[world.missionIndex];
  world.cash += def.reward;
  say(world, `${def.title} selesai! +$${def.reward.toLocaleString('en-US')}`);
  world.missionIndex += 1;
  world.mission = { stage: null };
  setMarker(world, null, null, null);
  if (world.missionIndex >= MISSIONS.length) {
    world.allDone = true;
    return EV_MISSION | EV_DONE;
  }
  return EV_MISSION;
}

function missionApi(world) {
  return {
    setMarker: (x, z, label) => setMarker(world, x, z, label),
    spawnGang: (n) => {
      const rng = world.rng;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const r = rng.range(7, 14);
        world.enemies.push({
          x: Math.sin(a) * r,
          z: Math.cos(a) * r,
          hp: 100,
          alive: true,
          shootTimer: rng.range(0.8, 1.8),
        });
      }
    },
    setWanted: (n) => {
      world.wanted = n;
      world.quietTimer = 0;
    },
    addCash: (n) => {
      world.cash += n;
    },
    finishMission: () => finishMission(world),
    say: (t) => say(world, t),
  };
}

export function setMission(world, index) {
  world.missionIndex = index;
  world.mission = { stage: null };
  world.allDone = index >= MISSIONS.length;
  setMarker(world, null, null, null);
}

// ctrl: { ax, az, run, interact, shoot, reload, camYaw }
export function stepWorld(world, dt, ctrl) {
  let events = 0;
  const rng = world.rng;
  const p = world.player;
  world.time += dt;
  if (world.messageTimer > 0) {
    world.messageTimer -= dt;
    if (world.messageTimer <= 0) world.message = '';
  }
  if (world.alarmTimer > 0) world.alarmTimer -= dt;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.reloading) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloading = false;
      p.ammo = 12;
    }
  }

  // --- mission logic ---
  const before = world.missionIndex;
  missionTick(world, dt, missionApi(world));
  if (world.missionIndex !== before) {
    events |= world.allDone ? EV_MISSION | EV_DONE : EV_MISSION;
  }

  // --- player movement ---
  const fx = Math.sin(ctrl.camYaw);
  const fz = Math.cos(ctrl.camYaw);
  const rx = -Math.cos(ctrl.camYaw);
  const rz = Math.sin(ctrl.camYaw);
  const mx = fx * ctrl.az + rx * ctrl.ax;
  const mz = fz * ctrl.az + rz * ctrl.ax;
  const mLen = Math.hypot(mx, mz);

  if (p.inCar) {
    const car = world.cars[p.carId];
    if (car) {
      const accel = ctrl.az > 0 ? 15 : ctrl.az < 0 ? -20 : 0;
      car.speed = clamp(car.speed + accel * dt, -8, 31);
      if (ctrl.az === 0) car.speed *= Math.pow(0.4, dt);
      if (Math.abs(car.speed) < 0.15 && ctrl.az === 0) car.speed = 0;
      const steer = ctrl.ax * clamp(Math.abs(car.speed) / 9, 0, 1) * 1.9;
      car.heading = wrapAngle(car.heading + steer * Math.sign(car.speed || 1) * dt);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = resolveBuilding(world.city.buildings, nx, nz, 2.1);
      if (fixed.x !== nx || fixed.z !== nz) {
        if (Math.abs(car.speed) > 9) events |= EV_CRASH;
        car.speed *= 0.35;
      }
      car.x = clamp(fixed.x, -CITY_HALF + 3, CITY_HALF - 3);
      car.z = clamp(fixed.z, -CITY_HALF + 3, CITY_HALF - 3);
      p.x = car.x;
      p.z = car.z;
      p.heading = car.heading;
      p.speed = car.speed;
      if (ctrl.interact) {
        p.inCar = false;
        p.carId = -1;
        car.kind = 'parked';
        car.speed = 0;
        p.x = car.x + Math.cos(car.heading) * 3.2;
        p.z = car.z - Math.sin(car.heading) * 3.2;
        const out = resolveBuilding(world.city.buildings, p.x, p.z, 0.8);
        p.x = out.x;
        p.z = out.z;
      }
    } else {
      p.inCar = false;
    }
  } else {
    const top = ctrl.run ? 10 : 6;
    if (mLen > 0.01) {
      const nx = mx / mLen;
      const nz = mz / mLen;
      const targetHeading = Math.atan2(nx, nz);
      p.heading = wrapAngle(p.heading + angleDiff(p.heading, targetHeading) * Math.min(1, dt * 12));
      const nx2 = p.x + nx * top * dt;
      const nz2 = p.z + nz * top * dt;
      const fixed = resolveBuilding(world.city.buildings, nx2, nz2, 0.8);
      p.x = clamp(fixed.x, -CITY_HALF + 2, CITY_HALF - 2);
      p.z = clamp(fixed.z, -CITY_HALF + 2, CITY_HALF - 2);
      p.speed = top;
    } else {
      p.speed = 0;
    }
    if (ctrl.interact) {
      let best = null;
      let bestD = 4.5 * 4.5;
      for (const car of world.cars) {
        if (!car.active || car.kind === 'police') continue;
        const d = dist2(p.x, p.z, car.x, car.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) {
        if (best.kind === 'traffic') {
          // The driver bails out and becomes a fleeing pedestrian.
          world.peds.push({
            x: best.x + 2, z: best.z + 2, heading: rng.range(0, Math.PI * 2),
            speed: 4.5, shirt: 0xd8d3c8, state: 'flee', turnTimer: 0, alive: true,
          });
        }
        best.kind = 'player';
        best.speed = 0;
        p.inCar = true;
        p.carId = best.id;
        p.x = best.x;
        p.z = best.z;
        p.heading = best.heading;
        if (world.wanted < 1) world.wanted = 1;
        events |= EV_STEAL;
        say(world, 'Mobil dicuri! Polisi mengincarmu.');
      }
    }
  }

  // --- shooting ---
  if (ctrl.shoot && !p.inCar && !p.reloading && p.shootCooldown <= 0 && p.ammo > 0) {
    p.ammo -= 1;
    p.shootCooldown = 0.28;
    events |= EV_SHOT;
    world.alarmTimer = 1.2;
    if (world.wanted < 2) world.wanted = 2;
    const aimX = Math.sin(ctrl.camYaw);
    const aimZ = Math.cos(ctrl.camYaw);
    let hitEnemy = null;
    let hitD = 45;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 45 || d < 0.5) continue;
      const dot = (dx * aimX + dz * aimZ) / d;
      if (dot > 0.995 && d < hitD) {
        hitD = d;
        hitEnemy = e;
      }
    }
    if (hitEnemy) {
      hitEnemy.hp -= 34;
      events |= EV_HIT;
      if (hitEnemy.hp <= 0) {
        hitEnemy.alive = false;
        say(world, 'Satu anggota Kobra tumbang!');
      }
    } else {
      // A stray shot can drop a nearby pedestrian in the line of fire.
      for (const ped of world.peds) {
        if (!ped.alive || ped.state === 'down') continue;
        const dx = ped.x - p.x;
        const dz = ped.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 40 || d < 0.5) continue;
        const dot = (dx * aimX + dz * aimZ) / d;
        if (dot > 0.995) {
          ped.state = 'down';
          ped.alive = false;
          events |= EV_HIT;
          break;
        }
      }
    }
  }
  if (ctrl.reload && !p.inCar && !p.reloading && p.ammo < 12) {
    p.reloading = true;
    p.reloadTimer = 0.9;
  }

  // --- enemies shoot back ---
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.shootTimer -= dt;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.shootTimer <= 0 && d < 34) {
      e.shootTimer = rng.range(1.3, 2.3);
      if (rng.chance(0.45)) {
        p.health -= 7;
        events |= EV_HIT;
        if (p.health <= 0) {
          p.health = 0;
          world.wasted = true;
          events |= EV_WASTED;
        }
      }
    }
  }

  // --- traffic ---
  for (const car of world.cars) {
    if (!car.active || car.kind !== 'traffic' || !car.target) continue;
    const dx = car.target.x - car.x;
    const dz = car.target.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      car.target = pickNextJunction(world, rng, car);
      continue;
    }
    const wantHeading = Math.atan2(dx, dz);
    car.heading = wrapAngle(car.heading + angleDiff(car.heading, wantHeading) * Math.min(1, dt * 6));
    // Slow down for a car ahead.
    let blocked = false;
    for (const other of world.cars) {
      if (other === car || !other.active) continue;
      const odx = other.x - car.x;
      const odz = other.z - car.z;
      const od = Math.hypot(odx, odz);
      if (od < 11 && od > 0.1) {
        const dot = (odx * Math.sin(car.heading) + odz * Math.cos(car.heading)) / od;
        if (dot > 0.85) {
          blocked = true;
          break;
        }
      }
    }
    const targetSpeed = blocked ? 0 : car.cruise;
    car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const fixed = resolveBuilding(world.city.buildings, nx, nz, 2.1);
    car.x = fixed.x;
    car.z = fixed.z;
  }

  // --- pedestrians ---
  for (const ped of world.peds) {
    if (!ped.alive) continue;
    ped.turnTimer -= dt;
    const pd = Math.hypot(ped.x - p.x, ped.z - p.z);
    const carNear = p.inCar && Math.abs(p.speed) > 6 && pd < 9;
    if (carNear || world.alarmTimer > 0) ped.state = 'flee';
    else if (ped.state === 'flee' && pd > 26) ped.state = 'walk';
    const speed = ped.state === 'flee' ? 4.6 : ped.speed;
    if (ped.state === 'flee') {
      ped.heading = Math.atan2(ped.x - p.x, ped.z - p.z);
    } else if (ped.turnTimer <= 0) {
      ped.turnTimer = rng.range(3, 9);
      ped.heading = wrapAngle(ped.heading + rng.pick([-Math.PI / 2, 0, Math.PI / 2, Math.PI]));
    }
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    if (hitsBuilding(world.city.buildings, nx, nz, 0.7)) {
      ped.heading = wrapAngle(ped.heading + Math.PI);
    } else {
      ped.x = clamp(nx, -CITY_HALF + 2, CITY_HALF - 2);
      ped.z = clamp(nz, -CITY_HALF + 2, CITY_HALF - 2);
    }
    // Run over by the player's car.
    if (p.inCar && Math.abs(p.speed) > 3 && pd < 2.4) {
      ped.alive = false;
      ped.state = 'down';
      if (world.wanted < 1) world.wanted = 1;
      events |= EV_CRASH;
      say(world, 'Kamu menabrak pejalan kaki!');
    }
  }

  // --- police ---
  const cops = world.cars.filter((c) => c.kind === 'police' && c.active);
  if (world.wanted > 0) {
    while (cops.length < Math.min(world.wanted, MAX_COPS)) {
      cops.push(spawnCop(world));
    }
  }
  let nearestCop = Infinity;
  for (const cop of cops) {
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const d = Math.hypot(dx, dz);
    nearestCop = Math.min(nearestCop, d);
    // Chase on the road grid: drive junction to junction, always picking the
    // neighbouring crossing closest to the player. Close in, steer straight
    // at the player instead (short range, mostly open ground).
    let wantHeading;
    if (d < 25) {
      wantHeading = Math.atan2(dx, dz);
    } else {
      const tdx = cop.target.x - cop.x;
      const tdz = cop.target.z - cop.z;
      if (Math.hypot(tdx, tdz) < 2.5) {
        const options = [];
        for (const c of ROAD_COORDS) {
          if (c !== cop.target.x) options.push({ x: c, z: cop.target.z });
          if (c !== cop.target.z) options.push({ x: cop.target.x, z: c });
        }
        let bestJ = options[0];
        let bestD = Infinity;
        for (const j of options) {
          const jd = Math.hypot(j.x - p.x, j.z - p.z) + rng.range(0, 12);
          if (jd < bestD) {
            bestD = jd;
            bestJ = j;
          }
        }
        cop.target = bestJ;
      }
      wantHeading = Math.atan2(cop.target.x - cop.x, cop.target.z - cop.z);
    }
    cop.heading = wrapAngle(cop.heading + angleDiff(cop.heading, wantHeading) * Math.min(1, dt * 2.4));
    const cruise = 13 + world.wanted;
    cop.speed += clamp(cruise - cop.speed, -16 * dt, 10 * dt);
    const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
    const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
    const fixed = resolveBuilding(world.city.buildings, nx, nz, 2.1);
    if (fixed.x !== nx || fixed.z !== nz) cop.speed *= 0.5;
    cop.x = clamp(fixed.x, -CITY_HALF + 3, CITY_HALF - 3);
    cop.z = clamp(fixed.z, -CITY_HALF + 3, CITY_HALF - 3);
    if (d < 3.4) {
      if (p.inCar) {
        const car = world.cars[p.carId];
        if (car && Math.abs(car.speed) > 6) {
          car.speed *= 0.55;
          events |= EV_CRASH;
        }
      } else {
        world.bustTimer += dt;
        if (world.bustTimer > 2.5) {
          world.busted = true;
          world.wasted = true;
          events |= EV_BUSTED | EV_WASTED;
        }
      }
    }
  }
  if (nearestCop > 3.4) world.bustTimer = 0;

  // --- wanted decay ---
  // Staying clear of every cop builds quiet time; a cop closing in drains it
  // three times as fast instead of wiping it, so one interception does not
  // erase a long escape.
  if (world.wanted > 0) {
    if (nearestCop > 35) {
      world.quietTimer += dt;
      if (world.quietTimer >= WANTED_QUIET_SECONDS) {
        world.quietTimer = 0;
        world.wanted -= 1;
        if (world.wanted === 0) {
          for (const cop of world.cars) {
            if (cop.kind === 'police') cop.active = false;
          }
          say(world, 'Polisi kehilangan jejakmu.');
        }
      }
    } else {
      world.quietTimer = Math.max(0, world.quietTimer - dt * 3);
    }
  }

  return events;
}
