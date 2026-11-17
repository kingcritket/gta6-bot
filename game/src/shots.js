// Screenshot staging for Port Vela: ?shot=start|play|end (with &seed=N) poses the
// world for one still, so the screenshots are real renders of the game itself.
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { resetWorld } from './world.js';

export function stageShot(name, world) {
  resetWorld(world);
  const sites = world.city.sites;

  if (name === 'start') {
    // Rook on foot at the plaza's edge, looking across the city.
    world.player.x = -34;
    world.player.z = 30;
    world.player.heading = Math.atan2(34, -30);
    return { camYaw: world.player.heading, screen: SCREEN_TITLE };
  }

  if (name === 'end') {
    // Mission 4: the plaza shootout. Rook at the fountain, gang around him.
    world.missionIndex = 3;
    world.mission = { stage: 'fight' };
    world.cash = 3200;
    world.wanted = 2;
    world.player.x = 7;
    world.player.z = 5;
    world.player.heading = Math.atan2(-7, -5);
    world.player.health = 79;
    world.player.ammo = 7;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      world.enemies.push({
        x: Math.sin(a) * 11,
        z: Math.cos(a) * 11,
        hp: 100,
        alive: true,
        shootTimer: 1 + i * 0.3,
      });
    }
    world.marker = { x: sites.plaza.x, z: sites.plaza.z, label: 'Plaza Vela', active: true };
    return { camYaw: world.player.heading, screen: SCREEN_PLAY };
  }

  // 'play' (default): Rook driving south down the avenue, one cop on his tail.
  world.missionIndex = 1;
  world.mission = { stage: 'fetch' };
  world.cash = 500;
  world.wanted = 1;
  world.marker = { x: sites.docks.x, z: sites.docks.z, label: 'Dermaga', active: true };
  const parked = world.cars.find((c) => c.kind === 'parked');
  if (parked) {
    parked.kind = 'player';
    parked.x = 20;
    parked.z = -60;
    parked.heading = 0;
    parked.speed = 14;
    const p = world.player;
    p.inCar = true;
    p.carId = parked.id;
    p.x = parked.x;
    p.z = parked.z;
    p.heading = 0;
    p.speed = 14;
  }
  world.cars.push({
    id: world.cars.length,
    kind: 'police',
    x: 20, z: -25, heading: Math.PI, speed: 13, cruise: 15,
    color: 0xf2f2f2, active: true, target: null,
  });
  return { camYaw: 0, screen: SCREEN_PLAY };
}
