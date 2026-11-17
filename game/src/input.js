// Keyboard + mouse for Port Vela. Edge-triggered actions are consumed when read,
// so holding a key never double-fires an interaction.
export const ACT = {
  INTERACT: 1,
  SHOOT: 2,
  RELOAD: 4,
  PAUSE: 8,
  CONFIRM: 16,
};

export function createInput(canvas) {
  const down = new Set();
  const queued = new Set();
  let dragX = 0;
  let dragY = 0;
  let wheel = 0;
  let clicked = false;
  let dragging = false;

  function onKey(e) {
    if (e.type === 'keydown') {
      if (!e.repeat) queued.add(e.code);
      down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    } else {
      down.delete(e.code);
    }
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    clicked = true;
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    dragX += e.movementX || 0;
    dragY += e.movementY || 0;
  });
  canvas.addEventListener('wheel', (e) => {
    wheel += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function held(...codes) {
    return codes.some((c) => down.has(c));
  }

  return {
    // -1..1 strafe (x) and forward (z) from WASD / arrows.
    axis() {
      const x = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
      const z = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
      return { x, z };
    },
    runHeld() {
      return held('ShiftLeft', 'ShiftRight');
    },
    takeActions() {
      let bits = 0;
      if (queued.has('KeyE')) bits |= ACT.INTERACT;
      if (queued.has('KeyF') || clicked) bits |= ACT.SHOOT;
      if (queued.has('KeyR')) bits |= ACT.RELOAD;
      if (queued.has('KeyP') || queued.has('Escape')) bits |= ACT.PAUSE;
      if (queued.has('Space') || queued.has('Enter')) bits |= ACT.CONFIRM;
      queued.clear();
      clicked = false;
      return bits;
    },
    takeDrag() {
      const d = { dx: dragX, dy: dragY };
      dragX = 0;
      dragY = 0;
      return d;
    },
    takeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
  };
}
