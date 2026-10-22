// Service worker Tebas Buah: game tetap bisa dibuka tanpa internet setelah dibuka sekali.
//
// - File game sendiri (index.html, js, css, ikon): JARINGAN DULU, cadangan dari cache. Jadi kalau ada
//   internet, selalu versi terbaru (tidak pernah tertahan versi lama); kalau tidak ada, pakai simpanan.
// - Pustaka dari CDN (three.js, MediaPipe wasm & model, font) memakai alamat dengan versi pasti, jadi
//   isinya tidak pernah berubah: CACHE DULU (cepat & hemat kuota). MediaPipe baru tersimpan setelah
//   mode Kamera dipakai sekali saat online.
// - Ganti VERSION kalau daftar SHELL berubah; cache versi lama dihapus saat versi baru aktif.
const VERSION = 'tebas-v2';
const SHELL_CACHE = `${VERSION}-shell`, CDN_CACHE = `${VERSION}-cdn`;
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'favicon.svg',
  'js/main.js', 'js/fruits.js', 'js/hands.js', 'js/look.js', 'js/audio.js', 'js/save.js', 'js/pose-worker.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'storage.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// three.js selalu dipakai; disimpan saat pasang supaya mode Sentuh langsung jalan tanpa internet
const CDN_WARM = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_WARM.map((u) => fetch(u, { mode: 'cors', credentials: 'omit' }).then((r) => r.ok && cdn.put(u, r)).catch(() => {})));   // gagal di sini tidak menggagalkan pemasangan
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tebas-') && !k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// jaringan dulu dengan batas waktu (sinyal lemah tidak membuat game menunggu lama), lalu cache.
// Belum ada di cache? Tunggu jaringan sampai selesai (kunjungan pertama yang lambat tetap jalan).
async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  net.catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('lambat')), 4000))]);
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('index.html'));
    return hit || net;
  }
}
// CDN selalu diambil dengan mode CORS (semua CDN di atas mengirim header CORS). Salinan CORS bisa dipakai
// permintaan apa pun; salinan 'opaque' (dari importScripts di worker) TIDAK boleh dipakai permintaan CORS
// (mis. skrip wasm MediaPipe di thread utama) — dulu itu membuat jalur pose thread utama gagal dimuat.
async function cacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req.url);
  if (hit && (hit.type !== 'opaque' || req.mode === 'no-cors')) return hit;
  let res;
  try { res = await fetch(req.url, { mode: 'cors', credentials: 'omit' }); }
  catch { res = await fetch(req); }
  if (res && (res.ok || (res.type === 'opaque' && req.mode === 'no-cors'))) cache.put(req.url, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (CDN_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
});
