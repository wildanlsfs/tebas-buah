// Simpanan di HP/laptop ini saja.
const KEY = 'tebas.save';
const fresh = () => ({ best: {}, stars: {}, input: 'touch', tutorial: false, totals: { fruits: 0, meters: 0, seconds: 0 } });
export function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh(); } }
export function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export const MODES = [
  { id: 'klasik', name: 'Klasik', emoji: '🍉', time: 60, lives: 3, stars: [300, 650, 1000], short: '60 dtk · 3 nyawa', desc: '60 detik. Tebas buah, hindari batu (3 nyawa).' },
  { id: 'santai', name: 'Santai', emoji: '🌿', time: 90, lives: 0, stars: [400, 800, 1200], short: '90 dtk · tanpa batu', desc: '90 detik tanpa batu. Pas untuk pemanasan.' },
  { id: 'kilat', name: 'Kilat', emoji: '⚡', time: 45, lives: 3, stars: [400, 800, 1200], short: '45 dtk · cepat!', desc: 'Buah lebih banyak dan lebih cepat. Siap?' },
];
export const modeById = Object.fromEntries(MODES.map((m) => [m.id, m]));
export const starsFor = (mode, score) => mode.stars.filter((t) => score >= t).length;
