// Port Vela — synthesized sound. No audio files: every effect is an
// oscillator or a noise burst through WebAudio, so the game ships no assets.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 1.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      sirenLfo.start();
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') void ctx.resume();
    unlocked = true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!ctx || !unlocked) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, cutoff = 1200) {
    if (!ctx || !unlocked) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  return {
    unlock,
    click() { blip(660, 0.07, 'square', 0.08); },
    shoot() { noiseBurst(0.14, 0.5, 2600); blip(180, 0.09, 'square', 0.12); },
    hit() { blip(140, 0.12, 'square', 0.14); },
    crash() { noiseBurst(0.3, 0.4, 500); },
    pickup() { blip(660, 0.1); blip(880, 0.14, 'sine', 0.16, 0.09); },
    steal() { blip(330, 0.08, 'square', 0.1); blip(440, 0.1, 'square', 0.1, 0.08); },
    mission() {
      [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 'triangle', 0.15, i * 0.11));
    },
    wasted() {
      [392, 330, 262, 196].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.1, i * 0.18));
    },
    update(dt, speedNorm, wanted) {
      if (!ctx || !unlocked) return;
      engineGain.gain.setTargetAtTime(0.02 + speedNorm * 0.06, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, ctx.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(280 + speedNorm * 900, ctx.currentTime, 0.1);
      sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.035 : 0, ctx.currentTime, 0.2);
    },
  };
}
