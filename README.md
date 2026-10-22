# Tebas Buah!

Game tebas buah untuk anak: kedua tangan jadi pedang lewat webcam, atau geser jari/mouse. Buah tanpa wajah: semangka, jeruk, mangga, apel, buah naga, manggis, kelapa, nanas. Tanpa musik, hanya efek suara. Statis, tanpa build: Three.js 0.160 + MediaPipe Pose 0.10.14 (lite) di Web Worker.

## Cara main

- **Kamera:** berdiri di depan kamera (kepala sampai pinggang terlihat). Dua lingkaran di layar adalah tanganmu. Ayunkan tangan **cepat** melewati buah untuk menebas; gerakan pelan tidak memotong.
- **Sentuh/mouse:** geser cepat melewati buah.
- **Menu dan hasil:** tebas buah-tombolnya (Klasik / Santai / Kilat, Lagi / Menu), atau ketuk labelnya.
- **Tanpa menyentuh laptop (kamera):** tahan **dua tangan di atas kepala** ±1 detik untuk jeda; saat jeda, tebas buah **▶ Lanjut** / **🏠 Menu**, atau tahan dua tangan lagi untuk lanjut. Kalau pemain keluar dari kamera, game berhenti sendiri lalu lanjut sendiri saat pemain kembali. Petunjuk posisi muncul otomatis: *Mundur sedikit*, *Maju sedikit*, *Geser ke tengah*, *Angkat tanganmu*.
- **Pengaturan ⚙️:** suara, kamera nyala/mati, kotak kamera di kiri/kanan. Kotak kamera bisa dikecilkan dengan tombol ▾.

| Mode | Waktu | Batu |
|---|---|---|
| 🍉 Klasik | 60 dtk | ada, 3 nyawa |
| 🌿 Santai | 90 dtk | tidak ada |
| ⚡ Kilat | 45 dtk | ada, buah lebih banyak & cepat |

Buah spesial: **mangga emas** (+50), **jeruk es** (waktu melambat 4 dtk), **belimbing** (hujan buah 4 dtk). Satu tebasan yang memotong ≥ 3 buah = bonus combo. Layar hasil menunjukkan jumlah buah, combo terbaik, dan perkiraan jarak gerak tangan.

## Main di HP

Tebas Buah bisa dipasang seperti aplikasi (PWA) dan tetap jalan tanpa internet setelah dibuka sekali.

- **Android (Chrome):** buka alamat game, ketuk tombol **📲 Pasang di HP** di menu (atau menu ⋮ → *Instal aplikasi*).
- **iPhone/iPad (Safari):** ketuk **📲 Pasang di HP** untuk petunjuk: tombol Bagikan ⬆︎ → *Tambah ke Layar Utama*.
- **Kamera butuh HTTPS** (atau `localhost`). Dari HP, alamat `http://192.168.x.x:5230` di jaringan rumah **tidak bisa** memakai kamera; mode Sentuh tetap jalan. Kalau nanti dipublikasikan (hanya dengan izin pemilik), GitHub Pages sudah memakai HTTPS.
- **Main kamera di HP:** sandarkan HP tegak atau mendatar, kamera depan menghadap pemain, berdiri ±1,5 m sampai kepala–perut terlihat. Saat HP tegak, kotak main dibuat lebih tinggi supaya gerakan tangan terasa pas di layar yang tinggi.
- Saat mulai main di HP, layar penuh dinyalakan (kalau diizinkan browser) dan layar dijaga tetap menyala selama bermain atau selama kamera aktif. Tarik-untuk-muat-ulang dan zoom ketuk-dua-kali dimatikan.
- **Tanpa internet:** file game selalu diambil dari jaringan dulu (jadi selalu versi terbaru) dan disimpan sebagai cadangan; three.js, font, serta MediaPipe (wasm + model) diambil dari CDN dengan versi pasti lalu disimpan. MediaPipe baru tersimpan setelah mode Kamera dipakai sekali saat online.

## Menjalankan

```
python3 -m http.server 5230 --bind 127.0.0.1
```

Buka http://127.0.0.1:5230. Kamera butuh `localhost`/HTTPS.

## Catatan teknis

- `js/hands.js` (murni): pergelangan + arah jari dari landmark Pose dipetakan dari "kotak main" di sekitar badan (3,3 × lebar bahu, dari atas kepala sampai perut) ke layar yang dicermin. Kotak mengikuti badan tapi sangat dihaluskan; posisi tangan memakai One-Euro yang tetap responsif saat bergerak cepat.
- Tebasan dihitung di ruang layar dari ruas antara dua posisi tangan berturut-turut (jarak pusat buah ke ruas ≤ jari-jari), jadi tetap kena walau pose hanya ±15 fps.
- Pedang kamera aktif hanya bila kecepatan ≥ 1,15 × tinggi layar per detik **selama dua ruas berturut-turut** (ruas pertama disimpan lalu ikut dipotong). Lompatan satu frame (salah baca kamera / tangan baru muncul) tidak memotong buah. Jeda > 450 ms memutus tebasan.
- Kamera: frame terbaru dikirim begitu pembaca pose selesai (sebagai VideoFrame; cadangan ImageBitmap 320×240). Jeda kamera ditutupi dua cara: kursor ditaruh sedikit di depan (perkiraan posisi tangan sekarang), dan buah diperiksa juga di posisinya saat gambar tangan diambil.
- Pembaca pose dipilih otomatis dengan mengukur ±30 frame: Web Worker + GPU, Web Worker + CPU, atau thread utama + GPU. Di Mac dua GPU, deteksi di worker bisa melambat jauh saat GPU sibuk; mode kamera juga menggambar lebih ringan (tanpa antialias, resolusi lebih rendah).
- `?debug` menampilkan tiga baris di atas kotak kamera: `pose/dtk · kam (fps kamera) · game fps`, `jalur · ambil · kirim · baca · total ms`, `GPU game · pose · hasil uji`. Paksa jalur dengan `?pose=wgpu|wcpu|ugpu` (`?cpu` = `wcpu`), `?src=bm` (ImageBitmap), `?mp=hp`, `?nosw` (tanpa service worker).
- Service worker `sw.js`: ganti `VERSION` kalau daftar file berubah; cache versi lama dihapus otomatis.
- Lapisan: latar kayu CSS → kanvas cipratan 2D → WebGL transparan → kanvas jejak pedang 2D → teks.
- `?debug` membuka `window.__game` (`startGame`, `startPractice`, `addPoint`, `handlePose`, `spawnFruit`, `swipe`, `toScreen`, `setTime`).
