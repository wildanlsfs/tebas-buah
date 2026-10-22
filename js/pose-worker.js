// Pendeteksi pose MediaPipe di Web Worker (worker klasik, bukan modul: pustaka MediaPipe memuat
// skrip wasm-nya lewat importScripts). Deteksi berjalan di luar thread utama, jadi gambar game tetap
// mulus. Frame yang tersendat-sendat adalah salah satu pemicu pusing.
//
// Worker ini bisa menyimpan dua pembaca sekaligus: delegasi GPU (WebGL) dan CPU (wasm). Game mengukur
// keduanya lalu memakai yang lebih cepat. Di Mac dengan dua GPU, deteksi GPU bisa melambat 4–10× saat
// GPU sibuk menggambar game (uji: 34 ms → 133 ms), sedangkan CPU tidak ikut antre di GPU.
self.module = { exports: {} };
self.exports = self.module.exports;
// unpkg mengirim .cjs sebagai text/javascript; jsdelivr mengirimnya sebagai application/node (ditolak
// importScripts), jadi cadangannya diunduh manual lalu dijalankan di lingkup global.
try {
  importScripts('https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.cjs');
} catch {
  const x = new XMLHttpRequest();
  x.open('GET', 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.cjs', false);
  x.send();
  (0, eval)(x.responseText);
}
const { FilesetResolver, PoseLandmarker } = self.module.exports;

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let files = null;
const marks = {};      // 'GPU' | 'CPU' → PoseLandmarker
const gpuName = {};    // nama GPU konteks WebGL tiap pembaca
let current = null;    // delegasi yang sedang dipakai
const absNow = () => performance.timeOrigin + performance.now();   // jam yang sama dengan thread utama

const plain = (people) => people.map((pts) => pts.map((q) => ({ x: q.x, y: q.y, z: q.z, visibility: q.visibility })));

// Konteks WebGL untuk MediaPipe dibuat sendiri supaya bisa memilih GPU yang sama dengan game
// (MediaPipe memakai ulang konteks yang sudah ada di kanvas itu) dan supaya nama GPU-nya terbaca.
function glCanvas(power) {
  const canvas = new OffscreenCanvas(1, 1);
  let name = '';
  try {
    const gl = canvas.getContext('webgl2', { powerPreference: power });
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    name = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
  } catch { /* biarkan MediaPipe membuat konteksnya sendiri */ }
  return { canvas, name };
}

async function make(delegate, power) {
  files ||= await FilesetResolver.forVisionTasks(WASM);
  const { canvas, name } = glCanvas(power);
  const opts = (dg) => ({ canvas, baseOptions: { modelAssetPath: MODEL, delegate: dg }, runningMode: 'VIDEO', numPoses: 1 });
  try { marks[delegate] = await PoseLandmarker.createFromOptions(files, opts(delegate)); gpuName[delegate] = name; }
  catch (err) {
    if (delegate === 'CPU') throw err;
    delegate = 'CPU';   // GPU gagal → CPU
    if (!marks.CPU) { marks.CPU = await PoseLandmarker.createFromOptions(files, opts('CPU')); gpuName.CPU = name; }
  }
  return { delegate, gpu: name };
}

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    // d.delegate: 'GPU' | 'CPU'; d.power: powerPreference konteks WebGL MediaPipe
    try {
      const r = marks[d.delegate] ? { delegate: d.delegate, gpu: gpuName[d.delegate] || '' } : await make(d.delegate, d.power);
      if (d.use !== false) current = r.delegate;
      postMessage({ type: 'ready', want: d.want, ...r });
    } catch (err) {
      postMessage({ type: 'error', want: d.want, message: String((err && err.message) || err) });
    }
  } else if (d.type === 'use') {
    if (marks[d.delegate]) current = d.delegate;
  } else if (d.type === 'drop') {
    // lepaskan pembaca yang tidak terpilih (hemat memori)
    if (marks[d.delegate] && d.delegate !== current) { try { marks[d.delegate].close(); } catch { /* sudah tertutup */ } delete marks[d.delegate]; }
  } else if (d.type === 'frame') {
    const recv = absNow();
    const dg = current, lm = marks[dg];
    let res = null;
    const t0 = performance.now();
    try { if (lm) res = lm.detectForVideo(d.img, d.ts); } catch { /* frame dilewati */ }
    const ms = performance.now() - t0;
    try { d.img.close(); } catch { /* sudah tertutup */ }   // VideoFrame WAJIB ditutup, kalau tidak kamera macet
    postMessage({ type: 'pose', ts: d.ts, recv, ms, delegate: dg, all: res ? plain(res.landmarks || []) : [] });
  }
};
