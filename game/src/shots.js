// The screenshot scenes behind ?shot=start|play|end. Each one stages the real
// simulation — a fresh world, then real steps with a scripted driver — so the
// frame is what the game actually looks like, and the same seed always gives
// the same frame.
import { STEP } from './config.js';
import { angleDiff, clamp } from './random.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function idleInput(camYaw) {
  return {
    move: () => ({ f: 0, s: 0, run: false }),
    takeMouse: () => ({ dx: 0, dy: 0 }),
    camYaw,
  };
}

function driveInput(world) {
  return {
    move: () => {
      const car = world.state.player.car;
      // Steer back toward heading 0 (due +z) while holding the gas.
      const steer = car ? clamp(angleDiff(car.heading, 0) * 2, -1, 1) : 0;
      return { f: 1, s: steer, run: false };
    },
    takeMouse: () => ({ dx: 0, dy: 0 }),
    camYaw: 0,
  };
}

function runSteps(world, seconds, input) {
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, input, 0);
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start)
 * and return the screen to draw over it and the camera yaw to frame it with.
 */
export function stageShot(name, world) {
  world.reset();
  const p = world.state.player;
  if (name !== 'play' && name !== 'end') {
    // Title backdrop: Rook on foot at a crossroads, traffic rolling past.
    p.x = -66;
    p.z = -22;
    p.heading = Math.PI / 2;
    runSteps(world, 4, idleInput(Math.PI / 2));
    return { screen: SCREEN_TITLE, camYaw: Math.PI / 2 };
  }
  if (name === 'play') {
    // Mission 1 mid-drive: Rook in a stolen car down the west avenue, wanted 1.
    const car = world.state.cars.find((c) => c.parked && Math.abs(c.x + 66) < 1) || world.state.cars[0];
    car.x = -66;
    car.z = -60;
    car.heading = 0;
    car.parked = false;
    car.driver = false;
    p.inCar = true;
    p.car = car;
    p.x = car.x;
    p.z = car.z;
    p.heading = 0;
    world.state.wanted = 1;
    runSteps(world, 4.5, driveInput(world));
    return { screen: SCREEN_PLAY, camYaw: 0 };
  }
  // End: mission 4, the plaza shootout — Rook on foot, four Kobra members, wanted 2.
  world.setMission(3);
  p.x = 6;
  p.z = 8;
  p.heading = Math.atan2(-6, -8);
  world.state.wanted = 2;
  runSteps(world, 2.5, idleInput(p.heading));
  return { screen: SCREEN_PLAY, camYaw: p.heading };
}
