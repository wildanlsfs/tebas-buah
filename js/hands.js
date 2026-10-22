// Posisi kedua tangan dari landmark MediaPipe Pose → koordinat layar (0..1). Fungsi murni, bisa diuji.
// Tangan dipetakan dari sebuah "kotak main" di sekitar badan pemain (lebih lebar dari bahu, dari atas
// kepala sampai pinggang), jadi gerakan lengan yang wajar sudah menjangkau seluruh layar. Kotak itu
// mengikuti badan (pemain boleh bergeser) tetapi sangat dihaluskan supaya tidak goyang.
// Gambar kamera tidak dicermin; layar dicermin (tangan kanan pemain = sisi kanan layar).

const L = { shL: 11, shR: 12, wrL: 15, wrR: 16, piL: 17, piR: 18, inL: 19, inR: 20 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function oneEuro(minCut, beta, dCut = 1) {
  let x = null, dx = 0;
  const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  const f = (v, dt) => {
    if (x === null) { x = v; return v; }
    dx += ((v - x) / dt - dx) * alpha(dCut, dt);
    x += (v - x) * alpha(minCut + beta * Math.abs(dx), dt);
    return x;
  };
  f.reset = () => { x = null; dx = 0; };
  return f;
}

export const BOX = { width: 3.3, height: 2.9, above: 1.5 };   // dalam satuan lebar bahu (lebih kecil = lingkaran bergerak lebih jauh per gerakan tangan)
// Layar tegak (HP berdiri): kotak main lebih sempit dan lebih tinggi, supaya gerakan tangan ke samping
// dan ke atas/bawah terasa sama jauhnya di layar yang tinggi.
export const BOX_TEGAK = { width: 2.6, height: 3.4, above: 1.7 };

export function createHands() {
  // framing: 'ok' | 'none' | 'close' (terlalu dekat) | 'far' (terlalu jauh) | 'edge' (di pinggir) | 'hands' (tangan tak terlihat)
  // handsUp: kedua tangan di atas kepala (dipakai untuk jeda tanpa menyentuh layar)
  const st = { ok: false, box: null, L: hand(), R: hand(), framing: 'none', handsUp: false };
  function hand() { return { vis: false, x: .5, y: .5, t: 0, fx: oneEuro(2, 8), fy: oneEuro(2, 8), lost: 0 }; }
  const fb = { cx: oneEuro(.4, .05), top: oneEuro(.4, .05), sw: oneEuro(.3, .02) };
  let lastT = 0;

  /** Satu frame pose. Mengembalikan { L, R } = posisi layar baru (atau null kalau tangan tak terlihat). */
  function process(all, now, aspect = 4 / 3, screenAspect = 16 / 10) {
    const dt = lastT ? clamp((now - lastT) / 1000, 1 / 120, .25) : 1 / 30; lastT = now;
    const out = { L: null, R: null };
    // orang terbesar (paling dekat) = pemain
    let lm = null, best = 0;
    for (const p of all) { const sw = Math.abs(p[L.shL].x - p[L.shR].x); if (sw > best) { best = sw; lm = p; } }
    if (!lm) { st.ok = false; st.L.vis = st.R.vis = false; st.framing = 'none'; st.handsUp = false; return out; }
    st.ok = true;
    const vis = (i) => (lm[i].visibility === undefined ? 1 : lm[i].visibility);
    const swRaw = Math.max(.04, Math.abs(lm[L.shL].x - lm[L.shR].x));
    const sw = fb.sw(swRaw, dt);
    const cx = fb.cx((lm[L.shL].x + lm[L.shR].x) / 2, dt);
    const syRaw = (lm[L.shL].y + lm[L.shR].y) / 2;
    const box = screenAspect < .9 ? BOX_TEGAK : BOX;
    const W = sw * box.width, H = sw * aspect * box.height;          // lebar (satuan x gambar) & tinggi (satuan y gambar)
    const top = fb.top(syRaw - sw * aspect * box.above, dt);
    st.box = { cx, top, W, H };
    for (const side of ['L', 'R']) {
      const h = st[side];
      const wi = side === 'L' ? L.wrL : L.wrR, ii = side === 'L' ? L.inL : L.inR, pi = side === 'L' ? L.piL : L.piR;
      if (vis(wi) < .35) { h.vis = false; h.fx.reset(); h.fy.reset(); continue; }
      // titik telapak: sedikit di depan pergelangan, ke arah jari
      let px = lm[wi].x, py = lm[wi].y;
      if (vis(ii) > .3 && vis(pi) > .3) {
        const mx = (lm[ii].x + lm[pi].x) / 2, my = (lm[ii].y + lm[pi].y) / 2;
        px += (mx - px) * .6; py += (my - py) * .6;
      }
      const u = (px - (cx - W / 2)) / W, v = (py - top) / H;
      const sx = clamp(1 - u, -.08, 1.08), sy = clamp(v, -.08, 1.08);
      if (!h.vis) { h.fx.reset(); h.fy.reset(); }
      h.x = h.fx(sx, dt); h.y = h.fy(sy, dt); h.t = now; h.vis = true;
      out[side] = { x: h.x, y: h.y, t: now };
    }
    // posisi badan: lebar bahu dibanding sisi panjang gambar (sama untuk kamera tegak maupun mendatar)
    const swn = swRaw * Math.min(1, aspect);
    const elbows = vis(13) > .3 || vis(14) > .3;
    st.framing = swn > .36 || (!elbows && swn > .24) ? 'close' : swn < .06 ? 'far' : (cx < .15 || cx > .85) ? 'edge' : (!st.L.vis && !st.R.vis) ? 'hands' : 'ok';
    const nose = lm[0];
    st.handsUp = st.L.vis && st.R.vis && vis(0) > .3 && lm[L.wrL].y < nose.y && lm[L.wrR].y < nose.y;
    return out;
  }
  return { st, process };
}

export function drawSkeleton(ctx, lm, W, H) {
  ctx.lineWidth = 4; ctx.strokeStyle = '#7bd389'; ctx.lineCap = 'round';
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(lm[a].x * W, lm[a].y * H); ctx.lineTo(lm[b].x * W, lm[b].y * H); ctx.stroke(); };
  [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]].forEach(([a, b]) => seg(a, b));
  ctx.fillStyle = '#ffd166';
  [15, 16].forEach((i) => { ctx.beginPath(); ctx.arc(lm[i].x * W, lm[i].y * H, 9, 0, Math.PI * 2); ctx.fill(); });
}
