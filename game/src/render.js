// Drawing only: the three.js scene for Port Vela — city, cars, people, marker —
// plus the third-person camera. No rules in here; it paints whatever the world
// state holds.
import * as THREE from 'three';
import { CAMERA, CITY, PALETTE, ROADS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_DONE = 'done';

/** A small canvas texture of lit/unlit windows, shared by every building. */
function windowTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      ctx.fillStyle = rnd() < 0.35 ? '#ffd27a' : '#2c3844';
      ctx.fillRect(8 + col * 24, 10 + row * 24, 14, 15);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCarMesh(color, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.2, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.15, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const [x, z] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
  }
  if (police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.18, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 }),
    );
    bar.position.set(0, 1.55, -0.2);
    group.add(bar);
    const lampGeo = new THREE.BoxGeometry(0.6, 0.2, 0.52);
    const lightL = new THREE.Mesh(
      lampGeo,
      new THREE.MeshStandardMaterial({ color: PALETTE.policeRed, emissive: PALETTE.policeRed, emissiveIntensity: 1 }),
    );
    lightL.position.set(-0.35, 1.56, -0.2);
    group.add(lightL);
    const lightR = new THREE.Mesh(
      lampGeo,
      new THREE.MeshStandardMaterial({ color: PALETTE.policeBlue, emissive: PALETTE.policeBlue, emissiveIntensity: 1 }),
    );
    lightR.position.set(0.35, 1.56, -0.2);
    group.add(lightR);
    group.userData.lights = [lightL, lightR];
  }
  return group;
}

function buildPersonMesh(shirtColor) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 1.0, 10),
    new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 }),
  );
  torso.position.y = 0.9;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 }),
  );
  head.position.y = 1.62;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.45, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 }),
  );
  legs.position.y = 0.22;
  group.add(legs);
  return group;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 90, 260);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3f46, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.6);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(sun.target);

  // Ground plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 40, CITY.half * 2 + 40),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads (dark strips) with centre dashes, in both directions.
  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 1 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8c95a, roughness: 0.8 });
  for (const c of ROADS) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, 12), roadMat);
      strip.rotation.x = -Math.PI / 2;
      if (horizontal) strip.rotation.z = Math.PI / 2;
      strip.position.set(horizontal ? 0 : c, 0.02, horizontal ? c : 0);
      strip.receiveShadow = true;
      scene.add(strip);
      for (let p = -110; p <= 110; p += 10) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (horizontal) dash.rotation.z = Math.PI / 2;
        dash.position.set(horizontal ? p : c, 0.03, horizontal ? c : p);
        scene.add(dash);
      }
    }
  }

  // Sidewalks: lighter squares on each block.
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  for (let bx = -88; bx <= 88; bx += 44) {
    for (let bz = -88; bz <= 88; bz += 44) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(bx, 0.015, bz);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  // Plaza Vela: open square with a fountain at the centre.
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 0.5, 24),
    new THREE.MeshStandardMaterial({ color: 0x7fb3d5, roughness: 0.3 }),
  );
  basin.position.set(0, 0.25, 0);
  scene.add(basin);
  const jet = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xaee2ff, roughness: 0.2, transparent: true, opacity: 0.7 }),
  );
  jet.position.set(0, 1.6, 0);
  scene.add(jet);

  // Mission marker: a beam of light plus a ring on the ground.
  const markerBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  markerBeam.position.y = 15;
  scene.add(markerBeam);
  const markerRing = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.position.y = 0.06;
  scene.add(markerRing);

  const windowTextures = [windowTexture(11), windowTexture(47), windowTexture(123)];
  const staticMeshes = [];
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const enemyMeshes = new Map();
  let playerMesh = null;

  function syncCar(car) {
    let mesh = carMeshes.get(car);
    if (!mesh) {
      mesh = buildCarMesh(car.color, car.police);
      mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      scene.add(mesh);
      carMeshes.set(car, mesh);
    }
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
    if (car.police && mesh.userData.lights) {
      const phase = Math.floor(performance.now() / 260) % 2 === 0;
      mesh.userData.lights[0].material.emissiveIntensity = phase ? 2.2 : 0.15;
      mesh.userData.lights[1].material.emissiveIntensity = phase ? 0.15 : 2.2;
    }
    return mesh;
  }

  function syncPerson(map, obj, shirtColor) {
    let mesh = map.get(obj);
    if (!mesh) {
      mesh = buildPersonMesh(shirtColor);
      mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      scene.add(mesh);
      map.set(obj, mesh);
    }
    mesh.position.set(obj.x, 0, obj.z);
    mesh.rotation.y = obj.heading;
    if (obj.down) {
      // A downed ped lies flat on the ground.
      mesh.visible = true;
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.3;
    } else {
      mesh.visible = obj.alive !== false;
      mesh.rotation.x = 0;
      mesh.position.y = 0;
    }
    return mesh;
  }

  function buildStatic(state) {
    for (const mesh of staticMeshes) scene.remove(mesh);
    staticMeshes.length = 0;
    for (const b of state.buildings) {
      const tex = windowTextures[Math.abs(b.texSeed) % windowTextures.length];
      const mat = new THREE.MeshStandardMaterial({ color: b.color, map: tex, roughness: 0.9 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      staticMeshes.push(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.6, 0.4, b.d + 0.6),
        new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 1 }),
      );
      roof.position.set(b.x, b.h + 0.2, b.z);
      scene.add(roof);
      staticMeshes.push(roof);
    }
    for (const t of state.trees) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.25, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
      );
      trunk.position.set(t.x, 0.8, t.z);
      trunk.castShadow = true;
      scene.add(trunk);
      staticMeshes.push(trunk);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 1 }),
      );
      top.position.set(t.x, 3.0, t.z);
      top.castShadow = true;
      scene.add(top);
      staticMeshes.push(top);
    }
    for (const l of state.lamps) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8 }),
      );
      pole.position.set(l.x, 2.7, l.z);
      scene.add(pole);
      staticMeshes.push(pole);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd27a, emissiveIntensity: 0.9 }),
      );
      bulb.position.set(l.x, 5.5, l.z);
      scene.add(bulb);
      staticMeshes.push(bulb);
    }
  }

  function draw(state, camYaw, screen, camDist) {
    if (staticMeshes.length === 0) buildStatic(state);
    const p = state.player;
    if (!playerMesh) {
      playerMesh = buildPersonMesh(PALETTE.playerShirt);
      playerMesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      scene.add(playerMesh);
    }
    playerMesh.visible = !p.inCar;
    if (!p.inCar) {
      playerMesh.position.set(p.x, 0, p.z);
      playerMesh.rotation.y = p.heading;
    }
    for (const car of state.cars) if (car.active) syncCar(car);
    for (const cop of state.police) syncCar(cop);
    for (const ped of state.peds) syncPerson(pedMeshes, ped, ped.color);
    for (const e of state.enemies) syncPerson(enemyMeshes, e, e.color);

    markerBeam.visible = state.marker.active;
    markerRing.visible = state.marker.active;
    if (state.marker.active) {
      markerBeam.position.x = state.marker.x;
      markerBeam.position.z = state.marker.z;
      markerRing.position.x = state.marker.x;
      markerRing.position.z = state.marker.z;
      const pulse = 1 + Math.sin(performance.now() / 280) * 0.12;
      markerRing.scale.set(pulse, pulse, 1);
      markerBeam.material.opacity = 0.22 + Math.sin(performance.now() / 280) * 0.08;
    }

    // Third-person camera (distance scaled by the mouse-wheel zoom).
    const zoom = camDist ?? 1;
    const dist = (p.inCar ? CAMERA.carDist : CAMERA.footDist) * zoom;
    const height = (p.inCar ? CAMERA.carHeight : CAMERA.footHeight) * zoom;
    const cx = p.x - Math.sin(camYaw) * dist;
    const cz = p.z - Math.cos(camYaw) * dist;
    camera.position.set(cx, height, cz);
    camera.lookAt(p.x + Math.sin(camYaw) * 4, 1.4, p.z + Math.cos(camYaw) * 4);
    sun.position.set(p.x + 80, 120, p.z + 40);
    sun.target.position.set(p.x, 0, p.z);
    sun.target.updateMatrixWorld();

    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return { draw, resize };
}
