// Port Vela — the simulation. Pure logic, no three.js, no DOM: the same step
// function drives the browser game and the headless tests. The renderer only
// reads state; this module owns every rule (movement, traffic, police,
// wanted, combat, missions).
import {
  ACTION, BUST_SECONDS, CAR_ACCEL, CAR_BRAKE, CAR_MAX_SPEED, CAR_REVERSE_MAX,
  CAR_TURN, ENEMY_ACCURACY, ENEMY_DAMAGE_MAX, ENEMY_DAMAGE_MIN, ENEMY_RANGE,
  ENEMY_SHOOT_MAX, ENEMY_SHOOT_MIN, EV, HEALTH_REGEN_DELAY, HEALTH_REGEN_RATE,
  PISTOL_COOLDOWN, PISTOL_DAMAGE, PISTOL_MAG, PISTOL_RANGE, POLICE_MAX,
  QUIET_SECONDS, RELOAD_TIME, RUN_SPEED, STREETS, WALK_SPEED,
} from './config.js';
import { buildCity, collideCircle, nearestStreetPoint } from './city.js';
import { MISSIONS, missionReward } from './missions.js';
import { Rng } from './rng.js';
import { angleDiff, angleLerp, clamp, dist2, headingToVector, vectorToHeading } from './util.js';

const CAR_COLORS = ['#c0392b', '#2e86c1', '#f1c40f', '#7d3c98', '#16a085', '#e67e22', '#95a5a6', '#ecf0f1', '#34495e', '#d35400'];
const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];

export function createWorld(seed) {
  const city = buildCity(seed);
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const world = { seed, city, rng, state: null };
  world.state = newState(world);
  world.reset = () => {
    world.state = newState(world);
  };
  world.setMission = (i) => setMission(world, i);
  world.respawn = () => respawn(world);
  world.step = (dt, keys, actions) => stepWorld(world, dt, keys, actions);
  return world;
}

function newState(world) {
  const { city, rng } = world;
  const state = {
    rng,
    city,
    time: 0,
    cash: 0,
    missionIndex: 0,
    mission: { stage: 0, timer: 0 },
    allDone: false,
    wanted: 0,
    quietTimer: 0,
    bustTimer: 0,
    nearestCop: Infinity,
    hideIn: 0,
    spawnPolice: 0,
    policeTimer: 0,
    lastShotAt: -100,
    lastDamageAt: -100,
    events: 0,
    toast: '',
    toastT: 0,
    marker: { x: 0, z: 0, active: false, label: '' },
    player: {
      x: -92, z: 60, heading: Math.PI / 2, speed: 0,
      health: 100, ammo: PISTOL_MAG, reloading: 0, shootCd: 0, inCar: null,
    },
    cars: [],
    peds: [],
    enemies: [],
  };
  for (let i = 0; i < 9; i++) state.cars.push(spawnParkedCar(world));
  for (let i = 0; i < 12; i++) state.cars.push(spawnTrafficCar(world));
  for (let i = 0; i < 26; i++) state.peds.push(spawnPed(world));
  MISSIONS[0].setup(state);
  return state;
}

function setToast(state, text) {
  state.toast = text;
  state.toastT = 3;
}

function spawnParkedCar(world) {
  const { rng } = world;
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = rng.pick(STREETS);
  const along = rng.range(-108, 108);
  const side = rng.chance(0.5) ? 1 : -1;
  const x = axis === 'x' ? along : line + side * 3.6;
  const z = axis === 'x' ? line + side * 3.6 : along;
  const heading = axis === 'x' ? Math.PI / 2 : 0;
  return {
    id: `c${rng.int(1000, 9999)}-${Math.floor(rng.next() * 1e6)}`,
    kind: 'parked', mine: false, active: true,
    x, z, heading, speed: 0, color: rng.pick(CAR_COLORS),
  };
}

function spawnTrafficCar(world) {
  const { rng } = world;
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = rng.pick(STREETS);
  const car = {
    id: `t${rng.int(1000, 9999)}-${Math.floor(rng.next() * 1e6)}`,
    kind: 'traffic', mine: false, active: true,
    axis, line, along: rng.range(-108, 108), dir: rng.chance(0.5) ? 1 : -1,
    speed: rng.range(7, 11), cruise: rng.range(8, 12),
    x: 0, z: 0, heading: 0, color: rng.pick(CAR_COLORS),
  };
  trafficPose(car);
  return car;
}

function trafficPose(car) {
  if (car.axis === 'x') {
    car.x = car.along;
    car.z = car.line;
    car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = car.line;
    car.z = car.along;
    car.heading = car.dir > 0 ? 0 : Math.PI;
  }
}

function spawnPed(world, x, z, fleeFrom) {
  const { rng } = world;
  const p = {
    x: x ?? 0, z: z ?? 0, tx: 0, tz: 0, heading: rng.range(0, Math.PI * 2),
    speed: rng.range(1.1, 1.8), mode: 'walk', fleeT: 0, down: false,
    color: rng.pick(PED_COLORS), fx: 0, fz: 0,
  };
  if (x === undefined) {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.pick(STREETS);
    const along = rng.range(-108, 108);
    const side = rng.chance(0.5) ? 1 : -1;
    p.x = axis === 'x' ? along : line + side * 6.6;
    p.z = axis === 'x' ? line + side * 6.6 : along;
  }
  if (fleeFrom) {
    p.mode = 'flee';
    p.fleeT = 2.5;
    p.fx = fleeFrom.x;
    p.fz = fleeFrom.z;
  }
  pickPedTarget(world, p);
  return p;
}

function pickPedTarget(world, p) {
  const { rng } = world;
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = rng.pick(STREETS);
  const along = rng.range(-108, 108);
  const side = rng.chance(0.5) ? 1 : -1;
  p.tx = axis === 'x' ? along : line + side * 6.6;
  p.tz = axis === 'x' ? line + side * 6.6 : along;
}

function policeCount(state) {
  return state.cars.filter((c) => c.kind === 'police' && c.active).length;
}

function syncPoliceQueue(state) {
  const want = state.wanted > 0 ? Math.min(state.wanted, POLICE_MAX) : 0;
  state.spawnPolice = Math.max(0, want - policeCount(state));
}

function raiseWanted(state, amount) {
  state.wanted = Math.min(5, state.wanted + amount);
  state.quietTimer = 0;
  syncPoliceQueue(state);
}

function spawnPoliceCar(world) {
  const { rng, state } = world;
  const p = state.player;
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = rng.pick(STREETS);
  const playerAlong = axis === 'x' ? p.x : p.z;
  const along = clamp(
    playerAlong + (rng.chance(0.5) ? 1 : -1) * rng.range(55, 80),
    -112, 112,
  );
  const car = {
    id: `p${rng.int(1000, 9999)}-${Math.floor(rng.next() * 1e6)}`,
    kind: 'police', mine: false, active: true,
    axis, line, along, dir: Math.sign(playerAlong - along) || 1,
    speed: 0, color: '#ecf0f1', hitCd: 0, recoverT: 0,
    x: 0, z: 0, heading: 0,
  };
  trafficPose(car);
  state.cars.push(car);
  return car;
}

// The street coordinate nearest to v.
function nearestStreetCoord(v) {
  let best = STREETS[0];
  let bestD = Infinity;
  for (const s of STREETS) {
    const d = Math.abs(v - s);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// A police car drives the street grid like traffic, but it hunts: it heads
// for the crossing street nearest the player, turns onto it, and repeats.
// Chasing on roads (instead of beelining through buildings) is what makes
// losing the cops possible — the player's car is faster on a straight.
function stepPoliceDrive(world, car, dt) {
  const state = world.state;
  const p = state.player;
  // Aim at the player — but if the cop is ahead of a driving player, aim
  // behind them instead: a head-on block turns the chase into a traffic jam
  // the player cannot steer out of. Behind, the cop can ram properly.
  let aimX = p.x;
  let aimZ = p.z;
  if (p.inCar) {
    const fwd = headingToVector(p.heading);
    const relX = car.x - p.x;
    const relZ = car.z - p.z;
    const ahead = relX * fwd.x + relZ * fwd.z;
    if (ahead > 0 && Math.hypot(relX, relZ) < 22) {
      aimX = p.x - fwd.x * 18;
      aimZ = p.z - fwd.z * 18;
    }
  }
  const tgt = nearestStreetPoint(state.city, aimX, aimZ);
  const targetAlong = car.axis === 'x' ? tgt.x : tgt.z;
  const targetLine = car.axis === 'x' ? tgt.z : tgt.x;
  let corner = null;
  if (Math.abs(targetLine - car.line) > 6) {
    corner = nearestStreetCoord(targetAlong);
  }
  let goal = corner === null ? targetAlong : corner;
  let dist = Math.abs(goal - car.along);
  if (corner !== null && dist < 2) {
    // Turn onto the crossing street.
    const oldLine = car.line;
    car.axis = car.axis === 'x' ? 'z' : 'x';
    car.line = corner;
    car.along = oldLine;
    const newTarget = car.axis === 'x' ? tgt.x : tgt.z;
    car.dir = Math.sign(newTarget - oldLine) || 1;
    goal = newTarget;
    dist = Math.abs(goal - car.along);
  } else {
    car.dir = Math.sign(goal - car.along) || car.dir;
  }
  const targetSpeed = car.recoverT > 0 ? 6 : dist > 15 ? 17 : 8;
  car.speed += clamp(targetSpeed - car.speed, -20 * dt, 12 * dt);
  car.along += car.dir * car.speed * dt;
  if (car.along > 115) { car.along = 115; car.dir = -1; }
  if (car.along < -115) { car.along = -115; car.dir = 1; }
  if (car.recoverT > 0) car.recoverT -= dt;
  trafficPose(car);
  // A ram can throw the car off the road; snap it back onto the grid.
  const [cx, cz, hit] = collideCircle(state.city, car.x, car.z, 1.6);
  if (hit) {
    car.x = cx;
    car.z = cz;
    const snap = nearestStreetPoint(state.city, car.x, car.z);
    car.axis = snap.axis;
    car.line = snap.line;
    car.along = snap.axis === 'x' ? snap.x : snap.z;
  }
}

function setMission(world, i) {
  const state = world.state;
  state.missionIndex = i;
  state.mission = { stage: 0, timer: 0 };
  MISSIONS[i].setup(state);
}

function respawn(world) {
  const state = world.state;
  const p = state.player;
  p.x = -92;
  p.z = 60;
  p.heading = Math.PI / 2;
  p.speed = 0;
  p.health = 100;
  p.ammo = PISTOL_MAG;
  p.reloading = 0;
  p.inCar = null;
  state.wanted = 0;
  state.quietTimer = 0;
  state.bustTimer = 0;
  state.spawnPolice = 0;
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  // Dying or getting busted must not complete an escape by itself: an
  // escape mission restarts from its setup instead of auto-completing on
  // the respawn's clean wanted level.
  if (state.missionIndex === 2 || (state.missionIndex === 4 && state.mission.stage === 2)) {
    setMission(world, state.missionIndex);
  }
  setToast(state, 'Rook bangun lagi di bengkel Mara.');
}

function tryInteract(world) {
  const state = world.state;
  const p = state.player;
  if (p.inCar) {
    const car = p.inCar;
    const right = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    p.x = car.x + right.x * 2.2;
    p.z = car.z + right.z * 2.2;
    p.heading = car.heading;
    p.speed = 0;
    car.speed = 0;
    car.kind = car.mine ? 'player' : 'parked';
    p.inCar = null;
    return;
  }
  let best = null;
  let bestD = 3.4 * 3.4;
  for (const car of state.cars) {
    if (!car.active || car.kind === 'police') continue;
    const d = dist2(p.x, p.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  p.inCar = best;
  p.heading = best.heading;
  p.speed = 0;
  if (best.kind === 'traffic') {
    state.peds.push(spawnPed(world, best.x, best.z, { x: p.x, z: p.z }));
    best.kind = 'player';
    best.mine = true;
    raiseWanted(state, 1);
    state.events |= EV.STEAL;
    setToast(state, 'Mobil dicuri! Wanted +1');
  } else if (best.kind === 'parked') {
    best.kind = 'player';
    best.mine = true;
    raiseWanted(state, 1);
    state.events |= EV.STEAL;
    setToast(state, 'Mobil dicuri! Wanted +1');
  } else if (best.kind === 'player') {
    best.mine = true;
  }
}

function tryShoot(world) {
  const state = world.state;
  const p = state.player;
  if (p.inCar || p.reloading > 0 || p.shootCd > 0) return;
  if (p.ammo <= 0) {
    p.reloading = RELOAD_TIME;
    return;
  }
  p.ammo -= 1;
  p.shootCd = PISTOL_COOLDOWN;
  state.events |= EV.SHOT;
  state.lastShotAt = state.time;
  // Firing a gun in public draws the cops — except during the plaza
  // turf war, where Mara paid the patrol to look the other way.
  if (state.wanted === 0 && state.missionIndex !== 3) raiseWanted(state, 1);
  const dir = headingToVector(p.heading);
  let best = null;
  let bestD = PISTOL_RANGE * PISTOL_RANGE;
  let bestIsEnemy = false;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = dx * dx + dz * dz;
    if (d > bestD) continue;
    const aim = Math.abs(angleDiff(p.heading, Math.atan2(dx, dz)));
    if (aim < 0.1) { best = e; bestD = d; bestIsEnemy = true; }
  }
  if (!best) {
    for (const ped of state.peds) {
      if (ped.down) continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = dx * dx + dz * dz;
      if (d > bestD) continue;
      const aim = Math.abs(angleDiff(p.heading, Math.atan2(dx, dz)));
      if (aim < 0.1) { best = ped; bestD = d; bestIsEnemy = false; }
    }
  }
  if (!best) return;
  state.events |= EV.HIT;
  if (bestIsEnemy) {
    best.health -= PISTOL_DAMAGE;
    if (best.health <= 0) {
      best.alive = false;
      setToast(state, 'Satu anggota Kobra tumbang!');
    }
  } else {
    best.down = true;
    raiseWanted(state, 1);
    setToast(state, 'Pe jalan kaki tertembak! Wanted +1');
  }
}

function stepPlayer(world, dt, keys) {
  const state = world.state;
  const p = state.player;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      p.ammo = PISTOL_MAG;
      p.reloading = 0;
    }
  }
  if (p.shootCd > 0) p.shootCd -= dt;

  if (p.inCar) {
    const car = p.inCar;
    const f = keys.f || 0;
    const s = keys.s || 0;
    if (f > 0) car.speed += CAR_ACCEL * f * dt;
    else if (f < 0) car.speed += CAR_BRAKE * f * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
    car.speed = clamp(car.speed, -CAR_REVERSE_MAX, CAR_MAX_SPEED);
    const steer = s * CAR_TURN * clamp(Math.abs(car.speed) / 8, 0, 1) * (car.speed >= 0 ? 1 : -1);
    car.heading += steer * dt;
    const dir = headingToVector(car.heading);
    const nx = car.x + dir.x * car.speed * dt;
    const nz = car.z + dir.z * car.speed * dt;
    const [cx, cz, hit] = collideCircle(state.city, nx, nz, 1.6);
    if (hit) {
      if (Math.abs(car.speed) > 12) {
        p.health -= 4;
        state.events |= EV.CRASH;
        setToast(state, 'Tabrakan keras!');
      } else if (Math.abs(car.speed) > 6) {
        state.events |= EV.CRASH;
      }
      car.speed *= 0.45;
    }
    car.x = cx;
    car.z = cz;
    p.x = car.x;
    p.z = car.z;
    p.heading = car.heading;
    p.speed = car.speed;
    // Run over pedestrians.
    if (Math.abs(car.speed) > 6) {
      for (const ped of state.peds) {
        if (ped.down) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 2.3 * 2.3) {
          ped.down = true;
          raiseWanted(state, 1);
          state.events |= EV.CRASH;
          setToast(state, 'Pe jalan kaki tertabrak! Wanted +1');
        }
      }
    }
    // Car-to-car bumps.
    for (const other of state.cars) {
      if (other === car || !other.active) continue;
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < 3.4 * 3.4 && d > 0.01) {
        const dd = Math.sqrt(d);
        const push = (3.4 - dd) / 2;
        const nx2 = (car.x - other.x) / dd;
        const nz2 = (car.z - other.z) / dd;
        car.x += nx2 * push;
        car.z += nz2 * push;
        if (other.kind === 'traffic') {
          other.x -= nx2 * push;
          other.z -= nz2 * push;
        }
        if (Math.abs(car.speed) > 8) state.events |= EV.CRASH;
        car.speed *= 0.6;
      }
    }
    return;
  }

  // On foot.
  const f = keys.f || 0;
  const s = keys.s || 0;
  const moving = f !== 0 || s !== 0;
  if (moving) {
    const camYaw = keys.camYaw || 0;
    const fwd = headingToVector(camYaw);
    const right = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
    const mx = fwd.x * f + right.x * s;
    const mz = fwd.z * f + right.z * s;
    const targetHeading = vectorToHeading(mx, mz);
    p.heading = angleLerp(p.heading, targetHeading, 12 * dt);
    const speed = keys.run ? RUN_SPEED : WALK_SPEED;
    const dir = headingToVector(p.heading);
    const nx = p.x + dir.x * speed * dt;
    const nz = p.z + dir.z * speed * dt;
    const [cx, cz] = collideCircle(state.city, nx, nz, 0.6);
    p.x = cx;
    p.z = cz;
    p.speed = speed;
  } else {
    p.speed = 0;
    // Standing still, the character still turns to face the camera: without
    // this Rook could never aim (and shoot) without walking, so a shootout
    // on foot was unwinnable.
    p.heading = angleLerp(p.heading, keys.camYaw || p.heading, 12 * dt);
  }
}

function stepTraffic(world, dt) {
  const state = world.state;
  const p = state.player;
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || !car.active) continue;
    let target = car.cruise;
    // Slow down for the car ahead on the same street.
    for (const other of state.cars) {
      if (other === car || !other.active || other.kind === 'police') continue;
      if (other.axis !== undefined && other.axis === car.axis && other.line === car.line && other.dir === car.dir) {
        const ahead = (other.along - car.along) * car.dir;
        if (ahead > 0 && ahead < 10) target = Math.min(target, 2.5);
      } else if (other.kind === 'player' && p.inCar === other) {
        const along = car.axis === 'x' ? p.x : p.z;
        const ahead = (along - car.along) * car.dir;
        const side = Math.abs((car.axis === 'x' ? p.z : p.x) - car.line);
        if (ahead > 0 && ahead < 9 && side < 4) target = Math.min(target, 2);
      }
    }
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    car.along += car.dir * car.speed * dt;
    // Turn at intersections sometimes.
    for (const s of STREETS) {
      if (Math.abs(car.along - s) < 1.4 && state.rng.chance(dt * 0.5)) {
        const oldLine = car.line;
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.line = s;
        car.along = oldLine;
        car.dir = state.rng.chance(0.5) ? 1 : -1;
        break;
      }
    }
    if (car.along > 115) { car.along = 115; car.dir = -1; }
    if (car.along < -115) { car.along = -115; car.dir = 1; }
    trafficPose(car);
  }
}

function stepPeds(world, dt) {
  const state = world.state;
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.down) continue;
    let speed = ped.speed;
    let tx = ped.tx;
    let tz = ped.tz;
    // Flee gunfire or a speeding car.
    if (state.time - state.lastShotAt < 1.5 && dist2(ped.x, ped.z, p.x, p.z) < 25 * 25) {
      ped.mode = 'flee';
      ped.fleeT = 2.5;
      ped.fx = p.x;
      ped.fz = p.z;
    } else if (p.inCar && Math.abs(p.speed) > 10 && dist2(ped.x, ped.z, p.x, p.z) < 8 * 8) {
      ped.mode = 'flee';
      ped.fleeT = 2.5;
      ped.fx = p.x;
      ped.fz = p.z;
    }
    if (ped.mode === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.fx;
      const dz = ped.z - ped.fz;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 20;
      tz = ped.z + (dz / d) * 20;
      speed = 5.5;
      if (ped.fleeT <= 0) {
        ped.mode = 'walk';
        pickPedTarget(world, ped);
      }
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) {
      if (ped.mode === 'walk') pickPedTarget(world, ped);
      continue;
    }
    ped.heading = angleLerp(ped.heading, Math.atan2(dx, dz), 6 * dt);
    const nx = ped.x + (dx / d) * speed * dt;
    const nz = ped.z + (dz / d) * speed * dt;
    const [cx, cz] = collideCircle(state.city, nx, nz, 0.5);
    ped.x = cx;
    ped.z = cz;
  }
}

function stepEnemies(world, dt) {
  const state = world.state;
  const p = state.player;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    e.heading = angleLerp(e.heading, Math.atan2(dx, dz), 5 * dt);
    // The gang defends its turf: far from the plaza they drift back home
    // instead of chasing Rook across the city.
    if (d > 25 && e.home) {
      const hx = e.home.x - e.x;
      const hz = e.home.z - e.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 1) {
        const nx = e.x + (hx / hd) * 2.6 * dt;
        const nz = e.z + (hz / hd) * 2.6 * dt;
        const [cx, cz] = collideCircle(state.city, nx, nz, 0.6);
        e.x = cx;
        e.z = cz;
      }
      e.shootCd -= dt;
      continue;
    }
    // Keep a fighting distance: close in past 18 m, back off inside 9 m,
    // strafe sideways the rest of the time.
    let mx = 0;
    let mz = 0;
    if (d > 18) { mx = dx / d; mz = dz / d; }
    else if (d < 9) { mx = -dx / d; mz = -dz / d; }
    else {
      mx = (-dz / d) * e.strafeDir;
      mz = (dx / d) * e.strafeDir;
    }
    if (state.rng.chance(dt * 0.4)) e.strafeDir *= -1;
    const nx = e.x + mx * 2.6 * dt;
    const nz = e.z + mz * 2.6 * dt;
    const [cx, cz, hit] = collideCircle(state.city, nx, nz, 0.6);
    if (hit) e.strafeDir *= -1;
    e.x = cx;
    e.z = cz;
    e.shootCd -= dt;
    // Gang members hold their fire at a moving car: the fight starts when
    // Rook gets out on foot. (Shooting from a car is disabled for the
    // player too, so the rule cuts both ways.)
    if (e.shootCd <= 0 && d < ENEMY_RANGE && !p.inCar) {
      e.shootCd = state.rng.range(ENEMY_SHOOT_MIN, ENEMY_SHOOT_MAX);
      state.lastShotAt = state.time;
      if (state.rng.next() < ENEMY_ACCURACY) {
        p.health -= state.rng.range(ENEMY_DAMAGE_MIN, ENEMY_DAMAGE_MAX);
        state.events |= EV.HIT;
      }
    }
  }
}

function stepPolice(world, dt) {
  const state = world.state;
  const p = state.player;
  // Spawn the queued cars.
  if (state.spawnPolice > 0) {
    state.policeTimer -= dt;
    if (state.policeTimer <= 0 && policeCount(state) < POLICE_MAX) {
      spawnPoliceCar(world);
      state.spawnPolice -= 1;
      state.policeTimer = 1.2;
    }
  }
  // No wanted level: the chase is over, the cars leave.
  if (state.wanted === 0) {
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.bustTimer = 0;
    state.nearestCop = Infinity;
    state.hideIn = 0;
    return;
  }
  let nearest = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'police' || !car.active) continue;
    stepPoliceDrive(world, car, dt);
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < nearest) nearest = d;
    if (car.hitCd > 0) car.hitCd -= dt;
    // Ram the player's car, or corner the player on foot.
    if (p.inCar && d < 3.6 && car.hitCd <= 0) {
      p.health -= 1;
      car.hitCd = 1.2;
      // The ram costs the cop its speed and throws it back off the player.
      car.speed *= 0.15;
      car.recoverT = 2.5;
      const away = Math.hypot(car.x - p.x, car.z - p.z) || 1;
      car.x = p.x + ((car.x - p.x) / away) * 4.5;
      car.z = p.z + ((car.z - p.z) / away) * 4.5;
      const snap = nearestStreetPoint(state.city, car.x, car.z);
      car.axis = snap.axis;
      car.line = snap.line;
      car.along = snap.axis === 'x' ? snap.x : snap.z;
      trafficPose(car);
      state.events |= EV.CRASH;
    }
    if (!p.inCar && d < 3.2) {
      state.bustTimer += dt;
      if (state.bustTimer > BUST_SECONDS) {
        state.events |= EV.BUSTED;
        state.bustTimer = 0;
      }
    }
  }
  if (!p.inCar && nearest > 3.2) state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
  // Wanted decays when no police car is close.
  if (nearest > 35) {
    state.quietTimer += dt;
    if (state.quietTimer >= QUIET_SECONDS) {
      state.wanted -= 1;
      state.quietTimer = 0;
      syncPoliceQueue(state);
      if (state.wanted === 0) setToast(state, 'Polisi kehilangan jejakmu.');
    }
  } else {
    state.quietTimer = Math.max(0, state.quietTimer - dt * 3);
  }
  // Expose the chase for the HUD's lose-the-cops readout.
  state.nearestCop = nearest;
  state.hideIn = state.wanted > 0 && nearest > 35
    ? Math.max(0, Math.ceil(QUIET_SECONDS - state.quietTimer))
    : 0;
}

function stepWorld(world, dt, keys, actions) {
  const state = world.state;
  state.time += dt;
  state.events = 0;
  const hpBefore = state.player.health;
  if (state.toastT > 0) {
    state.toastT -= dt;
    if (state.toastT <= 0) state.toast = '';
  }
  if (actions & ACTION.INTERACT) tryInteract(world);
  if (actions & ACTION.SHOOT) tryShoot(world);
  if (actions & ACTION.RELOAD && state.player.reloading <= 0 && state.player.ammo < PISTOL_MAG) {
    state.player.reloading = RELOAD_TIME;
  }
  stepPlayer(world, dt, keys);
  stepTraffic(world, dt);
  stepPeds(world, dt);
  stepEnemies(world, dt);
  stepPolice(world, dt);
  // Slow health regen after a calm stretch: the plaza fight stays winnable
  // without turning every mission into a war of attrition.
  if (state.player.health < hpBefore) state.lastDamageAt = state.time;
  if (
    state.player.health > 0 && state.player.health < 100 &&
    state.time - state.lastDamageAt > HEALTH_REGEN_DELAY
  ) {
    state.player.health = Math.min(100, state.player.health + HEALTH_REGEN_RATE * dt);
  }
  // Missions.
  if (!state.allDone) {
    const def = MISSIONS[state.missionIndex];
    if (def && def.update(state, dt)) {
      const reward = missionReward(state.missionIndex);
      state.cash += reward;
      state.events |= EV.MISSION;
      state.player.health = Math.min(100, state.player.health + 25);
      setToast(state, `Misi selesai! +$${reward}`);
      if (state.missionIndex >= MISSIONS.length - 1) {
        state.allDone = true;
        state.marker = { x: 0, z: 0, active: false, label: '' };
        state.events |= EV.DONE;
      } else {
        setMission(world, state.missionIndex + 1);
      }
    }
  }
  if (state.player.health <= 0) {
    state.player.health = 0;
    state.events |= EV.WASTED;
  }
  return state.events;
}

export { missionReward as rewardFor };
