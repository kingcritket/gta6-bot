// Port Vela rendering: a sun-soaked three.js harbour town built from the city's
// layout data. Meshes are built once; draw() only moves them and the camera.
import * as THREE from 'three';
import { CITY_HALF, ROAD_COORDS } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_DONE = 'done';

function facadeTexture(base, variant) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shading so the block reads as one mass.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Window grid, some lit warm.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const lit = (row * 4 + col + variant) % 5 === 0;
      g.fillStyle = lit ? '#ffd98a' : '#20262e';
      g.fillRect(12 + col * 28, 16 + row * 29, 18, 20);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(12 + col * 28, 16 + row * 29, 18, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePersonMesh(shirt, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin || 0xd8a888 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2e35 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.32), shirtMat);
  torso.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skinMat);
  head.position.y = 1.58;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), darkMat);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirtMat);
  armL.position.set(-0.36, 1.0, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;
  group.add(torso, head, legL, legR, armL, armR);
  return group;
}

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.58;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.12, -0.25);
  group.add(body, cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.16, 4.32),
      new THREE.MeshLambertMaterial({ color: 0x1e3a6e }),
    );
    stripe.position.y = 0.72;
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), wheelMat);
    barBase.position.set(0, 1.46, -0.25);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.52),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    red.position.set(-0.28, 1.47, -0.25);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.52),
      new THREE.MeshBasicMaterial({ color: 0x2a6aff }),
    );
    blue.position.set(0.28, 1.47, -0.25);
    group.add(stripe, barBase, red, blue);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  return group;
}

export function createRenderer(canvas, city) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ecfeb);
  scene.fog = new THREE.Fog(0x9ecfeb, 130, 340);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);

  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x51603f, 1.05));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.9);
  sun.position.set(80, 130, 50);
  scene.add(sun);

  // Ground and roads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 60, CITY_HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x7d8a68 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2f3338 });
  for (const c of ROAD_COORDS) {
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2 + 20, 10), roadMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, c);
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(10, CITY_HALF * 2 + 20), roadMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(c, 0.03, 0);
    scene.add(alongX, alongZ);
  }
  // Centre dashes, instanced. The mesh is sized from the positions collected
  // first, so the count can never run past its matrix buffer (a mismatch
  // there draws garbage instances as giant white bands).
  const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 2.4);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  const dashPlacements = [];
  {
    const rotX = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const rotZ = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    const m = new THREE.Matrix4();
    for (const c of ROAD_COORDS) {
      for (let t = -108; t <= 108; t += 6) {
        // Dash on a road running along X: long axis along X.
        m.compose(pos.set(t, 0.05, c), rotX, scl);
        dashPlacements.push(m.clone());
        // Dash on a road running along Z: long axis along Z.
        m.compose(pos.set(c, 0.05, t), rotZ, scl);
        dashPlacements.push(m.clone());
      }
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPlacements.length);
  dashPlacements.forEach((m, i) => dashes.setMatrixAt(i, m));
  scene.add(dashes);

  // Plaza Vela with its fountain.
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(city.plaza.r, 40),
    new THREE.MeshLambertMaterial({ color: 0xb8a888 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.04, 0);
  scene.add(plaza);
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5.5, 1.1, 24),
    new THREE.MeshLambertMaterial({ color: 0x9a938a }),
  );
  basin.position.set(0, 0.55, 0);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(4.4, 24),
    new THREE.MeshLambertMaterial({ color: 0x3f8fbf }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.02, 0);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 2.6, 12),
    new THREE.MeshLambertMaterial({ color: 0xcfc4ae }),
  );
  column.position.set(0, 2.2, 0);
  scene.add(basin, water, column);

  // Buildings with procedural facades.
  const facadeMats = [0xc9a37e, 0x9fb4c7, 0xb98a7a, 0x8fa38a].map((base, v) => {
    const hex = `#${base.toString(16).padStart(6, '0')}`;
    return new THREE.MeshLambertMaterial({ map: facadeTexture(hex, v) });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  for (const b of city.buildings) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), facadeMats[b.variant]);
    mesh.position.set(b.x, b.h / 2, b.z);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.5, b.d + 0.4), roofMat);
    roof.position.set(b.x, b.h + 0.25, b.z);
    scene.add(mesh, roof);
  }

  // Trees and lamps, instanced.
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.7, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2f });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.trees.length);
  const leafGeo = new THREE.ConeGeometry(1.7, 3.6, 8);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3f });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, city.trees.length);
  {
    const m = new THREE.Matrix4();
    city.trees.forEach((t, i) => {
      m.makeTranslation(t.x, 0.85, t.z);
      trunks.setMatrixAt(i, m);
      m.makeTranslation(t.x, 3.2, t.z);
      leaves.setMatrixAt(i, m);
    });
  }
  scene.add(trunks, leaves);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 4.6, 8);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
  const bulbGeo = new THREE.SphereGeometry(0.3, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, city.lamps.length);
  {
    const m = new THREE.Matrix4();
    city.lamps.forEach((l, i) => {
      m.makeTranslation(l.x, 2.3, l.z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(l.x, 4.7, l.z);
      bulbs.setMatrixAt(i, m);
    });
  }
  scene.add(poles, bulbs);

  // Marker beam + ground ring + a small floating diamond above the marker.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 16, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.2,
      side: THREE.FrontSide, depthWrite: false,
    }),
  );
  beam.position.y = 8;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.2, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
  );
  scene.add(beam, ring, diamond);

  // Dynamic meshes, one per entity, created lazily.
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const enemyMeshes = new Map();
  const playerMesh = makePersonMesh(0x2f6f6a);
  scene.add(playerMesh);

  function syncCar(car) {
    let mesh = carMeshes.get(car.id);
    if (!mesh) {
      mesh = makeCarMesh(car.color, car.kind === 'police');
      carMeshes.set(car.id, mesh);
      scene.add(mesh);
    }
    mesh.visible = car.active;
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
  }

  function syncPed(ped, index) {
    let mesh = pedMeshes.get(index);
    if (!mesh) {
      mesh = makePersonMesh(ped.shirt);
      pedMeshes.set(index, mesh);
      scene.add(mesh);
    }
    mesh.visible = ped.alive;
    if (ped.alive) {
      mesh.position.set(ped.x, 0, ped.z);
      mesh.rotation.y = ped.heading;
      mesh.rotation.x = 0;
    } else {
      mesh.position.set(ped.x, 0.35, ped.z);
      mesh.rotation.x = Math.PI / 2;
    }
  }

  function syncEnemy(e, index, player) {
    let mesh = enemyMeshes.get(index);
    if (!mesh) {
      mesh = makePersonMesh(0xa32f2f);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.7),
        new THREE.MeshLambertMaterial({ color: 0x14161a }),
      );
      gun.position.set(0.4, 1.1, 0.4);
      mesh.add(gun);
      enemyMeshes.set(index, mesh);
      scene.add(mesh);
    }
    mesh.visible = e.alive;
    mesh.position.set(e.x, 0, e.z);
    // Face the player, gun toward them.
    mesh.rotation.y = Math.atan2(player.x - e.x, player.z - e.z);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  return {
    draw(world, camYaw, screen, camDist, now) {
      resize();
      const p = world.player;
      for (const car of world.cars) syncCar(car);
      world.peds.forEach((ped, i) => syncPed(ped, i));
      world.enemies.forEach((e, i) => syncEnemy(e, i, p));
      if (p.inCar) {
        playerMesh.visible = false;
      } else {
        playerMesh.visible = true;
        playerMesh.position.set(p.x, 0, p.z);
        playerMesh.rotation.y = p.heading;
      }
      if (world.marker.active) {
        beam.visible = true;
        ring.visible = true;
        diamond.visible = true;
        beam.position.x = world.marker.x;
        beam.position.z = world.marker.z;
        ring.position.x = world.marker.x;
        ring.position.z = world.marker.z;
        diamond.position.set(world.marker.x, 3 + Math.sin(now * 2) * 0.35, world.marker.z);
        diamond.rotation.y = now * 1.2;
        beam.material.opacity = 0.16 + 0.06 * Math.sin(now * 3);
      } else {
        beam.visible = false;
        ring.visible = false;
        diamond.visible = false;
      }

      if (screen === SCREEN_TITLE) {
        // High slow orbit above the rooftops, so no facade fills the frame.
        const a = now * 0.05;
        camera.position.set(Math.sin(a) * 78, 40, Math.cos(a) * 78);
        camera.lookAt(0, 4, 0);
      } else {
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        const dist = camDist || 10;
        camera.position.set(p.x - fx * dist, dist * 0.55 + 2.2, p.z - fz * dist);
        camera.lookAt(p.x + fx * 3, 1.7, p.z + fz * 3);
      }
      renderer.render(scene, camera);
    },
  };
}
