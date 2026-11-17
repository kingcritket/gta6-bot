// Keyboard and pointer input. Held keys are read every frame; one-shot presses
// (interact, shoot, reload, pause, confirm) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_SHOOT = 8;
export const ACTION_RELOAD = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const SHOOT = new Set(['KeyF']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let wheelDelta = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (RELOAD.has(event.code)) actions |= ACTION_RELOAD;
    else if (SHOOT.has(event.code)) actions |= ACTION_SHOOT;
    if (
      FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) ||
      RIGHT.has(event.code) || CONFIRM.has(event.code)
    ) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      actions |= ACTION_SHOOT;
    }
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  // Mouse wheel zooms the third-person camera in and out.
  canvas.addEventListener('wheel', (event) => {
    wheelDelta += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** -1..1 forward/back, -1..1 left/right, run held. */
    move() {
      return {
        f: (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0),
        s: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        run: has(RUN),
      };
    },
    /** Mouse-drag delta since the last call, in pixels. */
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    /** Accumulated wheel delta since the last call (positive = zoom out). */
    takeWheel() {
      const out = wheelDelta;
      wheelDelta = 0;
      return out;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
