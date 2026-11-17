// Synthesised sound only (WebAudio, no audio files, no network): engine hum, siren,
// gunshots, pickups and mission jingles. Created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;
  let engineLevel = 0;
  let engineFreq = 42;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 40;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, freq) {
    if (!ctx || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq || 1800;
      const gain = ctx.createGain();
      gain.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* audio is best-effort */ }
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.35;
    },
    /** Called every frame with speed 0..1 (driving) and wanted level. */
    update(dt, speedNorm, wanted) {
      if (!ctx || muted) return;
      if (engineGain) {
        // smooth the engine hum toward its target so speed changes never click
        const targetLevel = speedNorm > 0.02 ? 0.05 + speedNorm * 0.09 : 0;
        const targetFreq = 42 + speedNorm * 130;
        engineLevel += (targetLevel - engineLevel) * Math.min(1, dt * 8);
        engineFreq += (targetFreq - engineFreq) * Math.min(1, dt * 8);
        engineGain.gain.value = engineLevel;
        engineOsc.frequency.value = engineFreq;
      }
      if (sirenGain) {
        sirenGain.gain.value = wanted > 0 ? 0.045 : 0;
        if (wanted > 0) {
          sirenTimer -= dt;
          if (sirenTimer <= 0) {
            sirenTimer = 0.45;
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.value = sirenHigh ? 920 : 660;
          }
        }
      }
    },
    shoot() {
      noise(0.12, 0.5, 2400);
    },
    click() {
      blip(880, 0.06, 'triangle', 0.14);
    },
    enemyShoot() {
      noise(0.1, 0.22, 1800);
    },
    hit() {
      blip(160, 0.15, 'square', 0.18, 70);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.22);
      setTimeout(() => blip(990, 0.18, 'sine', 0.22), 90);
    },
    steal() {
      blip(220, 0.2, 'sawtooth', 0.16, 440);
    },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
    },
    wasted() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.2), i * 160));
    },
    crash() {
      noise(0.25, 0.4, 900);
    },
  };
}
