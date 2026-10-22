// Efek suara disintesis (tanpa file audio, tanpa musik).
let ctx = null, master = null, muted = false;
try { muted = localStorage.getItem('tebas.muted') === '1'; } catch {}

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : .5; master.connect(ctx.destination);
}
export function unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = m; try { localStorage.setItem('tebas.muted', m ? '1' : '0'); } catch {} if (master) master.gain.value = m ? 0 : .5; }
export const isMuted = () => muted;

function tone(freq, { type = 'sine', dur = .15, vol = .4, slide = 0, delay = 0 } = {}) {
  ensure(); if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + .02);
}
function noise(dur, { vol = .3, freq = 1200, type = 'bandpass', delay = 0, q = 1, sweep = 0 } = {}) {
  ensure(); if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay, len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
  const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; g.gain.value = vol;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(100, freq + sweep), t0 + dur);
  n.connect(f); f.connect(g); g.connect(master); n.start(t0);
}

let lastSwish = 0, lastSlice = 0;
export const sfx = {
  swish: () => { const t = performance.now(); if (t - lastSwish < 160) return; lastSwish = t; noise(.18, { vol: .16, freq: 1800, q: .8, sweep: 1800 }); },
  slice: (n = 0) => {
    const t = performance.now(); if (t - lastSlice < 25) return; lastSlice = t;
    noise(.12, { vol: .35, freq: 3200, q: 1.2, sweep: -2200 });
    noise(.16, { vol: .25, freq: 500, type: 'lowpass', delay: .02 });          // "cprot"
    tone(520 + n * 80, { type: 'triangle', dur: .08, vol: .1, delay: .01 });
  },
  combo: (n) => [0, 1, 2].forEach((i) => tone(660 * 2 ** ((n + i * 2) / 12), { type: 'square', dur: .1, vol: .1, delay: i * .07 })),
  rock: () => { tone(120, { type: 'square', dur: .25, vol: .3, slide: -60 }); noise(.3, { vol: .45, freq: 900, q: .6 }); tone(1800, { type: 'triangle', dur: .15, vol: .12 }); },
  gold: () => [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, { type: 'triangle', dur: .14, vol: .18, delay: i * .05 })),
  ice: () => { [1568, 1318, 1046].forEach((f, i) => tone(f, { type: 'sine', dur: .25, vol: .14, delay: i * .08 })); noise(.4, { vol: .12, freq: 6000, type: 'highpass' }); },
  rain: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { type: 'square', dur: .1, vol: .1, delay: i * .05 })),
  toss: () => noise(.12, { vol: .06, freq: 400, type: 'lowpass' }),
  heart: () => { tone(200, { type: 'sawtooth', dur: .3, vol: .2, slide: -100 }); },
  tick: () => tone(1046, { dur: .05, vol: .12 }),
  count: () => tone(523, { type: 'square', dur: .1, vol: .12 }),
  go: () => [523, 784, 1046].forEach((f, i) => tone(f, { type: 'square', dur: i === 2 ? .3 : .1, vol: .14, delay: i * .12 })),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { type: 'triangle', dur: .22, vol: .22, delay: i * .09 })),
  star: (i) => tone(880 * 2 ** (i / 4), { type: 'triangle', dur: .25, vol: .22 }),
  click: () => tone(1200, { type: 'triangle', dur: .05, vol: .12 }),
  over: () => [523, 440, 349, 262].forEach((f, i) => tone(f, { type: 'triangle', dur: .25, vol: .2, delay: i * .14 })),
};
