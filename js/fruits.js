// Buah-buahan (tanpa wajah): model utuh + dua belahan dengan isi yang terlihat. Semua prosedural.
import * as THREE from 'three';
import { mesh, toon, canvasTex } from './look.js';

const T = (w, h, draw) => { const t = canvasTex(w, h, draw); t.wrapS = THREE.RepeatWrapping; return t; };
const ring = (g, c, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill(); };
const dots = (g, w, h, n, color, size = 2) => { g.fillStyle = color; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, size * (.5 + Math.random()), 0, 7); g.fill(); } };

// ---- kulit (dipetakan ke bola) ----
const SKIN = {
  semangka: () => T(128, 64, (g, w, h) => {
    g.fillStyle = '#3d9a3f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f5e27';
    for (let i = 0; i < 8; i++) { g.beginPath(); for (let y = 0; y <= h; y += 4) g.lineTo(i * 16 + 4 + Math.sin(y * .35 + i) * 3, y); for (let y = h; y >= 0; y -= 4) g.lineTo(i * 16 + 11 + Math.sin(y * .35 + i) * 3, y); g.fill(); }
  }),
  jeruk: () => T(64, 64, (g, w, h) => { g.fillStyle = '#ff9a1f'; g.fillRect(0, 0, w, h); dots(g, w, h, 120, 'rgba(200,100,0,.35)', 1); }),
  mangga: () => T(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff6b3d'); gr.addColorStop(.45, '#ffb12e'); gr.addColorStop(1, '#ffd84a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); dots(g, w, h, 30, 'rgba(255,255,255,.25)', 1); }),
  emas: () => T(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(.5, '#ffcc33'); gr.addColorStop(1, '#e09a00'); g.fillStyle = gr; g.fillRect(0, 0, w, h); dots(g, w, h, 18, 'rgba(255,255,255,.8)', 1.5); }),
  apel: () => T(64, 64, (g, w, h) => { g.fillStyle = '#d6303d'; g.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,220,120,.18)'; g.fillRect(Math.random() * w, 0, 2, h); } }),
  naga: () => T(64, 64, (g, w, h) => { g.fillStyle = '#ff3d8b'; g.fillRect(0, 0, w, h); dots(g, w, h, 20, 'rgba(255,255,255,.18)', 3); }),
  manggis: () => T(64, 64, (g, w, h) => { g.fillStyle = '#4b1f40'; g.fillRect(0, 0, w, h); dots(g, w, h, 40, 'rgba(255,255,255,.08)', 2); }),
  kelapa: () => T(64, 64, (g, w, h) => { g.fillStyle = '#6b4423'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(40,20,5,.5)'; for (let i = 0; i < 40; i++) { g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.lineTo(x + (Math.random() - .5) * 8, h); g.stroke(); } }),
  nanas: () => T(64, 64, (g, w, h) => {
    g.fillStyle = '#e3a52b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a5a12'; g.lineWidth = 2;
    for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 8 + h, 0); g.lineTo(i * 8, h); g.stroke(); }
    dots(g, w, h, 40, '#6b8a2e', 1);
  }),
  es: () => T(64, 64, (g, w, h) => { g.fillStyle = '#8fe3ff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 20; i++) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke(); } }),
};

// ---- isi (piringan di bidang potong) ----
const INNER = {
  semangka: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#2f7f33'); ring(g, c, 58, '#d9f2c4'); ring(g, c, 52, '#ff4d5e'); g.fillStyle = '#2b1d1d'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.ellipse(c + Math.cos(a) * 30, c + Math.sin(a) * 30, 2.5, 4.5, a, 0, 7); g.fill(); } }),
  jeruk: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#ff8c1a'); ring(g, c, 58, '#fff1d6'); ring(g, c, 54, '#ffb347'); g.strokeStyle = '#fff1d6'; g.lineWidth = 3; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 54, c + Math.sin(a) * 54); g.stroke(); } ring(g, c, 6, '#fff1d6'); }),
  mangga: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#ff9a2e'); ring(g, c, 59, '#ffcf3d'); g.fillStyle = '#fff3b0'; g.beginPath(); g.ellipse(c, c, 14, 26, 0, 0, 7); g.fill(); }),
  emas: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#e09a00'); ring(g, c, 59, '#ffe066'); g.fillStyle = '#fff8d6'; g.beginPath(); g.ellipse(c, c, 14, 26, 0, 0, 7); g.fill(); }),
  apel: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#c62a36'); ring(g, c, 60, '#fff3d1'); g.fillStyle = '#6b4423'; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.beginPath(); g.ellipse(c + Math.cos(a) * 10, c + Math.sin(a) * 10, 2.5, 5, a, 0, 7); g.fill(); } }),
  naga: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#ff3d8b'); ring(g, c, 58, '#fbfbf7'); g.save(); g.beginPath(); g.arc(c, c, 56, 0, 7); g.clip(); dots(g, w, w, 160, '#1d1a22', 1.3); g.restore(); }),
  manggis: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#4b1f40'); ring(g, c, 56, '#8a2f6e'); ring(g, c, 38, '#ffffff'); g.strokeStyle = '#e8e2e6'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 38, c + Math.sin(a) * 38); g.stroke(); } }),
  kelapa: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#6b4423'); ring(g, c, 56, '#f7f3ea'); ring(g, c, 40, '#dfe9ee'); }),
  nanas: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#c9861a'); ring(g, c, 59, '#ffd84a'); ring(g, c, 14, '#fff3b0'); }),
  es: () => canvasTex(128, 128, (g, w) => { const c = w / 2; ring(g, c, 64, '#5bc8f0'); ring(g, c, 58, '#e6fbff'); ring(g, c, 54, '#a8ecff'); g.strokeStyle = '#e6fbff'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 54, c + Math.sin(a) * 54); g.stroke(); } }),
};

export const FRUITS = {
  semangka: { r: .78, scale: [1.15, 1, 1], juice: 0xff4d5e, pts: 10 },
  jeruk:    { r: .5, scale: [1, 1, 1], juice: 0xffa31a, pts: 10 },
  mangga:   { r: .5, scale: [.95, 1.25, .85], juice: 0xffc23d, pts: 10 },
  apel:     { r: .47, scale: [1, .95, 1], juice: 0xfff0c0, pts: 10 },
  naga:     { r: .55, scale: [1, 1.18, 1], juice: 0xff5aa0, pts: 10 },
  manggis:  { r: .45, scale: [1, .92, 1], juice: 0xf2e9f0, pts: 10 },
  kelapa:   { r: .6, scale: [1, .95, 1], juice: 0xf7f3ea, pts: 10 },
  nanas:    { r: .55, scale: [.9, 1.35, .9], juice: 0xffd84a, pts: 10 },
  emas:     { r: .5, scale: [.95, 1.25, .85], juice: 0xffe066, pts: 50, special: 'emas' },
  es:       { r: .5, scale: [1, 1, 1], juice: 0x8fe3ff, pts: 10, special: 'es' },
  belimbing:{ r: .55, juice: 0xffe14d, pts: 20, special: 'hujan' },
  batu:     { r: .55, juice: 0x8d8f98, pts: 0, hazard: true },
};
export const NORMAL = ['semangka', 'jeruk', 'mangga', 'apel', 'naga', 'manggis', 'kelapa', 'nanas'];

const mats = new Map();
function skinMat(id) {
  if (!mats.has(id)) {
    const extra = id === 'emas' ? { emissive: 0x7a5200 } : id === 'es' ? { emissive: 0x1a4a5a } : {};
    mats.set(id, new THREE.MeshToonMaterial({ map: SKIN[id](), gradientMap: toon(0xffffff).gradientMap, ...extra }));
  }
  return mats.get(id);
}
function innerMat(id) {
  const k = 'in-' + id;
  if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ map: INNER[id](), side: THREE.DoubleSide }));
  return mats.get(k);
}

const sphere = new THREE.SphereGeometry(1, 28, 20);
const halfGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);   // belahan atas (y ≥ 0)
const capGeo = new THREE.CircleGeometry(1, 28);

function deco(id, g, r) {
  const add = (m) => (g.add(m), m);
  if (id === 'apel' || id === 'mangga' || id === 'emas') {
    const stem = add(mesh(new THREE.CylinderGeometry(.03 * r * 2, .04 * r * 2, .25 * r, 6), 0x6b4423, { outline: .008 }));
    stem.position.y = r * (id === 'apel' ? .98 : 1.22);
    const leaf = add(mesh(new THREE.SphereGeometry(.16 * r, 8, 6), id === 'emas' ? 0xb7e05a : 0x4caf50, { outline: .008 }));
    leaf.scale.set(1.6, .35, .8); leaf.position.set(.15 * r, stem.position.y + .05 * r, 0); leaf.rotation.z = -.4;
  } else if (id === 'nanas') {
    for (let i = 0; i < 7; i++) {
      const l = add(mesh(new THREE.ConeGeometry(.09 * r, .7 * r, 4), 0x3f8f3a, { outline: .008 }));
      const a = i / 7 * Math.PI * 2;
      l.position.set(Math.cos(a) * .1 * r, r * 1.5, Math.sin(a) * .1 * r); l.rotation.set(Math.sin(a) * .5, 0, -Math.cos(a) * .5);
    }
  } else if (id === 'naga') {
    for (let i = 0; i < 10; i++) {
      const f = add(mesh(new THREE.ConeGeometry(.1 * r, .38 * r, 4), i % 2 ? 0x8bd448 : 0xff6fa8, { outline: .008 }));
      const a = i / 10 * Math.PI * 2, y = ((i % 3) - 1) * .45;
      const n = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y));
      f.position.copy(n).multiplyScalar(r * 1.02).multiply(new THREE.Vector3(1, 1.18, 1));
      f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().add(new THREE.Vector3(0, .8, 0)).normalize());
    }
  } else if (id === 'manggis') {
    for (let i = 0; i < 4; i++) {
      const p = add(mesh(new THREE.SphereGeometry(.17 * r, 8, 6), 0x5c8a2e, { outline: .008 }));
      const a = i / 4 * Math.PI * 2; p.scale.set(1.4, .4, .9); p.position.set(Math.cos(a) * .18 * r, r * .9, Math.sin(a) * .18 * r); p.rotation.y = -a;
    }
    const stem = add(mesh(new THREE.CylinderGeometry(.04 * r, .05 * r, .25 * r, 6), 0x5c8a2e, { outline: .008 })); stem.position.y = r * 1.05;
  }
}

/** Buah utuh. Mengembalikan Group; userData.r = jari-jari tabrakan (dunia). */
export function makeFruit(id) {
  const d = FRUITS[id];
  const g = new THREE.Group();
  if (id === 'belimbing') {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? .28 : .62; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .7, bevelEnabled: true, bevelThickness: .12, bevelSize: .08, bevelSegments: 3 }); geo.center();
    const m = mesh(geo, 0xffd93d, { outline: .02, extra: { emissive: 0x5a4300 } }); g.add(m);
  } else if (id === 'batu') {
    const geo = new THREE.DodecahedronGeometry(d.r, 0);
    const m = mesh(geo, 0x8d8f98, { outline: .025 }); g.add(m);
    const s2 = mesh(new THREE.DodecahedronGeometry(d.r * .45, 0), 0x6f717a, { outline: .015 }); s2.position.set(d.r * .55, d.r * .35, d.r * .3); g.add(s2);
  } else {
    const m = mesh(sphere, 0xffffff, { outline: .03 });
    m.material = skinMat(id);
    m.scale.set(d.r * d.scale[0], d.r * d.scale[1], d.r * d.scale[2]);
    g.add(m);
    deco(id, g, d.r);
  }
  g.userData = { id, r: d.r * Math.max(...(d.scale || [1])) };
  return g;
}

/**
 * Dua belahan buah. `angle` = arah tebasan di bidang layar (radian). Belahan terbelah oleh bidang yang
 * memuat arah tebasan, jadi keduanya terlempar tegak lurus terhadap tebasan.
 */
export function makeHalves(id, angle) {
  const d = FRUITS[id];
  const r = d.r, sc = d.scale || [1, 1, 1];
  const halves = [];
  for (const sgn of [1, -1]) {
    const pivot = new THREE.Group();          // sumbu y pivot = normal bidang potong
    const shell = mesh(halfGeo, 0xffffff, { outline: .03 });
    shell.material = skinMat(id);
    const cap = new THREE.Mesh(capGeo, innerMat(id)); cap.rotation.x = Math.PI / 2;  // menghadap -y (ke arah bidang potong)
    const inner = new THREE.Group(); inner.add(shell, cap);
    inner.scale.set(r * (sc[0] + sc[1]) / 2, r * (sc[0] + sc[1]) / 2 * .98, r * sc[2]);
    if (sgn < 0) inner.rotation.x = Math.PI;  // belahan bawah
    pivot.add(inner);
    // normal bidang potong (di bidang layar) tegak lurus arah tebasan
    pivot.rotation.z = angle;                 // sumbu y lokal → arah (−sin, cos) setelah diputar
    const n = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0).multiplyScalar(sgn);
    pivot.userData = { n };
    halves.push(pivot);
  }
  return halves;
}
