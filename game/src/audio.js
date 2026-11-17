// Synthesized sound for Port Vela: everything is built from oscillators and
// filtered noise, so the game ships no audio files at all.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const eng = ctx.createGain();
      eng.gain.value = 0;
      eng.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      engineOsc.connect(filt);
      engineOsc2.connect(filt);
      filt.connect(eng);
      engineGain = eng;
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || !unlocked) return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch { /* sound is decoration */ }
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!ctx || !unlocked) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff || 900;
      const g = ctx.createGain();
      g.gain.value = vol || 0.35;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch { /* sound is decoration */ }
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      unlocked = true;
    },
    click() {
      blip(660, 0.06, 'sine', 0.15);
    },
    shoot() {
      noiseBurst(0.14, 0.4, 2400);
      blip(190, 0.1, 'square', 0.16, 70);
    },
    hit() {
      blip(240, 0.09, 'square', 0.2, 120);
    },
    crash() {
      noiseBurst(0.28, 0.5, 500);
    },
    pickup() {
      blip(520, 0.1, 'sine', 0.2);
      setTimeout(() => blip(780, 0.14, 'sine', 0.2), 90);
    },
    steal() {
      blip(300, 0.22, 'sawtooth', 0.14, 620);
    },
    mission() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => setTimeout(() => blip(n, 0.18, 'triangle', 0.22), i * 110));
    },
    wasted() {
      const notes = [392, 330, 262, 196];
      notes.forEach((n, i) => setTimeout(() => blip(n, 0.3, 'sawtooth', 0.16), i * 170));
    },
    update(dt, speedNorm, wanted) {
      if (!ctx || !unlocked) return;
      try {
        const target = speedNorm > 0.02 ? 0.05 + speedNorm * 0.075 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, ctx.currentTime, 0.08);
        engineOsc2.frequency.setTargetAtTime(26 + speedNorm * 62, ctx.currentTime, 0.08);
        if (wanted > 0) {
          sirenTimer += dt;
          if (sirenTimer > 0.45) {
            sirenTimer = 0;
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, ctx.currentTime, 0.05);
          }
          sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        }
      } catch { /* sound is decoration */ }
    },
  };
}
