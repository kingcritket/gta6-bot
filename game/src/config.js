// Every tuning number and colour in one place. Port Vela is a 240x240 m city grid;
// the renderer scales to the window, so no rule below depends on the screen size.

export const STEP = 1 / 60;

/** City layout: a grid of blocks separated by roads. */
export const CITY = {
  half: 120, // city spans -120..120 m on both axes
  block: 32, // block size in m
  road: 12, // road width in m
  pitch: 44, // block + road
};

export const PLAYER = {
  radius: 0.6,
  height: 1.8,
  walkSpeed: 6,
  runSpeed: 10,
  health: 100,
};

export const CAR = {
  length: 4.4,
  width: 2.0,
  accel: 22,
  brake: 34,
  maxSpeed: 30,
  maxReverse: 10,
  turn: 2.1,
  stealRadius: 4.5,
};

export const PED = { count: 26, speed: 1.6, radius: 0.55 };
export const TRAFFIC = { count: 10 };

export const POLICE = {
  maxCars: 4,
  chaseSpeed: 32,
  ramDamage: 8,
  bustRadius: 3.2,
  decaySeconds: 14,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 55,
  pistolRate: 0.28,
  pistolAmmo: 12,
  reloadSeconds: 1.4,
  enemyHealth: 60,
  enemyDamage: 7,
  enemyRange: 34,
  enemyRate: 0.9,
};

export const MISSIONS = [
  {
    id: 1,
    name: 'Roda Pertama',
    giver: 'Mara',
    brief:
      'Mara: "Rook, kau butuh roda. Ambil mobil apa saja di jalan — tekan E di dekat mobil — lalu bawa ke bengkelku."',
    objective: 'Curi sebuah mobil (E), lalu antar ke bengkel Mara',
    steps: ['steal', 'deliver'],
    reward: 500,
  },
  {
    id: 2,
    name: 'Paket Dermaga',
    giver: 'Mara',
    brief:
      'Mara: "Ada paket di dermaga timur. Ambil, jangan tanya isinya, bawa pulang. Polisi mulai mengendus."',
    objective: 'Ambil paket di dermaga, bawa kembali ke bengkel',
    steps: ['pickup', 'deliver'],
    reward: 900,
  },
  {
    id: 3,
    name: 'Panas di Strip',
    giver: 'Mara',
    brief:
      'Mara: "Kau masuk daftar buron. Hilangkan bintang itu — sembunyi sampai panas reda — lalu kembali."',
    objective: 'Kehilangan polisi sampai wanted level kembali 0',
    steps: ['evade'],
    reward: 1200,
  },
  {
    id: 4,
    name: 'Perebutan Plaza',
    giver: 'Drex',
    brief:
      'Drex: "Geng Kobra merebut plaza kita. Bersihkan mereka — empat orang — plaza itu milik kita lagi."',
    objective: 'Kalahkan 4 anggota geng Kobra di Plaza Vela',
    steps: ['eliminate'],
    reward: 1800,
  },
  {
    id: 5,
    name: 'Skor Terakhir',
    giver: 'Mara',
    brief:
      'Mara: "Satu skor besar, lalu kita pergi dari kota ini. Ambil uangnya di bank, kabur ke tempat aman."',
    objective: 'Ambil uang di Bank Vela, kabur ke tempat aman dengan wanted 3',
    steps: ['grab', 'escape'],
    reward: 5000,
  },
];

export const SAVE_KEY = 'port-vela.save.v1';

/** Third-person camera distances (multiplied by the mouse-wheel zoom, 0.65–1.6). */
export const CAMERA = {
  footDist: 9,
  footHeight: 4.2,
  carDist: 13,
  carHeight: 5.2,
  zoomMin: 0.65,
  zoomMax: 1.6,
};

export const PALETTE = {
  sky: 0x87b5d6,
  fog: 0x9db8c8,
  ground: 0x3a3f46,
  road: 0x23262b,
  sidewalk: 0x6d7278,
  building: [0x8a7f70, 0x7d8a96, 0x9c8468, 0x6e7d6a, 0xa08b7a, 0x5f6b7a],
  window: 0x2c3844,
  windowLit: 0xffd27a,
  player: 0x2f9e44,
  playerShirt: 0x2b8a3e,
  pedShirt: [0xc94f4f, 0x4f7ec9, 0xc9a44f, 0x8a4fc9, 0x4fc9a8],
  car: [0xc0392b, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x8e44ad, 0x16a085, 0xe67e22, 0x2c3e50],
  police: 0x1a1a2e,
  policeLight: 0xff2222,
  policeLight2: 0x2244ff,
  marker: 0xffd23f,
  hud: '#eef1f5',
  muted: '#9aa3ad',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
