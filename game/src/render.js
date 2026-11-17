// Port Vela — the renderer. Builds the three.js scene once from the city's
// layout data, then each frame only moves the dynamic meshes to match the
// sim's state. No game rules live here.
import * as THREE from 'three';
import { CAMERA, CITY_HALF, EV, STREETS } from './config.js';

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#20262e';
  for (let y = 14; y < 246; y += 26) {
    for (let x = 12; x < 118; x += 24) {
      g.fillRect(x, y, 14, 16);
    }
  }
  g.fillStyle = 'rgba(255, 214, 120, 0.85)';
  for (let i = 0; i < 12; i++) {
    const x = 12 + Math.floor(Math.random() * 5) * 24;
    const y = 14 + Math.floor(Math.random() * 9) * 26;
    g.fillRect(x, y, 14, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(city) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const m = S / (CITY_HALF * 2 + 20); // px per metre, city + margin
  const toPx = (v) => (v + CITY_HALF + 10) * m;
  g.fillStyle = '#b5a88f';
  g.fillRect(0, 0, S, S);
  // Sidewalk tint around roads.
  g.fillStyle = '#c9bda6';
  for (const s of STREETS) {
    g.fillRect(0, toPx(s) - 7.5 * m, S, 15 * m);
    g.fillRect(toPx(s) - 7.5 * m, 0, 15 * m, S);
  }
  // Road surface.
  g.fillStyle = '#3c4148';
  for (const s of STREETS) {
    g.fillRect(0, toPx(s) - 5 * m, S, 10 * m);
    g.fillRect(toPx(s) - 5 * m, 0, 10 * m, S);
  }
  // Centre dashes.
  g.fillStyle = '#e8e4d2';
  for (const s of STREETS) {
    for (let t = -115; t < 115; t += 8) {
      g.fillRect(toPx(t) - 1.5 * m, toPx(s) - 0.25 * m, 3 * m, 0.5 * m);
      g.fillRect(toPx(s) - 0.25 * m, toPx(t) - 1.5 * m, 0.5 * m, 3 * m);
    }
  }
  // Plaza.
  g.fillStyle = '#d8cbb2';
  g.beginPath();
  g.arc(toPx(0), toPx(0), 15 * m, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8a7f6a';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(toPx(0), toPx(0), 15 * m, 0, Math.PI * 2);
  g.stroke();
  // Docks: wooden boards at the south edge.
  g.fillStyle = '#8a6f4d';
  g.fillRect(toPx(city.docks.x - city.docks.w / 2), toPx(city.docks.z - city.docks.d / 2), city.docks.w * m, city.docks.d * m);
  g.fillStyle = '#5d7f9e';
  g.fillRect(toPx(city.docks.x - city.docks.w / 2), toPx(city.docks.z + city.docks.d / 2), city.docks.w * m, 6 * m);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeFigure(jacket, skin = '#e8b98a') {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: jacket });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), new THREE.MeshLambertMaterial({ color: '#2c3240' }));
  legs.position.y = 0.25;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), mat);
  torso.position.y = 0.81;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.32;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: '#1a1d22' }));
  gun.position.set(0.2, 0.95, 0.3);
  gun.visible = false;
  g.add(legs, torso, head, gun);
  g.userData.gun = gun;
  return g;
}

function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.55, 2.1),
    new THREE.MeshLambertMaterial({ color: isPolice ? '#22262c' : '#20262e' }),
  );
  cabin.position.set(0, 1.1, -0.25);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#14161a' });
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: '#fff6c0', emissive: '#ffedb0', emissiveIntensity: 0.7 });
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    hl.position.set(x, 0.62, 2.16);
    g.add(hl);
  }
  let barRed = null;
  let barBlue = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: '#111318' }));
    bar.position.set(0, 1.45, -0.25);
    barRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.32),
      new THREE.MeshLambertMaterial({ color: '#ff2a2a', emissive: '#ff2020', emissiveIntensity: 1 }),
    );
    barRed.position.set(-0.28, 1.5, -0.25);
    barBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.32),
      new THREE.MeshLambertMaterial({ color: '#2a6bff', emissive: '#2050ff', emissiveIntensity: 1 }),
    );
    barBlue.position.set(0.28, 1.5, -0.25);
    g.add(bar, barRed, barBlue);
  }
  g.userData.wheels = wheels;
  g.userData.barRed = barRed;
  g.userData.barBlue = barBlue;
  return g;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87b5d9');
  scene.fog = new THREE.Fog('#a8c4dc', 160, 320);
  const hemi = new THREE.HemisphereLight('#fff2d8', '#5a6b52', 0.9);
  const sun = new THREE.DirectionalLight('#ffe8b8', 1.6);
  sun.position.set(80, 120, 40);
  scene.add(hemi, sun);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
  const camPos = new THREE.Vector3(0, 40, 80);
  let builtCity = null;

  const dyn = {
    cars: new Map(),
    peds: new Map(),
    enemies: new Map(),
    player: null,
    beam: null,
    diamond: null,
    flash: null,
    water: null,
  };

  function buildStatic(city) {
    builtCity = city;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 20, CITY_HALF * 2 + 20),
      new THREE.MeshLambertMaterial({ map: groundTexture(city) }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const winTex = windowTexture();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const b of city.buildings) {
      const mat = new THREE.MeshLambertMaterial({ map: winTex, color: b.tint });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(b.x, b.h / 2, b.z);
      scene.add(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.4, 0.5, b.d + 0.4),
        new THREE.MeshLambertMaterial({ color: '#4a4640' }),
      );
      roof.position.set(b.x, b.h + 0.25, b.z);
      scene.add(roof);
    }

    // Fountain: basin ring + water disc.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5.4, 1.1, 24),
      new THREE.MeshLambertMaterial({ color: '#9a938a' }),
    );
    basin.position.set(0, 0.55, 0);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.4, 0.2, 24),
      new THREE.MeshLambertMaterial({ color: '#4fa3d8', transparent: true, opacity: 0.85 }),
    );
    water.position.set(0, 1.05, 0);
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.8, 2.2, 12),
      new THREE.MeshLambertMaterial({ color: '#b0a894' }),
    );
    spout.position.set(0, 1.6, 0);
    scene.add(basin, water, spout);
    dyn.water = water;

    // Trees: instanced trunks + foliage.
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a2f' });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.trees.length);
    const leafGeo = new THREE.ConeGeometry(1.5, 3.4, 8);
    const leafMat = new THREE.MeshLambertMaterial({ color: '#3e7d3a' });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, city.trees.length);
    const m4 = new THREE.Matrix4();
    city.trees.forEach((t, i) => {
      m4.makeScale(t.s, t.s, t.s);
      m4.setPosition(t.x, 0.8 * t.s, t.z);
      trunks.setMatrixAt(i, m4);
      m4.makeScale(t.s, t.s, t.s);
      m4.setPosition(t.x, (1.6 + 1.7) * t.s, t.z);
      leaves.setMatrixAt(i, m4);
    });
    scene.add(trunks, leaves);

    // Lamps.
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: '#2e3138' });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
    const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: '#fff2b0', emissive: '#ffdf80', emissiveIntensity: 0.9 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, city.lamps.length);
    city.lamps.forEach((l, i) => {
      m4.identity();
      m4.setPosition(l.x, 2.3, l.z);
      poles.setMatrixAt(i, m4);
      m4.setPosition(l.x, 4.7, l.z);
      heads.setMatrixAt(i, m4);
    });
    scene.add(poles, heads);

    // Mission marker: light beam + floating diamond.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd94d', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 8;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85),
      new THREE.MeshBasicMaterial({ color: '#ffd94d' }),
    );
    diamond.position.y = 5;
    scene.add(beam, diamond);
    dyn.beam = beam;
    dyn.diamond = diamond;

    // Muzzle flash.
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe27a' }),
    );
    flash.visible = false;
    scene.add(flash);
    dyn.flash = flash;

    // Player figure.
    dyn.player = makeFigure('#1abc9c');
    scene.add(dyn.player);
  }

  function carMesh(car) {
    let g = dyn.cars.get(car.id);
    if (!g) {
      g = makeCarMesh(car.color, car.kind === 'police');
      scene.add(g);
      dyn.cars.set(car.id, g);
    }
    return g;
  }

  function figureMesh(map, key, jacket) {
    let g = map.get(key);
    if (!g) {
      g = makeFigure(jacket);
      scene.add(g);
      map.set(key, g);
    }
    return g;
  }

  function draw(state, camYaw, screen, camDist, time) {
    if (!builtCity) buildStatic(state.city);
    const p = state.player;

    // Player figure (hidden while driving).
    const fig = dyn.player;
    fig.visible = !p.inCar;
    if (p.inCar) {
      fig.position.set(p.x, 0, p.z);
      fig.rotation.y = p.heading;
    } else {
      fig.position.set(p.x, 0, p.z);
      fig.rotation.y = p.heading;
      const bob = p.speed > 0.5 ? Math.sin(time * 11) * 0.05 : 0;
      fig.position.y = bob;
    }

    // Cars.
    const seenCars = new Set();
    for (const car of state.cars) {
      if (!car.active) continue;
      seenCars.add(car.id);
      const g = carMesh(car);
      g.position.set(car.x, 0, car.z);
      g.rotation.y = car.heading;
      for (const w of g.userData.wheels) w.rotation.x += (car.speed || 0) * 0.016;
      if (car.kind === 'police') {
        const phase = Math.floor(time * 4) % 2 === 0;
        if (g.userData.barRed) g.userData.barRed.material.emissiveIntensity = phase ? 2.2 : 0.15;
        if (g.userData.barBlue) g.userData.barBlue.material.emissiveIntensity = phase ? 0.15 : 2.2;
      }
    }
    for (const [id, g] of dyn.cars) {
      if (!seenCars.has(id)) {
        scene.remove(g);
        dyn.cars.delete(id);
      }
    }

    // Pedestrians.
    state.peds.forEach((ped, i) => {
      const g = figureMesh(dyn.peds, i, ped.color);
      g.visible = !ped.down || true;
      g.position.set(ped.x, ped.down ? 0.25 : 0, ped.z);
      g.rotation.y = ped.heading;
      if (ped.down) g.rotation.x = Math.PI / 2;
      else g.rotation.x = 0;
    });

    // Enemies.
    state.enemies.forEach((e, i) => {
      const g = figureMesh(dyn.enemies, i, '#c0392b');
      g.position.set(e.x, e.alive ? 0 : 0.25, e.z);
      g.rotation.y = e.heading;
      g.rotation.x = e.alive ? 0 : Math.PI / 2;
      g.userData.gun.visible = e.alive;
    });

    // Marker.
    const m = state.marker;
    dyn.beam.visible = m.active;
    dyn.diamond.visible = m.active;
    if (m.active) {
      dyn.beam.position.set(m.x, 8, m.z);
      dyn.beam.material.opacity = 0.16 + Math.sin(time * 3) * 0.06;
      dyn.diamond.position.set(m.x, 5 + Math.sin(time * 2.4) * 0.5, m.z);
      dyn.diamond.rotation.y = time * 1.6;
    }

    // Muzzle flash.
    if (state.events & EV.SHOT) {
      const dir = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
      dyn.flash.position.set(p.x + dir.x * 1.1, 1.1, p.z + dir.z * 1.1);
      dyn.flash.visible = true;
      dyn.flash.userData.until = time + 0.06;
    } else if (dyn.flash.visible && time > (dyn.flash.userData.until || 0)) {
      dyn.flash.visible = false;
    }

    // Water shimmer.
    if (dyn.water) dyn.water.position.y = 1.05 + Math.sin(time * 1.8) * 0.04;

    // Camera.
    if (screen === 'title') {
      const a = time * 0.07;
      camera.position.set(Math.cos(a) * 62, 34, Math.sin(a) * 62);
      camera.lookAt(0, 2, 0);
    } else {
      const dist = CAMERA.dist * camDist;
      const back = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
      const tx = p.x - back.x * dist;
      const tz = p.z - back.z * dist;
      const ty = CAMERA.height * (0.7 + camDist * 0.35);
      camPos.x += (tx - camPos.x) * 0.12;
      camPos.y += (ty - camPos.y) * 0.12;
      camPos.z += (tz - camPos.z) * 0.12;
      camera.position.copy(camPos);
      camera.lookAt(p.x + back.x * 4, 1.6, p.z + back.z * 4);
    }

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

export { SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_WASTED, SCREEN_DONE } from './config.js';
