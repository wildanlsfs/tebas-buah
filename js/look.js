// Gaya gambar: toon 3 tingkat + garis tepi (inverted hull) supaya terlihat seperti kartun, bukan primitif polos.
import * as THREE from 'three';

let grad = null;
function gradientMap() {
  if (grad) return grad;
  grad = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  return grad;
}

const cache = new Map();
export function toon(color, extra = {}) {
  const k = color + JSON.stringify(extra);
  if (!cache.has(k)) cache.set(k, new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...extra }));
  return cache.get(k);
}
export function glow(color) {
  const k = 'glow' + color;
  if (!cache.has(k)) cache.set(k, new THREE.MeshBasicMaterial({ color }));
  return cache.get(k);
}

// garis tepi: verteks didorong sepanjang normal, sisi belakang saja, warna gelap
const outlineCache = new Map();
function outlineMat(thick, color) {
  const k = thick + ':' + color;
  if (!outlineCache.has(k)) {
    outlineCache.set(k, new THREE.ShaderMaterial({
      uniforms: { thick: { value: thick }, color: { value: new THREE.Color(color) } },
      vertexShader: `uniform float thick;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          mv.xyz += n * thick * (1.0 + 0.04 * -mv.z);   // sedikit lebih tebal di kejauhan supaya tetap terlihat
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }',
      side: THREE.BackSide,
    }));
  }
  return outlineCache.get(k);
}

/** Mesh toon + garis tepi. Geometri dibuat dengan ukuran asli (jangan di-scale tidak seragam). */
export function mesh(geo, color, { outline = .018, line = 0x2b1d33, cast = true, extra } = {}) {
  const m = new THREE.Mesh(geo, toon(color, extra));
  m.castShadow = cast;
  if (outline) {
    const o = new THREE.Mesh(geo, outlineMat(outline, line));
    o.raycast = () => {};
    o.userData.outline = true;
    m.add(o);
  }
  return m;
}

/** Tekstur kanvas kecil (garis-garis, kayu, dsb.). */
export function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

/** Bayangan bulat lembut (untuk benda yang tidak perlu shadow map). */
let blobTex = null;
export function blob(r = .3, opacity = .35) {
  blobTex ||= canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
