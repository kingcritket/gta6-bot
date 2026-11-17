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
    s.wanted = 1;
    s.spawnPolice = 1;
    s.policeTimer = 0;
    driveForward(world, 2.5);
    // Stage the pursuing cop just behind the player's car.
    const cop = s.cars.find((c) => c.kind === 'police');
    if (cop) {
      const back = { x: Math.sin(s.player.heading), z: Math.cos(s.player.heading) };
      cop.x = s.player.x - back.x * 13;
      cop.z = s.player.z - back.z * 13;
      cop.heading = s.player.heading;
      cop.speed = 20;
    }
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
  return { camYaw: Math.PI, screen: SCREEN_PLAY, camDist: 1 };
}

export { SITES };
