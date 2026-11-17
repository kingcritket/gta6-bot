// Port Vela — tuning constants. One place for every number the sim and the
// renderer agree on, so a balance change never needs a hunt through files.
export const STEP = 1 / 60;
export const SAVE_KEY = 'port-vela-save-v1';

export const CITY_HALF = 120;
export const STREETS = [-100, -60, -20, 20, 60, 100];
export const ROAD_HALF = 5;

export const WALK_SPEED = 4.4;
export const RUN_SPEED = 7.2;
export const CAR_ACCEL = 15;
export const CAR_BRAKE = 28;
export const CAR_MAX_SPEED = 30;
export const CAR_REVERSE_MAX = 9;
export const CAR_TURN = 2.6;

export const PISTOL_MAG = 12;
export const PISTOL_DAMAGE = 34;
export const PISTOL_RANGE = 45;
export const PISTOL_COOLDOWN = 0.22;
export const RELOAD_TIME = 1.2;

export const ENEMY_HEALTH = 100;
export const ENEMY_DAMAGE_MIN = 7;
export const ENEMY_DAMAGE_MAX = 11;
export const ENEMY_ACCURACY = 0.33;
export const ENEMY_SHOOT_MIN = 1.8;
export const ENEMY_SHOOT_MAX = 2.8;
export const ENEMY_RANGE = 30;
export const HEALTH_REGEN_DELAY = 6;
export const HEALTH_REGEN_RATE = 4;

export const QUIET_SECONDS = 7;
export const BUST_SECONDS = 1.2;
export const POLICE_MAX = 3;

export const MISSION_REWARDS = [500, 900, 1200, 1800, 5000];

export const CAMERA = { dist: 9.5, height: 4.2, zoomMin: 0.55, zoomMax: 2.1 };

// Event bits a step returns: the shell plays sounds and toasts from these.
export const EV = {
  SHOT: 1,
  HIT: 2,
  CRASH: 4,
  PICKUP: 8,
  STEAL: 16,
  MISSION: 32,
  WASTED: 64,
  BUSTED: 128,
  DONE: 256,
};

// Action bits the shell hands to the sim each step.
export const ACTION = {
  CONFIRM: 1,
  INTERACT: 2,
  PAUSE: 4,
  RELOAD: 8,
  SHOOT: 16,
};

export const SITES = {
  garage: { x: -100, z: 60, label: 'Bengkel Mara' },
  docks: { x: 60, z: 100, label: 'Dermaga' },
  bank: { x: 100, z: -60, label: 'Bank Vela' },
  plaza: { x: 0, z: 0, label: 'Plaza Vela' },
};

// Screen names (shared by the renderer, the main loop and shot staging).
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_DONE = 'done';

