// Port Vela — the renderer. Builds the three.js scene once from the city's
// layout data, then each frame only moves the dynamic meshes to match the
// sim's state. No game rules live here.
import * as THREE from 'three';
import { CAMERA, CITY_HALF, EV, STREETS } from './config.js';

// Deterministic decoration rng: the city seed drives it, so the same seed
// always builds the same skyline, clouds and rooftops.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  // The background is screen-space, so the warm band sits where the
  // horizon falls on screen (~half height) instead of at the texture's
  // bottom, where the ground would hide it.
  grad.addColorStop(0, '#4f8fc4');
  grad.addColorStop(0.35, '#8fc0e4');
  grad.addColorStop(0.48, '#ffd9a3');
  grad.addColorStop(0.55, '#ffcf9a');
  grad.addColorStop(1, '#ffcf9a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 244, 200, 0.9)');
  grad.addColorStop(0.4, 'rgba(255, 220, 150, 0.35)');
  grad.addColorStop(1, 'rgba(255, 220, 150, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function strobeTexture(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// White POLICE lettering for the rear window: the face the chase camera
// sees most. Transparent background so the dark cabin shows through.
function policePlateTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = '#ffffff';
  g.font = '900 42px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('POLICE', 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(lit, seed) {
  const rng = mulberry32(seed);
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
  for (let i = 0; i < lit; i++) {
    const x = 12 + Math.floor(rng() * 5) * 24;
    const y = 14 + Math.floor(rng() * 9) * 26;
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
  // Road edge lines.
  g.fillStyle = 'rgba(232, 228, 210, 0.55)';
  for (const s of STREETS) {
    g.fillRect(0, toPx(s + 4.7) - 0.12 * m, S, 0.24 * m);
    g.fillRect(0, toPx(s - 4.7) - 0.12 * m, S, 0.24 * m);
    g.fillRect(toPx(s + 4.7) - 0.12 * m, 0, 0.24 * m, S);
    g.fillRect(toPx(s - 4.7) - 0.12 * m, 0, 0.24 * m, S);
  }
  // Zebra crossings at every intersection: bars parallel to traffic, one
  // crossing on each approach.
  g.fillStyle = '#e8e4d2';
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      for (const dx of [-1, 1]) {
        for (let k = -4; k <= 4; k++) {
          g.fillRect(toPx(sx + dx * 6.6) - 1.6 * m, toPx(sz + k * 1.05) - 0.28 * m, 3.2 * m, 0.56 * m);
          g.fillRect(toPx(sx + k * 1.05) - 0.28 * m, toPx(sz + dx * 6.6) - 1.6 * m, 0.56 * m, 3.2 * m);
        }
      }
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
  // Plaza paving: concentric rings and radial joints, so the big open
  // circle reads as a designed square instead of empty beige.
  g.strokeStyle = 'rgba(138, 127, 106, 0.55)';
  g.lineWidth = 1.5;
  for (const r of [5, 10, 13]) {
    g.beginPath();
    g.arc(toPx(0), toPx(0), r * m, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(toPx(Math.cos(a) * 5), toPx(Math.sin(a) * 5));
    g.lineTo(toPx(Math.cos(a) * 15), toPx(Math.sin(a) * 15));
    g.stroke();
  }
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
  // Taillights: the chase camera looks at the rear of the car more than
  // anything else, so the back gets its own glow.
  const tailMat = new THREE.MeshLambertMaterial({ color: '#ff2a2a', emissive: '#c01010', emissiveIntensity: 0.8 });
  for (const x of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(x, 0.62, -2.16);
    g.add(tl);
  }
  // Taxi sign on yellow cabs.
  if (color === '#f1c40f') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.28),
      new THREE.MeshLambertMaterial({ color: '#222222', emissive: '#ffd94d', emissiveIntensity: 0.9 }),
    );
    sign.position.set(0, 1.48, -0.25);
    g.add(sign);
  }
  let barRed = null;
  let barBlue = null;
  let glowRed = null;
  let glowBlue = null;
  let pool = null;
  if (isPolice) {
    // Black band around the body: the black-and-white patrol-car paint.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(1.96, 0.2, 4.34),
      new THREE.MeshLambertMaterial({ color: '#15181d' }),
    );
    band.position.set(0, 0.58, 0);
    g.add(band);
    // POLICE lettering on the cabin's rear face (the chase camera's view).
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshBasicMaterial({ map: policePlateTexture(), transparent: true }),
    );
    plate.position.set(0, 1.1, -1.32);
    plate.rotation.y = Math.PI;
    g.add(plate);
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
    // Strobe halos: camera-facing sprites, so the flash reads from any
    // angle and any distance instead of a 4-pixel light bar.
    const mkGlow = (color, x) => {
      const m = new THREE.SpriteMaterial({
        map: strobeTexture(color), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Sprite(m);
      s.scale.set(3.0, 3.0, 1);
      s.position.set(x, 1.6, -0.25);
      return s;
    };
    glowRed = mkGlow('#ff2a2a', -0.28);
    glowBlue = mkGlow('#2a6bff', 0.28);
    g.add(glowRed, glowBlue);
    // A pool of coloured light on the road under the car.
    pool = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 24),
      new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.05;
    g.add(pool);
  }
  g.userData.wheels = wheels;
  g.userData.barRed = barRed;
  g.userData.barBlue = barBlue;
  g.userData.glowRed = glowRed;
  g.userData.glowBlue = glowBlue;
  g.userData.pool = pool;
  return g;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Sun-soaked sky: blue zenith melting into a warm golden horizon.
  scene.background = skyTexture();
  scene.fog = new THREE.Fog('#dcc7a4', 170, 340);
  const hemi = new THREE.HemisphereLight('#fff2d8', '#5a6b52', 0.95);
  // Low sun in the east: it lights the faces the title camera (looking
  // west from the east side) and the chase camera (looking north) see.
  const sun = new THREE.DirectionalLight('#ffe3b0', 1.7);
  sun.position.set(140, 55, 70);
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
    beacon: null,
    clouds: null,
  };

  function buildStatic(city) {
    builtCity = city;
    const m4 = new THREE.Matrix4();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 20, CITY_HALF * 2 + 20),
      new THREE.MeshLambertMaterial({ map: groundTexture(city) }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const srng = mulberry32(city.seed ^ 0x51ab);
    const winTexes = [windowTexture(8, 101), windowTexture(16, 202), windowTexture(26, 303)];
    const ROOFS = ['#4a4640', '#5d4a3a', '#3f4a3f', '#6b5a4a', '#54423a', '#46525e'];
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const acSpots = [];
    const towerSpots = [];
    let tallest = null;
    for (let bi = 0; bi < city.buildings.length; bi++) {
      const b = city.buildings[bi];
      const mat = new THREE.MeshLambertMaterial({ map: winTexes[bi % 3], color: b.tint });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(b.w, b.h, b.d);
      mesh.position.set(b.x, b.h / 2, b.z);
      scene.add(mesh);
      // Roofs vary in colour instead of one flat brown slab.
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.4, 0.5, b.d + 0.4),
        new THREE.MeshLambertMaterial({ color: ROOFS[bi % ROOFS.length] }),
      );
      roof.position.set(b.x, b.h + 0.25, b.z);
      scene.add(roof);
      // Rooftop clutter: AC boxes on most roofs, water towers on the tall ones.
      const nAc = 1 + Math.floor(srng() * 3);
      for (let k = 0; k < nAc; k++) {
        acSpots.push({
          x: b.x + (srng() - 0.5) * (b.w - 3),
          z: b.z + (srng() - 0.5) * (b.d - 3),
          y: b.h + 0.7,
          s: 0.9 + srng() * 0.7,
        });
      }
      if (b.h >= 22) towerSpots.push({ x: b.x + b.w * 0.22, z: b.z + b.d * 0.22, y: b.h });
      if (!tallest || b.h > tallest.h) tallest = b;
    }
    const acGeo = new THREE.BoxGeometry(1.4, 0.9, 1.4);
    const acs = new THREE.InstancedMesh(acGeo, new THREE.MeshLambertMaterial({ color: '#8a8f96' }), acSpots.length);
    acSpots.forEach((a, i) => {
      m4.makeScale(a.s, 1, a.s);
      m4.setPosition(a.x, a.y, a.z);
      acs.setMatrixAt(i, m4);
    });
    scene.add(acs);
    const tankGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10);
    const tanks = new THREE.InstancedMesh(tankGeo, new THREE.MeshLambertMaterial({ color: '#7a5c3e' }), towerSpots.length);
    const coneGeo = new THREE.ConeGeometry(1.35, 1.1, 10);
    const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: '#5d4630' }), towerSpots.length);
    towerSpots.forEach((t, i) => {
      m4.identity();
      m4.setPosition(t.x, t.y + 1.6, t.z);
      tanks.setMatrixAt(i, m4);
      m4.setPosition(t.x, t.y + 3.2, t.z);
      cones.setMatrixAt(i, m4);
    });
    scene.add(tanks, cones);
    // Spire + blinking beacon on the tallest tower: the Vela Tower landmark.
    if (tallest) {
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.22, 9, 8),
        new THREE.MeshLambertMaterial({ color: '#2e3138' }),
      );
      spire.position.set(tallest.x, tallest.h + 4.5, tallest.z);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshLambertMaterial({ color: '#ff2a2a', emissive: '#ff2020', emissiveIntensity: 1.5 }),
      );
      beacon.position.set(tallest.x, tallest.h + 9.2, tallest.z);
      scene.add(spire, beacon);
      dyn.beacon = beacon;
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
    const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: '#fff2b0', emissive: '#ffdf80', emissiveIntensity: 0.6 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, city.lamps.length);
    city.lamps.forEach((l, i) => {
      m4.identity();
      m4.setPosition(l.x, 2.3, l.z);
      poles.setMatrixAt(i, m4);
      m4.setPosition(l.x, 4.7, l.z);
      heads.setMatrixAt(i, m4);
    });
    scene.add(poles, heads);

    // Sun disc + glow, low in the east: the golden-hour light source.
    const sunDir = new THREE.Vector3(140, 55, 70).normalize();
    const sunPos = sunDir.clone().multiplyScalar(380);
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false }),
    );
    sunDisc.position.copy(sunPos);
    sunDisc.lookAt(0, 0, 0);
    const sunGlow = new THREE.Mesh(
      new THREE.CircleGeometry(58, 24),
      new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    sunGlow.position.copy(sunPos);
    sunGlow.lookAt(0, 0, 0);
    scene.add(sunDisc, sunGlow);

    // Clouds: flattened white puffs in one instanced mesh, drifting slowly
    // around the city as a group.
    const cloudSpots = [];
    for (let i = 0; i < 12; i++) {
      const cx = (srng() - 0.5) * 320;
      const cz = (srng() - 0.5) * 320;
      const cy = 55 + srng() * 25;
      const puffs = 2 + Math.floor(srng() * 3);
      for (let k = 0; k < puffs; k++) {
        cloudSpots.push({
          x: cx + (srng() - 0.5) * 10,
          y: cy + (srng() - 0.5) * 2,
          z: cz + (srng() - 0.5) * 5,
          s: 4 + srng() * 5,
        });
      }
    }
    const cloudGroup = new THREE.Group();
    // Unlit white: Lambert-shaded clouds read as grey blobs from below.
    const clouds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }),
      cloudSpots.length,
    );
    cloudSpots.forEach((c, i) => {
      m4.makeScale(c.s, c.s * 0.42, c.s * 0.7);
      m4.setPosition(c.x, c.y, c.z);
      clouds.setMatrixAt(i, m4);
    });
    cloudGroup.add(clouds);
    scene.add(cloudGroup);
    dyn.clouds = cloudGroup;

    // Distant skyline: hazy silhouettes beyond the city edge so the horizon
    // reads as a bigger city, not empty fog. Far, short and pale: too close
    // or too tall and they read as grey walls blocking the view.
    const skyMat = new THREE.MeshLambertMaterial({ color: '#b3c3d4' });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + srng() * 0.15;
      const r = 220 + srng() * 60;
      const w = 14 + srng() * 18;
      const h = 12 + srng() * 22;
      const d = 14 + srng() * 18;
      const m = new THREE.Mesh(boxGeo, skyMat);
      m.scale.set(w, h, d);
      m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
      scene.add(m);
    }

    // Traffic lights at every intersection corner: pole, head box and three
    // lamps, one lit (green or red, alternating by corner).
    const tlPoles = [];
    const tlHeads = [];
    const tlDots = [];
    for (const sx of STREETS) {
      for (const sz of STREETS) {
        const px = sx + 7.2;
        const pz = sz + 7.2;
        tlPoles.push({ x: px, z: pz });
        tlHeads.push({ x: px, z: pz });
        const lit = (Math.round(sx + sz) % 2 === 0) ? 2 : 0;
        const lampY = [3.3, 2.95, 2.6];
        const lampC = ['#ff2a2a', '#ffb020', '#2aff5a'];
        for (let k = 0; k < 3; k++) {
          tlDots.push({ x: px, y: lampY[k], z: pz, color: k === lit ? lampC[k] : '#3a3f45', bright: k === lit });
        }
      }
    }
    const tlPoleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6);
    const tlPoleMesh = new THREE.InstancedMesh(tlPoleGeo, new THREE.MeshLambertMaterial({ color: '#2e3138' }), tlPoles.length);
    tlPoles.forEach((t, i) => {
      m4.identity();
      m4.setPosition(t.x, 1.7, t.z);
      tlPoleMesh.setMatrixAt(i, m4);
    });
    scene.add(tlPoleMesh);
    const tlHeadGeo = new THREE.BoxGeometry(0.34, 1.1, 0.18);
    const tlHeadMesh = new THREE.InstancedMesh(tlHeadGeo, new THREE.MeshLambertMaterial({ color: '#1a1d22' }), tlHeads.length);
    tlHeads.forEach((t, i) => {
      m4.identity();
      m4.setPosition(t.x, 2.95, t.z);
      tlHeadMesh.setMatrixAt(i, m4);
    });
    scene.add(tlHeadMesh);
    const tlDotGeo = new THREE.SphereGeometry(0.12, 8, 6);
    // Basic material: an instance colour tints it, while a Lambert emissive
    // would leave every lamp glowing white whatever its colour.
    const tlDotMesh = new THREE.InstancedMesh(tlDotGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), tlDots.length);
    const tmpColor = new THREE.Color();
    tlDots.forEach((t, i) => {
      m4.identity();
      m4.setPosition(t.x, t.y, t.z);
      tlDotMesh.setMatrixAt(i, m4);
      tmpColor.set(t.color);
      tlDotMesh.setColorAt(i, tmpColor);
    });
    scene.add(tlDotMesh);

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

  function draw(state, camYaw, screen, camDist, time, snap) {
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
        if (g.userData.glowRed) g.userData.glowRed.material.opacity = phase ? 0.85 : 0.07;
        if (g.userData.glowBlue) g.userData.glowBlue.material.opacity = phase ? 0.07 : 0.85;
        if (g.userData.pool) {
          g.userData.pool.material.color.set(phase ? '#ff2a2a' : '#2a6bff');
          g.userData.pool.material.opacity = 0.3;
        }
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

    // Vela Tower beacon blinks; clouds drift slowly around the city.
    if (dyn.beacon) dyn.beacon.material.emissiveIntensity = 1.2 + Math.sin(time * 3) * 1.1;
    if (dyn.clouds) dyn.clouds.rotation.y = time * 0.004;

    // Camera.
    if (screen === 'title') {
      // A postcard orbit: high enough to clear the rooftops, looking out
      // toward the horizon — the skyline, the haze and the sky fill the
      // frame behind the title instead of one roof seen from above.
      const a = time * 0.07;
      camera.position.set(Math.cos(a) * 45, 42, Math.sin(a) * 45);
      camera.lookAt(-Math.cos(a) * 80, 15, -Math.sin(a) * 80);
    } else {
      const dist = CAMERA.dist * camDist;
      const back = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
      const tx = p.x - back.x * dist;
      const tz = p.z - back.z * dist;
      const ty = CAMERA.height * (0.7 + camDist * 0.35);
      if (snap) {
        // Staged screenshots: the camera is already where it belongs instead
        // of still lerping in from its spawn point.
        camPos.set(tx, ty, tz);
      } else {
        camPos.x += (tx - camPos.x) * 0.12;
        camPos.y += (ty - camPos.y) * 0.12;
        camPos.z += (tz - camPos.z) * 0.12;
      }
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
