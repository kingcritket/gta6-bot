// Port Vela — keyboard and mouse input. The sim only ever sees the small
// shape this returns: a move vector plus an action bitmask.
import { ACTION } from './config.js';

export { ACTION };
export const ACTION_CONFIRM = ACTION.CONFIRM;
export const ACTION_INTERACT = ACTION.INTERACT;
export const ACTION_PAUSE = ACTION.PAUSE;
export const ACTION_RELOAD = ACTION.RELOAD;
export const ACTION_SHOOT = ACTION.SHOOT;

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDx = 0;
  let mouseDy = 0;
  let wheel = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function codeOf(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    pressed.add('MouseShoot');
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    mouseDx += e.clientX - lastX;
    mouseDy += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheel += e.deltaY;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function held(...codes) {
    return codes.some((c) => keys.has(c));
  }

  return {
    // { f: forward -1..1, s: strafe -1..1, run, camYaw } — camYaw filled in by main.
    move() {
      const f = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
      const s = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
      return { f, s, run: held('ShiftLeft', 'ShiftRight') };
    },
    takeActions() {
      let a = 0;
      if (pressed.has('Space') || pressed.has('Enter')) a |= ACTION.CONFIRM;
      if (pressed.has('KeyE')) a |= ACTION.INTERACT;
      if (pressed.has('KeyP') || pressed.has('Escape')) a |= ACTION.PAUSE;
      if (pressed.has('KeyR')) a |= ACTION.RELOAD;
      if (pressed.has('KeyF') || pressed.has('MouseShoot')) a |= ACTION.SHOOT;
      pressed.clear();
      return a;
    },
    takeMouse() {
      const m = { dx: mouseDx, dy: mouseDy };
      mouseDx = 0;
      mouseDy = 0;
      return m;
    },
    takeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
  };
}
