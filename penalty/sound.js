// Penalty Star sounds: all made with WebAudio in code (no sound files).
let ctx = null, master = null, noiseBuf = null, crowdGain = null, crowdFilter = null;
let muted = false;
try { muted = localStorage.getItem('penalty-muted') === '1'; } catch (e) { /* private mode */ }

export function isMuted() { return muted; }

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('penalty-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
}

// must be called from a user gesture (PLAY / a tap) the first time
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    // pinkish noise (softer than white noise, more like a crowd far away)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // the crowd murmur: looping noise through a band-pass, louder on a goal
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    crowdFilter = ctx.createBiquadFilter(); crowdFilter.type = 'bandpass'; crowdFilter.frequency.value = 520; crowdFilter.Q.value = 0.6;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0;
    src.connect(crowdFilter); crowdFilter.connect(crowdGain); crowdGain.connect(master);
    src.start();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// pause all sound while the page is hidden (another tab, the phone locked)
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
});

// 0 = silent, 1 = a full stadium roar
export function crowd(level) {
  if (!ctx) return;
  const t = ctx.currentTime;
  crowdGain.gain.setTargetAtTime(0.05 + 0.5 * level, t, 0.35);
  crowdFilter.frequency.setTargetAtTime(480 + 700 * level, t, 0.4);
}

function tone(type, f0, f1, dur, vol = 0.2, when = 0, attack = 0.005) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol, type, f0, f1, q = 1, when = 0, peak = 0.3) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * peak);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

// a crowd voice: a buzzy tone through two vowel formants (for the "aww" and the "ooh")
function voice(f0, f1, dur, vol, when, formants) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const [fa, fb] of formants) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(fa, t); f.frequency.exponentialRampToValueAtTime(fb, t + dur);
    o.connect(f); f.connect(g);
  }
  g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  click() { tone('sine', 660, 990, 0.09, 0.15); },
  pick() { tone('triangle', 520, 780, 0.1, 0.14); },
  // the referee's pea whistle: a high tone with a fast trill
  whistle(long = false, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when, dur = long ? 0.75 : 0.32;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2650;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 32;
    const lg = ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
    g.gain.setValueAtTime(0.13, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    noise(dur, 0.04, 'bandpass', 2600, 2600, 3, when);
  },
  step() { noise(0.06, 0.06, 'lowpass', 500, 300, 1); },
  kick() {
    tone('sine', 170, 48, 0.2, 0.55);
    noise(0.07, 0.35, 'bandpass', 1400, 600, 0.8, 0, 0.1);
    tone('triangle', 420, 160, 0.06, 0.12);
  },
  // the soap bubble pops
  pop(good = true) {
    tone('sine', good ? 700 : 420, good ? 1600 : 260, 0.07, 0.18);
    noise(0.08, 0.12, 'highpass', 3000, 6000, 0.7, 0, 0.1);
    if (good) [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f, 0.18, 0.05, 0.04 + i * 0.05));
  },
  net() { noise(0.45, 0.22, 'highpass', 1800, 900, 0.6, 0, 0.15); tone('sine', 110, 70, 0.25, 0.12); },
  save() { tone('sine', 140, 60, 0.18, 0.45); noise(0.12, 0.3, 'lowpass', 900, 300, 0.8, 0, 0.1); },
  thud() { tone('sine', 90, 45, 0.2, 0.3); noise(0.15, 0.12, 'lowpass', 400, 150, 0.7); },
  cheer() {
    noise(2.8, 0.42, 'bandpass', 700, 1700, 0.7, 0, 0.18);
    noise(2.4, 0.2, 'bandpass', 1900, 2800, 1.1, 0.1, 0.2);
    for (let i = 0; i < 10; i++) voice(180 + Math.random() * 160, 220 + Math.random() * 200, 1.6 + Math.random(), 0.035, Math.random() * 0.3, [[700, 900], [1150, 1300]]);
    for (let i = 0; i < 26; i++) noise(0.05, 0.05 + Math.random() * 0.05, 'bandpass', 1800 + Math.random() * 1500, 0, 1.5, 0.3 + Math.random() * 2.2, 0.05);
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.2, 0.12, 0.05 + i * 0.08));
  },
  aww() {
    for (let i = 0; i < 9; i++) voice(210 + Math.random() * 140, 130 + Math.random() * 60, 1.4 + Math.random() * 0.4, 0.05, Math.random() * 0.15, [[820, 560], [1250, 900]]);
    noise(1.4, 0.12, 'bandpass', 700, 380, 0.9, 0, 0.2);
  },
  star(i) { tone('sine', 1047 + i * 262, 1047 + i * 262, 0.4, 0.14); tone('sine', 2093 + i * 524, 2093 + i * 524, 0.3, 0.05); },
  bubble() { [880, 1175, 1568].forEach((f, i) => tone('sine', f * 0.75, f, 0.16, 0.05, i * 0.06)); },
};
