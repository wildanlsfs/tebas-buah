// Tebas Buah! — tebas buah dengan ayunan tangan (webcam) atau geser jari/mouse.
// Kamera 3D diam; buah dilempar dari bawah di bidang z = 0. Tebasan dihitung di ruang layar dari ruas
// antara dua posisi tangan berturut-turut, jadi tetap kena walau data pose hanya ±15 kali per detik.
import * as THREE from 'three';
import { FRUITS, NORMAL, makeFruit, makeHalves } from './fruits.js';
import { createHands, drawSkeleton } from './hands.js';
import { sfx, unlock, setMuted, isMuted } from './audio.js';
import { CAM_VIDEO, lowLightTune, LightMeter, brightFrame, DARK_HINT_ID, DIM_HINT_ID } from './cam-light.js';
import { load, save, MODES, modeById, starsFor } from './save.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------------------
// Renderer & kamera
// ---------------------------------------------------------------------------
// Mode kamera memakai gambar yang lebih ringan (tanpa antialias, resolusi lebih rendah, kanvas 2D 1×).
// Alasannya: pembaca pose MediaPipe memakai GPU juga (walau delegasi CPU, gambar kamera tetap diunggah
// lewat WebGL). Uji dengan beban GPU buatan: deteksi 34 ms naik jadi 130–340 ms (3–7 pose/detik) saat
// GPU penuh. GPU yang lega lebih penting daripada tepi buah yang halus.
// Game tetap minta GPU 'high-performance': di Mac dua GPU, MediaPipe (GPU bawaan) jadi tidak satu antrean
// dengan game. Uji: satu GPU yang sama justru lebih lambat (168 ms vs 133 ms).
let renderer = null, lite = null;
const glName = (gl) => { try { const e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { return ''; } };
function makeRenderer(light) {
  if (renderer && lite === light) return;
  lite = light;
  let canvas = $('game');
  if (renderer) {   // antialias tidak bisa diubah setelah konteks dibuat → ganti kanvas baru
    renderer.dispose(); renderer.forceContextLoss();
    const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); canvas = fresh;
  }
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !light, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  camPerf.gpuGame = glName(renderer.getContext());
  resize();
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
const CAM_Z = 12;
camera.position.set(0, 0, CAM_Z);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-4, 6, 10); scene.add(sun);

const trail = $('trail'), tctx = trail.getContext('2d');
const splat = $('splat'), sctx = splat.getContext('2d');
let W = innerWidth, H = innerHeight, viewH = 1, viewW = 1, pxPerUnit = 1, dprScale = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  const aspect = W / H;
  // lebar terlihat minimal 7,5 satuan (HP tegak), tinggi minimal ±9 satuan
  const fovForW = 2 * Math.atan(7.5 / aspect / 2 / CAM_Z) * 180 / Math.PI;
  camera.fov = Math.max(42, fovForW);
  camera.aspect = aspect; camera.updateProjectionMatrix();
  viewH = 2 * CAM_Z * Math.tan(camera.fov * Math.PI / 360); viewW = viewH * aspect; pxPerUnit = H / viewH;
  // mode kamera: maks ±1,4 juta piksel & 1,25×, kanvas 2D 1× (layar Retina 2880×1800 = 5,2 juta piksel
  // per kanvas, digambar ulang tiap frame → GPU penuh dan pembaca pose ikut antre)
  const dpr = (lite ? Math.min(devicePixelRatio || 1, Math.sqrt(1.4e6 / (W * H)), 1.25) : Math.min(devicePixelRatio || 1, Math.sqrt(2.2e6 / (W * H)), 2)) * dprScale;
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  const d2 = lite ? 1 : Math.min(devicePixelRatio || 1, 2);
  for (const c of [trail, splat]) { c.width = Math.round(W * d2); c.height = Math.round(H * d2); }
  tctx.setTransform(trail.width / W, 0, 0, trail.height / H, 0, 0);
  sctx.setTransform(splat.width / W, 0, 0, splat.height / H, 0, 0);
  // mengubah ukuran kanvas mengosongkannya; frame berikutnya menggambar & menampilkannya lagi bila perlu
  trailInk = splatInk = false; trail.style.visibility = splat.style.visibility = 'hidden';
  document.body.classList.toggle('side', isSide());
  clearTimeout(relayoutT); relayoutT = setTimeout(relayout, 160);
}
// layar pendek mendatar (HP miring): dialog di kiri, buah-tombol di kanan
const isSide = () => innerHeight < 520 && innerWidth > innerHeight * 1.3;
let relayoutT = 0;
function relayout() {   // layar diputar / diubah ukurannya: buah-tombol ditata ulang
  if (state.mode === 'menu') menuFruits();
  else if (state.mode === 'result' && uiFruits.length) resultFruits();
  else if (state.mode === 'paused' && uiFruits.length) pauseFruits();
}
let trailInk = false, splatInk = false;   // ada gambar di kanvas 2D? (kanvas kosong tidak perlu dihapus ulang)
addEventListener('resize', resize);
const toScreen = (v) => ({ x: (v.x / viewW + .5) * W, y: (.5 - v.y / viewH) * H });

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
const saved = load();
saved.camSide = saved.camSide === 'left' ? 'left' : 'right';   // posisi kotak kamera
saved.camFold = !!saved.camFold;                                   // kotak kamera dilipat
const state = {
  mode: 'menu',          // menu | count | play | practice | ending | result | paused
  input: saved.input || 'touch',
  modeId: 'klasik', score: 0, time: 0, lives: 0, timeScale: 1,
  slow: 0, rain: 0, rainT: 0, spawnT: 0, elapsed: 0, countT: 0, endT: 0,
  stats: null, shake: 0, pausedFrom: null, practice: 0, practiceN: 0, practiceCuts: { L: 0, R: 0, mouse: 0 },
};
let lostSince = 0;

// ---------------------------------------------------------------------------
// Buah, belahan, partikel
// ---------------------------------------------------------------------------
const fruits = [];    // { g, id, p, v, w, r, cut, ui }
const halves = [];    // { g, p, v, w, life }
const GRAV = { klasik: 9.5, santai: 8, kilat: 12, practice: 6 };

function spawnFruit(id, opt = {}) {
  const g = makeFruit(id);
  const r = g.userData.r;
  const p = new THREE.Vector3(opt.x ?? rand(-viewW * .38, viewW * .38), opt.y ?? -viewH / 2 - r - .3, 0);
  let v = opt.v;
  if (!v) {
    const grav = gravity();
    const apex = rand(viewH * .02, viewH * .36);
    const vy = Math.sqrt(2 * grav * (apex - p.y));
    const tx = rand(-viewW * .3, viewW * .3);
    v = new THREE.Vector3((tx - p.x) / (vy / grav * 1.7), vy, 0);
  }
  g.position.copy(p);
  g.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
  scene.add(g);
  const f = { g, id, def: FRUITS[id], p, v, w: new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-1.5, 1.5)), r, cut: false, ui: opt.ui || null };
  fruits.push(f);
  if (!opt.ui) sfx.toss();
  return f;
}
const gravity = () => GRAV[state.mode === 'practice' ? 'practice' : state.modeId] || 9.5;

function removeFruit(f) {
  scene.remove(f.g);
  fruits.splice(fruits.indexOf(f), 1);
  if (f.ui?.label) f.ui.label.remove();
}

// partikel sari buah (bola kecil)
const PN = 360;
const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(.07, 6, 4), new THREE.MeshBasicMaterial(), PN);
drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); drops.frustumCulled = false;
const dData = Array.from({ length: PN }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
let dNext = 0;
const tmpO = new THREE.Object3D(), tmpC = new THREE.Color();
for (let i = 0; i < PN; i++) { tmpO.scale.setScalar(0); tmpO.updateMatrix(); drops.setMatrixAt(i, tmpO.matrix); drops.setColorAt(i, tmpC.set(0xffffff)); }
scene.add(drops);
function burst(p, color, n = 14, speed = 4) {
  for (let k = 0; k < n; k++) {
    const d = dData[dNext], i = dNext; dNext = (dNext + 1) % PN;
    d.life = rand(.4, .8); d.p.copy(p); d.s = rand(.6, 1.6);
    const a = Math.random() * Math.PI * 2, sp = rand(.3, 1) * speed;
    d.v.set(Math.cos(a) * sp, Math.sin(a) * sp + 1.5, rand(-1, 1));
    drops.setColorAt(i, tmpC.set(color));
  }
  drops.instanceColor.needsUpdate = true;
}
function updateDrops(dt) {
  for (let i = 0; i < PN; i++) {
    const d = dData[i]; if (d.life <= 0) continue;
    d.life -= dt; d.v.y -= 9 * dt; d.p.addScaledVector(d.v, dt);
    tmpO.position.copy(d.p); tmpO.scale.setScalar(Math.max(0, d.life) * 1.6 * d.s); tmpO.updateMatrix(); drops.setMatrixAt(i, tmpO.matrix);
  }
  drops.instanceMatrix.needsUpdate = true;
}

// cipratan di dinding kayu (kanvas 2D di belakang buah)
const splats = [];
function addSplat(p, color, size) {
  const s = toScreen(p);
  const c = new THREE.Color(color);
  const blobs = Array.from({ length: 7 }, () => ({ dx: rand(-1, 1) * size * .7, dy: rand(-1, 1) * size * .7, r: rand(.25, .55) * size }));
  splats.push({ x: s.x, y: s.y, col: `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`, size, blobs, age: 0 });
  if (splats.length > 28) splats.shift();
}
function drawSplats(dt) {
  // kanvas kosong disembunyikan: lapisan layar penuh yang transparan pun tetap harus dipadukan GPU
  if (!splats.length) { if (splatInk) { sctx.clearRect(0, 0, W, H); splatInk = false; splat.style.visibility = 'hidden'; } return; }
  if (!splatInk) { splatInk = true; splat.style.visibility = ''; }
  sctx.clearRect(0, 0, W, H);
  for (let i = splats.length - 1; i >= 0; i--) {
    const s = splats[i]; s.age += dt;
    const a = Math.max(0, .55 - s.age * .12);
    if (a <= 0) { splats.splice(i, 1); continue; }
    sctx.fillStyle = `rgba(${s.col},${a})`;
    sctx.beginPath(); sctx.arc(s.x, s.y, s.size * .55, 0, 7); sctx.fill();
    for (const b of s.blobs) { sctx.beginPath(); sctx.arc(s.x + b.dx, s.y + b.dy + s.age * 6, b.r, 0, 7); sctx.fill(); }
  }
}

// ---------------------------------------------------------------------------
// Pedang (jejak tangan) & tebasan
// ---------------------------------------------------------------------------
const blades = {};   // key → { pts: [{x,y,t}], active, lastCut, combo, color, cursor }
const BLADE_COL = { L: '120,200,255', R: '255,170,90', mouse: '255,255,255' };
function blade(key) { return blades[key] ||= { pts: [], active: false, lastFast: 0, combo: 0, comboT: 0, cx: 0, cy: 0, seen: 0, dist: 0 }; }
const minDim = () => Math.min(W, H);

function addPoint(key, x, y, t, cap = t) {
  const b = blade(key);
  const prev = b.pts[b.pts.length - 1];
  b.pts.push({ x, y, t, cap });
  while (b.pts.length > 2 && t - b.pts[0].t > 220) b.pts.shift();
  b.seen = t;
  if (!prev || t - prev.t > 450) { b.fastRun = 0; b.pending = null; return; }   // tangan baru muncul (atau kamera tersendat lama): belum ada ruas
  const dx = x - prev.x, dy = y - prev.y, dist = Math.hypot(dx, dy);
  const speed = dist / Math.max(.008, (t - prev.t) / 1000) / minDim();   // tinggi layar per detik
  const need = key === 'mouse' ? .7 : 1.15;
  const cam = key !== 'mouse';
  // lompatan sekali yang sangat jauh = salah baca kamera / tangan baru muncul, bukan tebasan
  if (cam && dist > minDim() * .75) { b.fastRun = 0; b.pending = null; return; }
  b.dist += dist;
  const seg = { a: prev, c: { x, y, cap }, ang: Math.atan2(-dy, dx) };
  if (speed >= need) {
    if (!b.active) sfx.swish();
    b.active = true; b.lastFast = t;
    // kamera: tebasan dihitung setelah DUA ruas cepat berturut-turut (ruas pertama disimpan lalu ikut
    // dipotong), supaya satu frame yang meloncat tidak memotong buah
    if (cam && !b.fastRun) b.pending = seg;
    else { if (b.pending) { cutAlong(key, b.pending.a, b.pending.c, b.pending.ang); b.pending = null; } cutAlong(key, seg.a, seg.c, seg.ang); }
    b.fastRun = (b.fastRun || 0) + 1;
  } else {
    b.fastRun = 0; b.pending = null;
    if (t - b.lastFast > 140) { b.active = false; endCombo(key); }
  }
}

// Gerakan tangan dari kamera sampai ke game agak terlambat (kamera + pembaca pose ±100–200 ms), dan
// selama itu buah sudah bergeser. Jadi buah diperiksa di dua tempat: posisinya sekarang dan posisinya
// saat gambar tangan itu diambil kamera. Kena salah satu = terpotong.
const tmpP = new THREE.Vector3();
function cutAlong(key, a, c, angle) {
  const back = Math.min(.35, Math.max(0, (performance.now() - ((a.cap ?? a.t) + (c.cap ?? c.t)) / 2) / 1000)) * state.timeScale;
  const g = gravity();
  const vx = c.x - a.x, vy = c.y - a.y, L2 = vx * vx + vy * vy || 1;
  const near = (s, r) => {   // jarak pusat buah ke ruas a→c
    const k = clamp(((s.x - a.x) * vx + (s.y - a.y) * vy) / L2, 0, 1);
    return Math.hypot(a.x + vx * k - s.x, a.y + vy * k - s.y) <= r;
  };
  if (overlayOpen()) return;
  const frozen = state.mode === 'paused' || state.mode === 'resume';
  for (const f of [...fruits]) {
    if (f.cut || (frozen && !f.ui)) continue;
    const r = f.r * pxPerUnit * 1.05;
    let hit = near(toScreen(f.p), r);
    if (!hit && back > .01 && !f.ui && f.v) {
      tmpP.copy(f.p).addScaledVector(f.v, -back); tmpP.y -= .5 * g * back * back;
      hit = near(toScreen(tmpP), r);
    }
    if (hit) sliceFruit(f, angle, key);
  }
}

function sliceFruit(f, angle, key) {
  f.cut = true;
  const def = f.def;
  if (f.ui) {
    // satu tebasan bisa melewati dua buah-tombol: hanya yang pertama yang dipakai
    const ui = f.ui; splitVisual(f, angle); removeFruit(f); sfx.slice();
    for (const o of [...uiFruits]) if (o !== f && fruits.includes(o)) { o.cut = true; o.ui.label.style.opacity = '.3'; }
    setTimeout(() => ui.onSlice(), 280);
    return;
  }
  if (def.hazard) { hitRock(f); return; }
  splitVisual(f, angle);
  removeFruit(f);
  const b = blade(key);
  b.combo++; b.comboT = performance.now();
  sfx.slice(b.combo);
  state.stats && state.stats.fruits++;
  if (state.mode === 'practice') { state.practiceCuts[key] = (state.practiceCuts[key] || 0) + 1; practiceEvent('cut', key); }
  let pts = def.pts, label = `+${pts}`, cls = null;
  if (def.special === 'emas') { label = `EMAS! +${pts}`; cls = 'gold'; sfx.gold(); }
  if (def.special === 'es') { state.slow = 4; effect('❄️ Waktu melambat!', ''); sfx.ice(); }
  if (def.special === 'hujan') { state.rain = 4; state.rainT = 0; effect('🌟 Hujan buah!', 'hujan'); sfx.rain(); label = `+${pts} 🌟`; cls = 'gold'; }
  addScore(pts, f.p, label, cls);
}

function splitVisual(f, angle) {
  const def = f.def;
  if (f.id === 'belimbing') { burst(f.p, 0xffe14d, 26, 6); addSplat(f.p, def.juice, 70); return; }
  const hs = makeHalves(f.id, angle);
  for (const h of hs) {
    h.position.copy(f.p);
    scene.add(h);
    const n = h.userData.n;
    halves.push({ g: h, p: h.position, v: f.v.clone().multiplyScalar(.5).addScaledVector(n, 2.6).add(new THREE.Vector3(0, 1, 0)), w: new THREE.Vector3(rand(-3, 3), rand(-3, 3), n.x * 4), life: 2.2 });
  }
  burst(f.p, def.juice, 16, 4.5);
  addSplat(f.p, def.juice, f.r * pxPerUnit * 1.4);
}

function endCombo(key) {
  const b = blade(key);
  if (b.combo >= 3 && (state.mode === 'play')) {
    const bonus = b.combo * 10;
    const last = b.pts[b.pts.length - 1];
    addScoreAt(bonus, last ? last.x : W / 2, last ? last.y : H / 2, `+${bonus}`, 'gold');
    banner(`COMBO ${b.combo}!`, `${b.combo} buah sekali tebas · +${bonus}`);
    sfx.combo(b.combo);
    state.stats.bestCombo = Math.max(state.stats.bestCombo, b.combo);
  } else if (state.stats && b.combo) state.stats.bestCombo = Math.max(state.stats.bestCombo, b.combo);
  b.combo = 0;
}

function hitRock(f) {
  burst(f.p, 0x8d8f98, 18, 5);
  removeFruit(f);
  sfx.rock();
  state.shake = .45;
  flash('merah');
  if (state.mode === 'practice') { toast('Ups, itu batu! Jangan ditebas ya 🪨'); practiceEvent('rock'); return; }
  if (state.lives > 0) {
    state.lives--; renderHearts(); sfx.heart();
    popAt(toScreen(f.p).x, toScreen(f.p).y, '-1 ❤️', 'bad');
    if (state.lives <= 0) endGame('Kena batu 3 kali! 🪨');
  } else { state.score = Math.max(0, state.score - 20); $('score').textContent = state.score; popAt(toScreen(f.p).x, toScreen(f.p).y, '-20', 'bad'); }
}

// ---------------------------------------------------------------------------
// Skor & teks
// ---------------------------------------------------------------------------
function popAt(x, y, text, cls) {
  const el = document.createElement('div');
  el.className = 'pop' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.transform = `translate(${x}px, ${y - 30}px)`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function addScore(pts, p, label, cls) { const s = toScreen(p); addScoreAt(pts, s.x, s.y, label, cls); }
function addScoreAt(pts, x, y, label, cls) {
  if (!['play', 'practice', 'ending'].includes(state.mode)) return;
  state.score += pts;
  $('score').textContent = state.score;
  popAt(x, y, label || `+${pts}`, cls);
}
let toastT = null;
function toast(t, ms = 1600) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }
function prompt(big, small = '', ms = 0) {
  $('prompt').hidden = !big && !small;
  const b = $('prompt-big');
  if (b.textContent !== big) { b.textContent = big; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
  $('prompt-small').textContent = small;
  if (ms) setTimeout(() => { if ($('prompt-big').textContent === big) prompt(''); }, ms);
}
function flash(cls = '') { const el = $('flash'); el.className = cls; el.style.transition = 'none'; el.style.opacity = '.45'; requestAnimationFrame(() => { el.style.transition = ''; el.style.opacity = '0'; }); }
function effect(text, cls) { const el = $('effect'); $('effect-txt').textContent = text; el.className = cls; el.hidden = false; }
let bannerT = 0;
function banner(big, small) {   // tulisan besar sebentar di bawah HUD (combo), tidak menutupi buah
  const el = $('banner');
  el.innerHTML = `${big}<small>${small}</small>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('on'), 1400);
}
function renderHearts() {
  const m = modeById[state.modeId];
  $('hearts').hidden = !m || !m.lives || state.mode === 'practice';
  if (m) $('hearts').innerHTML = Array.from({ length: m.lives }, (_, i) => `<i class="${i < state.lives ? '' : 'off'}">❤️</i>`).join('');
}

// ---------------------------------------------------------------------------
// Buah-tombol (menu & hasil): tebas untuk memilih — cocok untuk main dengan kamera
// ---------------------------------------------------------------------------
let uiFruits = [];
function clearUi() { for (const f of [...uiFruits]) if (fruits.includes(f)) removeFruit(f); uiFruits = []; }
function addUiFruit(id, x, y, text, sub, onSlice) {
  const label = document.createElement('div');
  label.className = 'flabel';
  label.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  $('labels').appendChild(label);
  const f = spawnFruit(id, { x, y, v: new THREE.Vector3(), ui: { label, onSlice, x, y, ph: Math.random() * 6 } });
  f.g.visible = true;
  label.addEventListener('click', () => { if (!f.cut) { unlock(); sliceFruit(f, .3, 'mouse'); } });
  f.g.scale.setScalar(1.35);
  uiFruits.push(f);
  return f;
}
function menuFruits() {
  clearUi();
  const portrait = W / H < .9;
  const ids = ['semangka', 'nanas', 'jeruk'];
  MODES.forEach((m, i) => {
    const x = portrait ? (i - 1) * viewW * .33 : viewW * ((state.input === 'camera' ? .07 : .12) + i * .14);
    // main pakai kamera: buah sedikit lebih tinggi supaya tidak tertutup kotak kamera di pojok bawah
    const y = portrait ? -viewH * .2 + (i === 1 ? -1.4 : 0) : -viewH * (state.input === 'camera' ? -.03 : .05) + (i === 1 ? -1.1 : 0);
    const best = saved.best[m.id];
    const f = addUiFruit(ids[i], x, y, `${m.emoji} ${m.name}`, best ? `${m.short} · rekor ${best}${saved.stars[m.id] ? ' ' + '★'.repeat(saved.stars[m.id]) : ''}` : m.short, () => startGame(m.id));
    if (portrait) f.g.scale.setScalar(1.05);
  });
}
// posisi sepasang buah-tombol di bawah dialog (atau di kanan dialog saat HP miring)
function pairPos() {
  if (isSide()) {   // di kanan dialog (diukur, karena lebar HP berbeda-beda) dan di atas kotak kamera
    const d = document.querySelector(`#${state.mode === 'paused' ? 'pause' : 'result'} .dialog`);
    const L = d && d.offsetWidth ? d.getBoundingClientRect().right / W : .55;
    const a = L + (1 - L) * .27, b = L + (1 - L) * .74;
    return [[(a - .5) * viewW, viewH * .08], [(b - .5) * viewW, viewH * .08]];
  }
  if (W / H < .9) return [[-viewW * .23, -viewH * .17], [viewW * .23, -viewH * .17]];
  return [[-viewW * .14, -viewH * .22], [viewW * .14, -viewH * .22]];
}
function resultFruits() {
  clearUi();
  const [a, b] = pairPos();
  addUiFruit('semangka', a[0], a[1], '🔁 Lagi', '', () => startGame(state.modeId));
  addUiFruit('jeruk', b[0], b[1], '🏠 Menu', '', () => goMenu());
}
// saat jeda (main pakai kamera): tebas buah untuk lanjut / ke menu, tanpa menyentuh laptop
function pauseFruits() {
  clearUi();
  if (state.input !== 'camera') return;
  const [a, b] = pairPos();
  addUiFruit('semangka', a[0], a[1], '▶ Lanjut', '', () => resumeGame());
  addUiFruit('jeruk', b[0], b[1], '🏠 Menu', '', () => goMenu());
}

// ---------------------------------------------------------------------------
// Alur permainan
// ---------------------------------------------------------------------------
function clearPlay() {
  for (const f of [...fruits]) removeFruit(f);
  for (const h of halves.splice(0)) scene.remove(h.g);
  uiFruits = [];
  state.slow = 0; state.rain = 0; state.timeScale = 1; $('effect').hidden = true;
}
function showScreen(id) { for (const s of ['menu', 'result', 'pause']) $(s).hidden = s !== id; }
// dialog di atas segalanya (pengaturan, kamera gagal, cara pasang): selama terbuka, tebasan diabaikan
const overlayOpen = () => !$('settings').hidden || !$('camerr').hidden || !$('install').hidden;

function goMenu() {
  clearPlay(); recheckPipe();
  state.mode = 'menu';
  $('hud').hidden = true; prompt('');
  showScreen('menu'); renderMenu(); menuFruits();
}
function renderMenu() {
  document.querySelectorAll('.mode button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.input === state.input)));
  $('menu-tag').innerHTML = state.input === 'camera'
    ? 'Kedua tanganmu jadi pedang. <b>Ayunkan tangan</b> menebas salah satu buah untuk mulai!'
    : 'Tanganmu jadi pedang. <b>Geser cepat</b> melewati salah satu buah untuk mulai!';
  renderSound();
  $('bests').innerHTML = MODES.map((m) => `<li>${m.emoji} ${m.name}: ${saved.best[m.id] ? `<b>${saved.best[m.id]}</b> ${'★'.repeat(saved.stars[m.id] || 0)}` : 'belum main'}</li>`).join('');
}

function startGame(modeId) {
  unlock(); goFull();
  clearPlay();
  const m = modeById[modeId];
  state.modeId = modeId; state.score = 0; state.time = m.time; state.lives = m.lives; state.elapsed = 0; state.spawnT = 1;
  state.stats = { fruits: 0, bestCombo: 0, t0: performance.now(), dist0: totalDist() };
  $('score').textContent = '0'; $('time').textContent = m.time; $('time-bar').style.width = '100%'; $('time-pill').hidden = false; $('time-pill').classList.remove('low');
  renderHearts();
  showScreen(null); $('hud').hidden = false;
  state.mode = 'count'; state.countT = 3.2;
  prompt(`${m.emoji} ${m.name}`, state.input === 'camera' ? 'Ayunkan tangan cepat untuk menebas 💨' : 'Geser cepat untuk menebas 👆');
}
const totalDist = () => Object.values(blades).reduce((s, b) => s + b.dist, 0);

function endGame(label = 'WAKTU HABIS!') {
  if (state.mode !== 'play') return;
  state.mode = 'ending'; state.endT = 1.6;
  prompt(label, ''); sfx.over();
}
function showResult() {
  state.mode = 'result'; recheckPipe();
  prompt(''); $('effect').hidden = true;
  const m = modeById[state.modeId];
  const stars = starsFor(m, state.score);
  const prev = saved.best[m.id] || 0;
  saved.best[m.id] = Math.max(prev, state.score);
  saved.stars[m.id] = Math.max(saved.stars[m.id] || 0, stars);
  const secs = Math.round((performance.now() - state.stats.t0) / 1000);
  // jarak tangan: piksel layar → meter (kotak main ≈ 1,5 m lebar)
  const meters = Math.round((totalDist() - state.stats.dist0) / W * 1.5);
  const T = saved.totals; T.fruits += state.stats.fruits; T.seconds += secs; if (state.input === 'camera') T.meters += meters;
  save(saved);
  $('res-mode').textContent = `${m.emoji} ${m.name}`;
  $('res-score').textContent = state.score;
  $('res-best').textContent = state.score > prev ? (prev ? '🎉 Rekor baru!' : '') : `Rekor: ${prev}`;
  const rows = [['🍉', state.stats.fruits, 'buah'], ['🔥', state.stats.bestCombo, 'combo terbaik']];
  rows.push(state.input === 'camera' ? ['💪', meters + ' m', 'tangan bergerak'] : ['⏱️', secs + ' dtk', 'bermain']);
  $('res-stats').innerHTML = rows.map(([e, v, l]) => `<li>${e} <b>${v}</b>${l}</li>`).join('');
  const els = [...$('res-stars').children];
  els.forEach((s) => s.classList.remove('on'));
  els.forEach((s, i) => { if (i < stars) setTimeout(() => { s.classList.add('on'); sfx.star(i); }, 300 + i * 300); });
  if (stars) setTimeout(() => sfx.win(), 300 + stars * 300);
  $('hud').hidden = true;
  showScreen('result');
  setTimeout(() => { if (state.mode === 'result') resultFruits(); }, 500);
}

function spawnTick(dt) {
  const m = modeById[state.modeId];
  const e = state.elapsed, kilat = state.modeId === 'kilat';
  if (state.rain > 0) {
    state.rainT -= dt;
    if (state.rainT <= 0) {
      state.rainT = .16;
      const side = Math.random() < .5 ? -1 : 1, g = gravity();
      const y = rand(-viewH * .35, -viewH * .05);
      spawnFruit(pick(NORMAL), { x: side * (viewW / 2 + .8), y, v: new THREE.Vector3(-side * rand(4, 7), rand(3, 6) + g * .2, 0) });
    }
    return;
  }
  state.spawnT -= dt;
  if (state.spawnT > 0) return;
  const level = Math.min(1, e / (m.time * .8));
  state.spawnT = (kilat ? rand(.7, 1.2) : rand(1.1, 1.9)) - level * .35;
  const n = 1 + Math.floor(Math.random() * (1.6 + level * (kilat ? 3.5 : 2.5)));
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (state.mode !== 'play') return;
      const r = Math.random();
      let id = pick(NORMAL);
      if (m.lives && e > 6 && r < .1 + level * .08) id = 'batu';
      else if (r > .965) id = 'emas';
      else if (r > .94 && e > 10) id = 'es';
      else if (r > .92 && e > 14) id = 'belimbing';
      spawnFruit(id);
    }, i * rand(80, 220));
  }
}

// ---------------------------------------------------------------------------
// Latihan
// ---------------------------------------------------------------------------
const PRACTICE = {
  camera: [
    { text: 'Dua lingkaran itu tanganmu. Gerakkan kedua tangan! 👐', ev: 'move' },
    { text: 'Ayunkan tangan CEPAT melewati buah untuk menebas 💨', ev: 'cut', n: 3 },
    { text: 'Pakai dua tangan: tebas dengan tangan kiri DAN kanan 🙌', ev: 'both' },
    { text: 'Batu abu-abu jangan ditebas! Biarkan jatuh 🪨', ev: 'rockpass' },
  ],
  touch: [
    { text: 'Geser cepat melewati buah untuk menebas 👆', ev: 'cut', n: 3 },
    { text: 'Batu abu-abu jangan ditebas! Biarkan jatuh 🪨', ev: 'rockpass' },
  ],
};
function startPractice() {
  unlock(); goFull(); clearPlay();
  state.mode = 'practice'; state.practice = 0; state.practiceN = 0; state.practiceCuts = { L: 0, R: 0, mouse: 0 };
  state.modeId = 'santai'; state.score = 0; state.spawnT = .5; state.elapsed = 0;
  state.stats = { fruits: 0, bestCombo: 0, t0: performance.now(), dist0: totalDist() };
  showScreen(null); $('hud').hidden = false; $('time-pill').hidden = true; $('hearts').hidden = true; $('score').textContent = '0';
  practiceStart = totalDist();
  showPractice();
}
let practiceStart = 0, rockOut = null;
function showPractice() {
  const s = PRACTICE[state.input][state.practice];
  if (!s) { prompt('Hebat! 🎉', 'Kamu siap. Pilih permainan di menu.'); saved.tutorial = true; save(saved); sfx.win(); setTimeout(() => state.mode === 'practice' && goMenu(), 2200); state.practice = 99; return; }
  prompt('', `${state.practice + 1}/${PRACTICE[state.input].length} · ${s.text}`);
}
function practiceEvent(ev, key) {
  const s = PRACTICE[state.input][state.practice];
  if (!s) return;
  let done = false;
  if (s.ev === 'cut' && ev === 'cut') done = ++state.practiceN >= s.n;
  if (s.ev === 'both' && ev === 'cut') done = state.practiceCuts.L > 0 && state.practiceCuts.R > 0;
  if (s.ev === 'move' && ev === 'move') done = true;
  if (s.ev === 'rockpass' && ev === 'rockpass') done = true;
  if (done) { sfx.star(state.practice); state.practice++; state.practiceN = 0; state.practiceCuts = { L: 0, R: 0, mouse: 0 }; setTimeout(showPractice, 500); }
}
function practiceTick(dt) {
  const s = PRACTICE[state.input][state.practice];
  if (!s) return;
  if (s.ev === 'move' && totalDist() - practiceStart > W * 1.5) practiceEvent('move');
  state.spawnT -= dt;
  if (state.spawnT > 0 || s.ev === 'move') return;
  state.spawnT = rand(1.4, 2);
  if (s.ev === 'rockpass') {
    if (!rockOut || !fruits.includes(rockOut)) { rockOut = spawnFruit('batu', { x: rand(-viewW * .2, viewW * .2) }); rockOut.watch = true; }
    spawnFruit(pick(NORMAL), { x: rand(-viewW * .35, viewW * .35) });
  } else spawnFruit(pick(NORMAL));
}

// ---------------------------------------------------------------------------
// Kamera & pose
// ---------------------------------------------------------------------------
const hands = createHands();
const video = $('video'), poseCanvas = $('pose'), pctx = poseCanvas.getContext('2d');
const QS = new URLSearchParams(location.search);
// Tiga jalur pembaca pose. Game mengukur ±30 frame pertama tiap jalur lalu memakai yang tercepat:
//   wgpu = Web Worker + delegasi GPU (bawaan), wcpu = Web Worker + CPU (wasm),
//   ugpu = thread utama + GPU, langsung dari elemen video (cara Bolu Lari).
// Untuk uji: ?pose=wgpu|wcpu|ugpu memaksa satu jalur (?cpu = wcpu), ?src=bm memakai ImageBitmap
// (bawaan VideoFrame), ?mp=hp menaruh MediaPipe di GPU 'high-performance' (bawaan: GPU bawaan).
const FORCE = QS.get('pose') || (QS.has('cpu') ? 'wcpu' : '');
const MP_POWER = QS.get('mp') === 'hp' ? 'high-performance' : 'default';
const PIPE_NAME = { wgpu: 'W·GPU', wcpu: 'W·CPU', ugpu: 'U·GPU' };
const GOOD_MS = 45;   // jalur dianggap cukup cepat kalau satu putaran ≤ 45 ms (±22 pose/detik)
let useVF = typeof VideoFrame === 'function' && QS.get('src') !== 'bm';
let poseWorker = null, mainMark = null, camReady = false, camStarting = null, busy = false, pipe = '';
const camPerf = {
  delegate: '', pipe: '', n: 0, infer: 0, lag: 0, grab: 0, xfer: 0, cam: 0, gpuGame: '', gpuPose: {}, trial: {}, text: '',
  shown: null,   // potret angka 1 detik sebelumnya untuk ?debug
};
let renderFrames = 0;
const workerWait = {};   // delegasi → { resolve, reject } selama worker menyiapkan pembacanya

function startWorker() {
  if (poseWorker) return poseWorker;
  const w = poseWorker = new Worker('js/pose-worker.js');
  w.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'ready' || d.type === 'error') {
      const k = workerWait[d.want]; delete workerWait[d.want];
      if (k) d.type === 'ready' ? k.resolve(d) : k.reject(new Error(d.message));
    } else if (d.type === 'pose') {
      if (!pipe || pipe[0] !== 'w') { busy = false; return; }   // hasil terlambat dari jalur lama
      const nowAbs = performance.timeOrigin + performance.now();
      busy = false;
      gotPose(d.all, d.ts, { ms: d.ms, grab: sentAt.sent - sentAt.t0, xfer: Math.max(0, d.recv - sentAt.sent), cyc: nowAbs - sentAt.t0 });
      sendFrame();
    }
  };
  w.onerror = (e) => { for (const k of Object.keys(workerWait)) { workerWait[k].reject(new Error(e.message || 'worker gagal')); delete workerWait[k]; } };
  return w;
}
// siapkan pembaca di worker; hasilnya delegasi yang benar-benar dipakai (GPU bisa jatuh ke CPU)
function workerInit(delegate) {
  const w = startWorker();
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => { delete workerWait[delegate]; reject(new Error('worker timeout')); }, 45000);
    workerWait[delegate] = { resolve: (d) => { clearTimeout(to); resolve(d); }, reject: (err) => { clearTimeout(to); reject(err); } };
    w.postMessage({ type: 'init', delegate, power: MP_POWER, use: false, want: delegate });
  });
}
async function mainInit() {
  if (mainMark) return;
  const v = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
  const files = await v.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { powerPreference: MP_POWER });
  camPerf.gpuPose.ugpu = gl ? glName(gl) : '';
  mainMark = await v.PoseLandmarker.createFromOptions(files, {
    canvas, runningMode: 'VIDEO', numPoses: 1,
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
  });
}
// menyiapkan satu jalur (jalur lama tetap jalan selama itu, jadi permainan tidak terputus)
async function preparePipe(p) {
  if (p === 'ugpu') { await mainInit(); return p; }
  const d = await workerInit(p === 'wcpu' ? 'CPU' : 'GPU');
  if (d.gpu) camPerf.gpuPose[p] = d.gpu;
  return d.delegate === 'CPU' ? 'wcpu' : 'wgpu';
}
function usePipe(p) {
  if (p !== pipe) camPerf.ema = camPerf.emaDet = 0;
  pipe = camPerf.pipe = p;
  camPerf.delegate = p === 'wcpu' ? 'CPU' : 'GPU';
  if (p[0] === 'w') poseWorker.postMessage({ type: 'use', delegate: camPerf.delegate });
  busy = false;   // jalur baru boleh langsung mengirim frame
}

// --- uji jalur: 5 hasil pertama pemanasan (dibuang), lalu rata-rata 25 hasil berikutnya ---
const trial = { queue: [], cur: '', warm: 0, n: 0, cyc: 0, det: 0, t0: 0, done: false };
const score = (p, r) => (p === 'ugpu' ? r.det * 1.6 + 5 : r.cyc);   // thread utama: deteksi menahan gambar game, jadi diberi hukuman
function startTrial(p) {
  trial.cur = p; trial.warm = 0; trial.n = 0; trial.cyc = 0; trial.det = 0; trial.t0 = performance.now();
  usePipe(p);
}
function trialTick(cyc, det) {
  if (trial.done || !trial.cur) return;
  if (trial.warm < 5) { trial.warm++; return; }
  trial.n++; trial.cyc += cyc; trial.det += det;
  // 25 hasil cukup; jalur yang jelas lambat (> 3× batas) tidak perlu ditunggu sampai 25
  if (trial.n >= 25 || (trial.n >= 6 && trial.cyc / trial.n > GOOD_MS * 3)) endTrial();
}
function trialWatch(now) {   // jalur yang macet (hampir tidak ada hasil dalam 4 detik) dianggap sangat lambat
  if (trial.done || !trial.cur || now - trial.t0 < 4000 + trial.warm * 300) return;
  if (trial.n >= 3) endTrial(); else { camPerf.trial[trial.cur] = { cyc: Infinity, det: Infinity }; trial.cur = ''; nextTrial(); }
}
// Saat bermain GPU lebih sibuk daripada di menu. Kalau jalur terpilih jadi jauh lebih lambat dari saat
// diuji, jalur lain diuji ulang begitu kembali ke menu/hasil (paling banyak 2 kali).
let rechecks = 0;
function recheckPipe() {
  if (!trial.done || FORCE || !camReady || rechecks >= 2 || !camPerf.ema) return;
  const was = camPerf.trial[pipe] || { cyc: GOOD_MS, det: GOOD_MS };
  const now = { cyc: camPerf.ema, det: camPerf.emaDet };
  if (score(pipe, now) < Math.max(70, score(pipe, was) * 2)) return;
  rechecks++;
  camPerf.trial = { [pipe]: now };
  trial.done = false; trial.queue = ['wgpu', 'wcpu', 'ugpu'].filter((p) => p !== pipe);
  nextTrial();
}
function endTrial() {
  const p = trial.cur, r = { cyc: trial.cyc / trial.n, det: trial.det / trial.n };
  camPerf.trial[p] = r;
  trial.cur = '';   // jalur ini tetap dipakai selama jalur berikutnya disiapkan
  if (score(p, r) <= GOOD_MS) settle(p); else nextTrial();
}
async function nextTrial() {
  while (trial.queue.length) {
    const want = trial.queue.shift();
    if (camPerf.trial[want]) continue;
    try {
      const got = await preparePipe(want);
      if (camPerf.trial[got]) continue;   // GPU jatuh ke CPU yang sudah diuji
      startTrial(got); return;
    } catch (err) { console.warn('jalur pose', want, 'gagal:', err && err.message); camPerf.trial[want] = { cyc: Infinity, det: Infinity, err: String(err && err.message) }; }
  }
  // semua sudah diuji: pakai yang skornya terkecil
  let best = '', bs = Infinity;
  for (const [p, r] of Object.entries(camPerf.trial)) if (score(p, r) < bs) { bs = score(p, r); best = p; }
  settle(best || pipe);
}
function settle(p) {
  trial.done = true; trial.cur = '';
  if (p !== pipe) usePipe(p);
  // lepaskan pembaca yang tidak terpilih (hemat memori)
  if (p !== 'ugpu') { mainMark?.close(); mainMark = null; poseWorker.postMessage({ type: 'drop', delegate: p === 'wgpu' ? 'CPU' : 'GPU' }); }
  else if (poseWorker) { poseWorker.terminate(); poseWorker = null; }
  if (DEBUG) console.info('jalur pose dipilih:', p, JSON.stringify(camPerf.trial));
}

// Status kamera di layar: memuat (kotak kamera + baris kecil di tombol Kamera), siap, atau gagal (dialog).
function camLoad(text) { $('cam-load').hidden = !text; if (text) $('cam-load-txt').textContent = text; }
let meter = null, lightShown = '';
const lowSmall = document.createElement('canvas');   // sumber pose ukuran kecil saat video besar (720p) tanpa perlu dicerahkan
function poseSrc(w, h) {
  const g = meter ? meter.gain : 1;
  const b = brightFrame(video, g, w, h);
  if (b !== video) return b;
  if (video.videoWidth <= 640) return video;
  if (lowSmall.width !== w || lowSmall.height !== h) { lowSmall.width = w; lowSmall.height = h; }
  lowSmall.getContext('2d').drawImage(video, 0, 0, w, h);
  return lowSmall;
}
// petunjuk ruangan gelap/redup di baris kamera; hanya diubah saat tingkatnya berganti
function lightHint() {
  if (!meter || !camReady) return;
  meter.sample();
  const lv = meter.level;
  if (lv === lightShown) return;
  lightShown = lv;
  if (lv === 'dark') camLine(DARK_HINT_ID, 'bad'); else if (lv === 'dim') camLine(DIM_HINT_ID, 'bad'); else camLine('siap ✓', 'ok');
}
function camLine(text, cls = '') { const el = $('cam-line'); el.textContent = text; el.className = cls; }
let camStream = null, camGen = 0;
async function startCamera() {
  if (camReady) return;
  if (camStarting) return camStarting;
  camStarting = (async () => {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('butuh https'), { name: 'InsecureError' });
    $('cam').hidden = false; applyCam();
    camLoad('Izinkan kamera ya 📷'); camLine('menyiapkan…', 'busy');
    if (!DEBUG) $('cam-status').textContent = 'menyiapkan kamera…';
    const gum = navigator.mediaDevices.getUserMedia({ video: CAM_VIDEO, audio: false })
      .then((st) => { if (!pipe) camLoad('Memuat pembaca gerakan…'); return st; });
    const order = FORCE && PIPE_NAME[FORCE] ? [FORCE] : ['wgpu', 'wcpu', 'ugpu'];
    const fresh = !pipe;   // pembaca pose sudah siap dari sesi kamera sebelumnya? (tidak perlu diuji ulang)
    const prep = fresh ? (async () => { for (;;) { const want = order.shift(); try { return await preparePipe(want); } catch (err) { if (!order.length) throw Object.assign(err, { name: 'PoseLoadError' }); } } })() : Promise.resolve(pipe);
    let first, stream;
    try { [first, stream] = await Promise.all([prep, gum]); }
    catch (e) { gum.then((st) => st.getTracks().forEach((t) => t.stop())).catch(() => {}); throw e; }
    camStream = stream;
    video.srcObject = stream; await video.play();
    try { lowLightTune(stream.getVideoTracks()[0]).catch(() => {}); } catch { /* opsional */ }
    meter = new LightMeter(video); lightShown = '';
    fitPoseCanvas();
    camReady = true;
    camLoad(''); camLine('siap ✓', 'ok');
    if (!DEBUG) $('cam-status').textContent = 'kamera aktif';
    if (fresh) {
      trial.queue = order.filter((p) => p !== first);
      if (FORCE) { usePipe(first); trial.done = true; } else startTrial(first);
    }
    const gen = ++camGen;
    const loop = (t, meta) => {
      if (gen !== camGen) return;   // kamera sudah dimatikan
      camPerf.cam = meta ? meta.presentedFrames : camPerf.cam + 1;
      frameFresh = true; lightHint(); sendFrame(); trialWatch(performance.now());
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop); else setTimeout(loop, 33);
    };
    loop();
  })();
  try { await camStarting; } catch (e) { $('cam').hidden = true; camLine('ayunkan tangan'); throw e; } finally { camStarting = null; }
}
// Kamera dimatikan (pindah ke Sentuh): lampu kamera padam. Pembaca pose tetap disimpan untuk nanti.
function stopCamera() {
  camGen++; camReady = false;
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null; video.srcObject = null; meter = null;
  $('cam').hidden = true; $('tip').hidden = true; camLine('ayunkan tangan');
}
// ukuran kanvas kerangka & bentuk kotak kamera mengikuti video (HP tegak = gambar tegak)
function fitPoseCanvas() {
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  if (poseCanvas.width !== vw || poseCanvas.height !== vh) { poseCanvas.width = vw; poseCanvas.height = vh; }
  $('cam').style.setProperty('--cam-ar', `${vw} / ${vh}`);
}
video.addEventListener('resize', fitPoseCanvas);
const CAM_ERR = {
  NotAllowedError: 'Izin kamera ditolak. Ketuk ikon kamera 🔒 di bilah alamat, pilih <b>Izinkan</b>, lalu coba lagi.',
  SecurityError: 'Izin kamera ditolak. Ketuk ikon kamera 🔒 di bilah alamat, pilih <b>Izinkan</b>, lalu coba lagi.',
  NotFoundError: 'Kamera tidak ditemukan di perangkat ini.',
  OverconstrainedError: 'Kamera tidak ditemukan di perangkat ini.',
  NotReadableError: 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu (misalnya video call), lalu coba lagi.',
  InsecureError: 'Kamera hanya bisa dipakai dari alamat <b>https://</b> (atau localhost).',
  PoseLoadError: 'Pembaca gerakan belum termuat. Sambungkan ke internet sekali, lalu coba lagi.',
};
function showCamError(err) {
  $('camerr-msg').innerHTML = CAM_ERR[err && err.name] || 'Ada masalah saat menyalakan kamera. Coba lagi ya.';
  $('camerr').hidden = false;
}
$('btn-cam-retry').onclick = () => { sfx.click(); $('camerr').hidden = true; setInput('camera'); };
$('btn-cam-touch').onclick = () => { sfx.click(); $('camerr').hidden = true; setInput('touch'); };
// kotak kamera: posisi kiri/kanan & dilipat
function applyCam() {
  const el = $('cam');
  el.classList.toggle('left', saved.camSide === 'left'); el.classList.toggle('right', saved.camSide !== 'left');
  el.classList.toggle('fold', saved.camFold);
  $('btn-cam-fold').textContent = saved.camFold ? '▴' : '▾';
  $('btn-cam-fold').setAttribute('aria-label', saved.camFold ? 'Besarkan kotak kamera' : 'Kecilkan kotak kamera');
}
$('btn-cam-fold').onclick = (e) => { e.stopPropagation(); saved.camFold = !saved.camFold; save(saved); applyCam(); };
// Frame terbaru dikirim begitu pembaca pose selesai (satu frame dalam proses pada satu waktu).
// Ke worker dikirim VideoFrame: dibuat seketika tanpa menyalin gambar. Cadangannya ImageBitmap 320×240.
let frameFresh = false;
const sentAt = { t0: 0, sent: 0 };   // jam absolut (timeOrigin + now), sama dengan jam di worker
function sendFrame() {
  if (busy || !frameFresh || !pipe || video.readyState < 2) return;
  frameFresh = false; busy = true;
  const ts = performance.now();
  if (pipe === 'ugpu') {
    let res = null;
    try { res = mainMark.detectForVideo(meter && meter.gain > 1.06 ? brightFrame(video, meter.gain, 320, Math.round(320 * (video.videoHeight || 480) / (video.videoWidth || 640))) : video, ts); } catch { /* frame dilewati */ }
    const ms = performance.now() - ts;
    busy = false;
    gotPose(res ? res.landmarks || [] : [], ts, { ms, grab: 0, xfer: 0, cyc: ms });
    return;
  }
  sentAt.t0 = performance.timeOrigin + ts;
  const post = (img) => {
    sentAt.sent = performance.timeOrigin + performance.now();
    if (!poseWorker || pipe[0] !== 'w') { img.close(); busy = false; return; }
    poseWorker.postMessage({ type: 'frame', img, ts }, [img]);
  };
  const w = 320, h = Math.round(w * (video.videoHeight || 480) / (video.videoWidth || 640));
  const src = poseSrc(w, h);
  // VideoFrame hanya untuk video kecil tanpa pencerahan; 720p / hasil cerah lewat ImageBitmap kecil
  if (useVF && src === video) {
    try { post(new VideoFrame(video, { timestamp: Math.round(ts * 1000) })); return; } catch { useVF = false; }
  }
  (src === video ? createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' }) : createImageBitmap(src)).then(post).catch(() => { busy = false; });
}
function gotPose(all, ts, m) {
  const now = performance.now();
  camPerf.n++; camPerf.infer += m.ms; camPerf.lag += now - ts; camPerf.grab += m.grab; camPerf.xfer += m.xfer;
  camPerf.ema = camPerf.ema ? camPerf.ema * .95 + m.cyc * .05 : m.cyc;          // rata-rata berjalan untuk recheckPipe
  camPerf.emaDet = camPerf.emaDet ? camPerf.emaDet * .95 + m.ms * .05 : m.ms;
  trialTick(m.cyc, m.ms);
  handlePose(all, now, ts);
}
// ?debug: rincian kecepatan di kotak kamera, diperbarui tiap detik
const gpuShort = (s) => { const m = /ANGLE \(([^,]+)/.exec(s || ''); return (m ? m[1] : (s || '?')).replace(/Google Inc\.? ?/, '').split(' ')[0]; };
function debugTick(now) {
  if (!DEBUG || !camReady) return;
  const c = camPerf, s0 = c.shown;
  if (s0 && now - s0.t < 1000) return;
  c.shown = { t: now, n: c.n, infer: c.infer, lag: c.lag, grab: c.grab, xfer: c.xfer, cam: c.cam, frames: renderFrames };
  if (!s0) return;
  const s = (now - s0.t) / 1000, n = c.n - s0.n, per = (k) => (n ? ((c[k] - s0[k]) / n).toFixed(0) : '–');
  const tr = Object.entries(c.trial).map(([p, r]) => `${p} ${Number.isFinite(r.cyc) ? r.cyc.toFixed(0) : '✗'}`).join(' ');
  c.text = `${(n / s).toFixed(0)} pose/dtk · kam ${((c.cam - s0.cam) / s).toFixed(0)} · game ${((renderFrames - s0.frames) / s).toFixed(0)} fps\n`
    + `${PIPE_NAME[pipe] || pipe}${trial.done ? '' : ' (uji)'} · ambil ${per('grab')} · kirim ${per('xfer')} · baca ${per('infer')} · total ${per('lag')} ms\n`
    + `GPU game ${gpuShort(c.gpuGame)} · pose ${gpuShort(c.gpuPose[pipe])}${tr ? ` · uji ${tr}` : ''}`;
  $('cam-status').textContent = c.text;
}
const CAM_DELAY = 60;   // perkiraan jeda kamera sendiri (ms) sebelum frame sampai ke browser
function handlePose(all, now, ts) {
  const PW = poseCanvas.width, PH = poseCanvas.height;
  pctx.clearRect(0, 0, PW, PH);
  if (all[0]) drawSkeleton(pctx, all[0], PW, PH);
  if (state.input !== 'camera') return;
  const out = hands.process(all, now, PW / PH, W / H);
  lastPoseT = now;
  const cap = ts ? ts - CAM_DELAY : now;
  for (const k of ['L', 'R']) if (out[k]) addPoint(k, out[k].x * W, out[k].y * H, now, cap);
  if (hands.st.ok) lostSince = 0; else if (!lostSince) lostSince = now;
  showFraming(now);
  if (state.mode === 'play' && lostSince && now - lostSince > 2500) pauseGame(true);
}
// Petunjuk posisi badan: baris kecil di kotak kamera, dan petunjuk besar di tengah bawah saat tidak
// sedang menebas (menu, latihan, hitung mundur, jeda). Saat bermain cukup baris kecil.
const FRAMING = {
  none: ['Kamu tidak terlihat 📷', 'Berdiri di depan kamera, kira-kira 1,5 meter.'],
  close: ['Mundur sedikit 👣', 'Kepala sampai perut harus masuk kamera.'],
  far: ['Maju sedikit 👣', 'Kamu terlalu jauh dari kamera.'],
  edge: ['Geser ke tengah ↔️', 'Berdiri di tengah gambar kamera.'],
  hands: ['Angkat tanganmu ✋', 'Kedua tangan belum terlihat kamera.'],
};
let lastPoseT = 0, badSince = 0;
function showFraming(now) {
  const fr = hands.st.framing, bad = fr !== 'ok';
  if (!bad) badSince = 0; else if (!badSince) badSince = now;
  const st = $('cam-status');
  if (!DEBUG) {
    st.textContent = bad ? FRAMING[fr][0] : (hands.st.L.vis && hands.st.R.vis ? 'tangan terbaca ✅' : 'satu tangan terbaca ✋');
    st.className = bad ? 'bad' : 'ok';
  }
  // petunjuk besar muncul kalau masalahnya bertahan > 0,7 dtk (supaya tidak berkedip)
  const calm = ['menu', 'practice', 'count', 'resume'].includes(state.mode);   // jeda & hasil: pesan ada di dialog / baris kecil
  const tip = $('tip'), show = bad && calm && now - badSince > 700 && overlayOpen() === false;
  if (show) { const [t, sub] = FRAMING[fr]; const html = `${t}<small>${sub}</small>`; if (tip.innerHTML !== html) tip.innerHTML = html; }
  tip.hidden = !show;
  if (state.mode === 'paused' && state.pauseLost) $('pause-msg').innerHTML = bad ? `${FRAMING[fr][0]} ${FRAMING[fr][1]}` : 'Kamu terlihat lagi! Lanjut sebentar lagi…';
}

// ---------------------------------------------------------------------------
// Sentuh / mouse
// ---------------------------------------------------------------------------
let mouseDown = false;
addEventListener('pointerdown', (e) => {
  unlock();
  if (e.target.closest('button, .dialog')) return;          // boleh mulai menggesek di atas panel menu & label buah
  mouseDown = true; addPoint('mouse', e.clientX, e.clientY, performance.now());
});
addEventListener('pointermove', (e) => { if (mouseDown) addPoint('mouse', e.clientX, e.clientY, performance.now()); });
addEventListener('pointerup', () => { mouseDown = false; const b = blades.mouse; if (b) { b.active = false; endCombo('mouse'); b.pts.length = 0; } });
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && overlayOpen()) { for (const id of ['settings', 'install']) $(id).hidden = true; return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (['play', 'count', 'practice'].includes(state.mode)) pauseGame(); else if (state.mode === 'paused') resumeGame(); }
  if (e.code === 'KeyM') toggleMute();
});

function setInput(inp) {
  state.input = inp; saved.input = inp; save(saved); renderMenu();
  makeRenderer(inp === 'camera');
  if (state.mode === 'menu') menuFruits();
  if (inp === 'camera') startCamera().then(() => { if (state.input !== 'camera') stopCamera(); }).catch((err) => { console.warn(err); if (state.input === 'camera') { setInput('touch'); showCamError(err); } });
  else stopCamera();
  syncUi(true);
}
document.querySelectorAll('.mode button').forEach((b) => b.addEventListener('click', () => { unlock(); sfx.click(); setInput(b.dataset.input); }));
$('btn-practice').onclick = () => { sfx.click(); startPractice(); };
$('btn-pause').onclick = () => (state.mode === 'paused' ? resumeGame() : pauseGame());
$('btn-resume').onclick = resumeGame;
$('btn-quit').onclick = goMenu;
$('btn-sound').onclick = $('btn-sound2').onclick = () => { toggleMute(); sfx.click(); };
function toggleMute() { setMuted(!isMuted()); renderSound(); }
function renderSound() {
  const m = isMuted();
  $('btn-sound').textContent = m ? '🔇' : '🔊'; $('btn-sound').setAttribute('aria-label', m ? 'Suara mati' : 'Suara nyala');
  $('btn-sound2').textContent = m ? '🔇 Suara mati' : '🔊 Suara';
  if (!$('settings').hidden) renderSettings();
}
// Jeda: buah permainan disembunyikan (tidak bisa terpotong), muncul buah-tombol Lanjut/Menu untuk
// pemain kamera. Lanjut selalu lewat hitung mundur singkat supaya pemain sempat bersiap.
function pauseGame(lost = false) {
  if (!['play', 'count', 'practice', 'resume'].includes(state.mode)) return;
  if (state.mode !== 'resume') state.pausedFrom = state.mode;
  state.mode = 'paused'; state.pauseLost = lost; seenT = 0;
  for (const f of fruits) if (!f.ui) f.g.visible = false;
  for (const h of halves) h.g.visible = false;
  $('pause-msg').hidden = !lost;
  if (lost) $('pause-msg').textContent = 'Kamu tidak terlihat di kamera. Kembali ke depan kamera ya!';
  $('pause-cam').hidden = state.input !== 'camera';
  prompt(''); showScreen('pause'); pauseFruits();
}
function resumeGame() {
  if (state.mode !== 'paused') return;
  clearUi(); showScreen(null); lostSince = 0; holdT = 0;
  for (const f of fruits) f.g.visible = true;
  for (const h of halves) h.g.visible = true;
  state.mode = 'resume'; state.countT = state.input === 'camera' ? 1.5 : .8;
  prompt('Siap…', '');
}
// Kamera: tahan kedua tangan di atas kepala ±1,2 dtk = jeda / lanjut. Harus turun dulu sebelum bisa lagi.
const HOLD = 1.2;
let holdT = 0, holdArmed = true, seenT = 0;
function holdTick(rdt, now) {
  const fresh = state.input === 'camera' && now - lastPoseT < 400;
  const can = fresh && (['play', 'count', 'practice'].includes(state.mode) || (state.mode === 'paused' && !state.pauseLost)) && !overlayOpen();
  const up = fresh && hands.st.handsUp;
  if (!up) holdArmed = true;
  if (can && up && holdArmed) {
    holdT += rdt;
    if (holdT >= HOLD) { holdT = 0; holdArmed = false; sfx.click(); state.mode === 'paused' ? resumeGame() : pauseGame(); }
  } else holdT = Math.max(0, holdT - rdt * 3);
  const el = $('hold');
  el.hidden = holdT < .12;
  if (!el.hidden) el.style.setProperty('--p', (holdT / HOLD).toFixed(3));
  // jeda karena pemain hilang: lanjut sendiri setelah pemain terlihat lagi ±1,2 dtk
  if (state.mode === 'paused' && state.pauseLost) {
    seenT = fresh && hands.st.ok ? seenT + rdt : 0;
    if (seenT > 1.2) resumeGame();
  }
}

// ---------------------------------------------------------------------------
// Pengaturan (suara, kamera, posisi kotak kamera)
// ---------------------------------------------------------------------------
function renderSettings() {
  const val = { sound: isMuted() ? 'off' : 'on', camera: state.input === 'camera' ? 'on' : 'off', side: saved.camSide };
  document.querySelectorAll('#settings .seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === val[g.dataset.set]))));
}
document.querySelectorAll('#settings .seg button').forEach((b) => b.addEventListener('click', () => {
  const k = b.parentElement.dataset.set, v = b.dataset.v;
  if (k === 'sound' && (v === 'off') !== isMuted()) toggleMute();
  if (k === 'camera' && (v === 'on') !== (state.input === 'camera')) setInput(v === 'on' ? 'camera' : 'touch');
  if (k === 'side') { saved.camSide = v; save(saved); applyCam(); }
  sfx.click(); renderSettings();
}));
$('btn-settings').onclick = () => { unlock(); sfx.click(); renderSettings(); $('settings').hidden = false; $('btn-settings-close').focus(); };
$('btn-settings-close').onclick = () => { sfx.click(); $('settings').hidden = true; };

// ---------------------------------------------------------------------------
// Aplikasi HP: pasang (PWA), layar penuh, layar tetap menyala, kembali dari latar belakang
// ---------------------------------------------------------------------------
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const touchDevice = matchMedia('(pointer: coarse)').matches;
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; showInstall(); });
addEventListener('appinstalled', () => { installEvt = null; $('btn-install').hidden = true; });
function showInstall() { $('btn-install').hidden = false; $('btn-install').textContent = touchDevice ? '📲 Pasang di HP' : '📲 Pasang'; }
if (isIOS && !standalone) showInstall();   // Safari iOS tidak punya tombol pasang: tampilkan cara manual
$('btn-install').onclick = async () => {
  sfx.click();
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; $('btn-install').hidden = true; }
  else $('install').hidden = false;
};
$('btn-install-close').onclick = () => { sfx.click(); $('install').hidden = true; };
// layar penuh saat mulai main (HP saja; di laptop tidak dipaksa). Gagal diam-diam kalau tidak diizinkan.
function goFull() {
  if (!touchDevice || standalone || document.fullscreenElement) return;
  try { const r = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch { /* tidak didukung */ }
}
// layar tetap menyala selama bermain atau selama kamera aktif (pemain kamera jarang menyentuh layar)
let wake = null, wakeWant = false;
async function setWake(on) {
  wakeWant = on;
  try {
    if (on && !wake && navigator.wakeLock && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { wake = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (['play', 'count', 'practice', 'resume'].includes(state.mode)) pauseGame(); }
  else if (wakeWant) setWake(true);
});
// pinch-zoom iOS
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());
// kelas di <body> mengikuti keadaan game (gaya HUD/kotak kamera) + kunci layar menyala
let uiKey = '';
function syncUi(force) {
  const playing = ['play', 'count', 'practice', 'resume'].includes(state.mode);
  const key = `${state.mode}|${state.input}|${camReady}`;
  if (key === uiKey && !force) return;
  uiKey = key;
  const cl = document.body.classList;
  cl.toggle('cam', state.input === 'camera'); cl.toggle('playing', playing); cl.toggle('paused', state.mode === 'paused');
  setWake(playing || state.mode === 'paused' || (state.input === 'camera' && camReady));
}
// service worker: game tetap jalan tanpa internet setelah dibuka sekali
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !QS.has('nosw')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker gagal:', e)));
}

// ---------------------------------------------------------------------------
// Gambar jejak pedang & kursor tangan
// ---------------------------------------------------------------------------
function drawTrails(now, dt) {
  if (trailInk) tctx.clearRect(0, 0, W, H);
  let ink = false;
  for (const [key, b] of Object.entries(blades)) {
    const col = BLADE_COL[key];
    const pts = b.pts.filter((p) => now - p.t < 200);
    if (b.active && pts.length >= 2) {
      ink = true;
      // jejak meruncing: tebal di kepala, tipis di ekor
      for (const [w, a, c] of [[22, .25, col], [9, .95, '255,255,255']]) {
        for (let i = 1; i < pts.length; i++) {
          const k = i / (pts.length - 1);
          tctx.strokeStyle = `rgba(${c},${a * k})`; tctx.lineWidth = Math.max(1, w * k); tctx.lineCap = 'round';
          tctx.beginPath(); tctx.moveTo(pts[i - 1].x, pts[i - 1].y); tctx.lineTo(pts[i].x, pts[i].y); tctx.stroke();
        }
      }
    }
    // kursor tangan (kamera): dihaluskan tiap frame layar supaya tidak melompat
    if (key !== 'mouse' && state.input === 'camera' && now - b.seen < 300 && b.pts.length) {
      // kursor ditaruh sedikit di depan (perkiraan posisi tangan SEKARANG dari arah & kecepatannya),
      // untuk menutupi jeda kamera; tidak dipakai untuk memotong buah
      const last = b.pts[b.pts.length - 1], prev = b.pts[b.pts.length - 2];
      let tx = last.x, ty = last.y;
      if (prev && now - last.t < 120 && last.t - prev.t > 5 && last.t - prev.t < 150) {
        const h = Math.min(.1, (now - (last.cap ?? last.t)) / 1000) * .8 / ((last.t - prev.t) / 1000), lim = minDim() * .15;
        tx += clamp((last.x - prev.x) * h, -lim, lim); ty += clamp((last.y - prev.y) * h, -lim, lim);
      }
      const k = 1 - Math.exp(-dt * 45);
      b.cx += (tx - b.cx) * k; b.cy += (ty - b.cy) * k;
      ink = true;
      tctx.fillStyle = `rgba(${col},.35)`; tctx.beginPath(); tctx.arc(b.cx, b.cy, b.active ? 26 : 20, 0, 7); tctx.fill();
      tctx.strokeStyle = '#fff'; tctx.lineWidth = 3; tctx.beginPath(); tctx.arc(b.cx, b.cy, b.active ? 14 : 11, 0, 7); tctx.stroke();
    } else if (key !== 'mouse' && b.pts.length) { const last = b.pts[b.pts.length - 1]; b.cx = last.x; b.cy = last.y; }
  }
  if (ink !== trailInk) { trailInk = ink; trail.style.visibility = ink ? '' : 'hidden'; }
}

// ---------------------------------------------------------------------------
// Putaran utama
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let perfAcc = 0, perfN = 0;
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), .1);
  const now = performance.now();
  const paused = state.mode === 'paused' || state.mode === 'resume';
  // efek es: waktu melambat
  if (state.slow > 0 && !paused) { state.slow -= rdt; if (state.slow <= 0) $('effect').hidden = state.rain <= 0; }
  if (state.rain > 0 && !paused) { state.rain -= rdt; if (state.rain <= 0) $('effect').hidden = state.slow <= 0; }
  state.timeScale += ((state.slow > 0 ? .45 : 1) - state.timeScale) * Math.min(1, rdt * 6);
  const dt = paused ? 0 : rdt * state.timeScale;

  if (state.mode === 'count') {
    const before = Math.ceil(state.countT); state.countT -= rdt; const n = Math.ceil(state.countT);
    if (n !== before && n > 0 && n <= 3) { prompt(String(n), $('prompt-small').textContent); sfx.count(); }
    if (state.countT <= 0) { state.mode = 'play'; prompt('TEBAS!', '', 700); sfx.go(); }
  } else if (state.mode === 'play') {
    state.elapsed += dt;
    const before = Math.ceil(state.time); state.time -= rdt; const n = Math.max(0, Math.ceil(state.time));
    if (n !== before) { $('time').textContent = n; $('time-bar').style.width = `${(100 * Math.max(0, state.time) / modeById[state.modeId].time).toFixed(1)}%`; if (n <= 10 && n > 0) { sfx.tick(); $('time-pill').classList.add('low'); } }
    spawnTick(dt);
    if (state.time <= 0) endGame();
  } else if (state.mode === 'practice') practiceTick(dt);
  else if (state.mode === 'ending') { state.endT -= rdt; if (state.endT <= 0) showResult(); }
  else if (state.mode === 'resume') {   // hitung mundur singkat setelah jeda
    state.countT -= rdt;
    if (state.countT <= 0) { state.mode = state.pausedFrom; prompt(''); if (state.mode === 'practice') showPractice(); }
  }
  if (!$('effect').hidden) $('effect-bar').style.transform = `scaleX(${Math.min(1, Math.max(state.slow, state.rain) / 4).toFixed(3)})`;
  holdTick(rdt, now);
  syncUi();

  // gerak buah
  const g = gravity();
  for (const f of [...fruits]) {
    if (f.ui) {
      f.ui.ph += rdt;
      f.p.set(f.ui.x, f.ui.y + Math.sin(f.ui.ph * 1.6) * .15, 0);
      f.g.rotation.y += rdt * .6;
      const s = toScreen(f.p);
      const lw = f.ui.lw ||= f.ui.label.offsetWidth;   // label tidak boleh keluar layar (HP tegak)
      const lx = clamp(s.x, lw / 2 + 8, W - lw / 2 - 8);
      f.ui.label.style.transform = `translate(${lx}px, ${s.y + f.r * f.g.scale.y * pxPerUnit + 8}px)`;
    } else {
      f.v.y -= g * dt; f.p.addScaledVector(f.v, dt);
      f.g.rotation.x += f.w.x * dt; f.g.rotation.y += f.w.y * dt; f.g.rotation.z += f.w.z * dt;
      if (f.p.y < -viewH / 2 - 2 && f.v.y < 0 || Math.abs(f.p.x) > viewW / 2 + 3) {
        if (f.watch && state.mode === 'practice') practiceEvent('rockpass');
        removeFruit(f);
      }
    }
    f.g.position.copy(f.p);
  }
  for (let i = halves.length - 1; i >= 0; i--) {
    const h = halves[i];
    h.life -= dt; h.v.y -= g * dt; h.p.addScaledVector(h.v, dt);
    h.g.rotation.x += h.w.x * dt; h.g.rotation.y += h.w.y * dt; h.g.rotation.z += h.w.z * dt * .3;
    if (h.life <= 0 || h.p.y < -viewH / 2 - 3) { scene.remove(h.g); halves.splice(i, 1); }
  }
  updateDrops(dt);
  drawSplats(rdt);

  // tangan yang hilang: akhiri combo
  for (const [key, b] of Object.entries(blades)) if (b.active && now - b.lastFast > 160) { b.active = false; endCombo(key); }

  // goyang layar saat kena batu
  state.shake = Math.max(0, state.shake - rdt);
  camera.position.set((Math.random() - .5) * state.shake * .6, (Math.random() - .5) * state.shake * .6, CAM_Z);

  drawTrails(now, rdt);
  renderer.render(scene, camera);

  perfAcc += rdt; perfN++; renderFrames++;
  debugTick(now);
  if (perfAcc > 1.5) {
    const avg = perfAcc / perfN;
    if (avg > 1 / 45 && dprScale > .6) { dprScale -= .15; resize(); }
    else if (avg < 1 / 58 && dprScale < 1) { dprScale = Math.min(1, dprScale + .05); resize(); }
    perfAcc = 0; perfN = 0;
  }
}

makeRenderer(state.input === 'camera');
applyCam();
goMenu();
syncUi(true);
if (state.input === 'camera') setInput('camera');
frame();

if (DEBUG) {
  // tiga baris angka ditaruh di atas kotak kamera
  $('cam').classList.add('dbg');
  window.__game = {
    state, fruits: () => fruits, blades, startGame, startPractice, goMenu, addPoint, handlePose, hands, camPerf, spawnFruit, toScreen,
    pause: () => pauseGame(), resume: () => resumeGame(), uiFruits: () => uiFruits,
    swipe: async (key, pts, stepMs = 33) => { for (const [x, y] of pts) { addPoint(key, x, y, performance.now()); await new Promise((r) => setTimeout(r, stepMs)); } },
    setTime: (t) => { state.time = t; },
  };
}
