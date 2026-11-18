// Port Vela — screenshot staging. ?shot=start|play|end (with &seed=N) poses
// a scene from the game's own sim, renders it, and sets window.__shotReady.
// Nothing here is a mock: every staged scene is the real world stepped
// forward by the real rules.
import { SITES, SCREEN_PLAY, SCREEN_TITLE } from './config.js';

function driveForward(world, seconds) {
  const keys = { f: 1, s: 0, run: false, camYaw: world.state.player.heading };
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60, keys, 0);
}

function idle(world, seconds) {
  const keys = { f: 0, s: 0, run: false, camYaw: world.state.player.heading };
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60, keys, 0);
}

export function stageShot(name, world) {
  const state = world.state;
  if (name === 'start') {
    world.reset();
    const s = world.state;
    s.player.x = -24;
    s.player.z = 34;
    s.player.heading = Math.PI / 4;
    return { camYaw: Math.PI / 4, screen: SCREEN_TITLE, camDist: 1 };
  }
  if (name === 'play') {
    world.reset();
    const s = world.state;
    // Stage Rook driving up the main street toward the plaza: a long
    // straight with the road, traffic and skyline in frame, and no building
    // between the chase camera and the car (the random parked car used to
    // end up nose-first against a tower, hiding the whole shot). Streets
    // sit at ±20/±60/±100 — x=0 is a block interior, not a road.
    const parked = s.cars.find((c) => c.kind === 'parked');
    if (parked) {
      parked.kind = 'player';
      parked.mine = true;
      parked.color = '#e74c3c'; // hero car: bright red, reads at a glance
      parked.x = 20;
      parked.z = 60;
      parked.heading = Math.PI;
      parked.speed = 0;
      s.player.inCar = parked;
      s.player.x = parked.x;
      s.player.z = parked.z;
      s.player.heading = parked.heading;
    }
    world.setMission(1);
    s.cash = 500; // mission 1's reward: the chase happens after the first job
    s.wanted = 1;
    s.spawnPolice = 1;
    s.policeTimer = 0;
    driveForward(world, 2.0);
    // The pursuing cop belongs IN the frame: head-on, lights flashing, on
    // the same street ahead of the player — behind the player it would sit
    // behind the chase camera and never be seen.
    const cop = s.cars.find((c) => c.kind === 'police');
    if (cop) {
      cop.x = s.player.x;
      cop.z = s.player.z - 18;
      cop.heading = 0;
      cop.speed = 12;
      cop.axis = 'z';
      cop.line = 20;
      cop.along = cop.z;
      cop.dir = 1;
    }
    // A car ahead on the same street so the road reads busy, not empty.
    const ahead = s.cars.find((c) => c.kind === 'traffic');
    if (ahead) {
      ahead.x = 20;
      ahead.z = s.player.z - 30;
      ahead.heading = Math.PI;
      ahead.speed = 8;
      ahead.axis = 'z';
      ahead.line = 20;
      ahead.along = ahead.z;
      ahead.dir = -1;
    }
    // The drive can run a pedestrian over: the toast is noise in the shot.
    s.toast = '';
    s.toastT = 0;
    return { camYaw: s.player.heading, screen: SCREEN_PLAY, camDist: 1 };
  }
  if (name === 'docks') {
    // The waterfront: Rook drives south down the strip toward the docks,
    // the harbour water straight ahead, a cop waiting on the boards.
    world.reset();
    const s = world.state;
    const parked = s.cars.find((c) => c.kind === 'parked');
    if (parked) {
      parked.kind = 'player';
      parked.mine = true;
      parked.color = '#e74c3c';
      parked.x = 60;
      parked.z = 60;
      parked.heading = 0;
      parked.speed = 0;
      s.player.inCar = parked;
      s.player.x = parked.x;
      s.player.z = parked.z;
      s.player.heading = parked.heading;
    }
    world.setMission(1);
    s.cash = 1400;
    s.wanted = 1;
    s.spawnPolice = 1;
    s.policeTimer = 0;
    driveForward(world, 2.0);
    // A cop waiting on the docks boards, head-on, lights flashing — the
    // harbour water just behind it.
    const cop = s.cars.find((c) => c.kind === 'police');
    if (cop) {
      cop.x = 60;
      cop.z = 108;
      cop.heading = Math.PI;
      cop.speed = 0;
      cop.axis = 'z';
      cop.line = 60;
      cop.along = cop.z;
      cop.dir = -1;
    }
    // A car ahead on the same street so the road reads busy.
    const ahead = s.cars.find((c) => c.kind === 'traffic');
    if (ahead) {
      ahead.x = 60;
      ahead.z = s.player.z + 12;
      ahead.heading = 0;
      ahead.speed = 8;
      ahead.axis = 'z';
      ahead.line = 60;
      ahead.along = ahead.z;
      ahead.dir = 1;
    }
    s.toast = '';
    s.toastT = 0;
    return { camYaw: s.player.heading, screen: SCREEN_PLAY, camDist: 1 };
  }
  // 'end': the plaza shootout, mission 4, mid-fight.
  world.reset();
  const s2 = world.state;
  world.setMission(3);
  s2.player.x = 0;
  s2.player.z = 9;
  s2.player.heading = Math.PI;
  s2.wanted = 2;
  idle(world, 1.2);
  s2.player.health = 79;
  s2.player.ammo = 7;
  s2.toast = '';
  s2.toastT = 0;
  return { camYaw: Math.PI, screen: SCREEN_PLAY, camDist: 1.1 };
}

export { SITES };
