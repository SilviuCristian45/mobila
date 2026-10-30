// Texturi procedurale: (parametri rezolvați) → pixeli RGBA, deterministe (fără Math.random), fără DOM sau Three.
// Texturile sunt TILEABILE: modulul acoperă un număr întreg de piese/perioade, deci repetiția nu are cusături vizibile.
// Același material cu aceiași parametri ⇒ aceiași octeți (hash verificat în teste); scara și rotația NU intră aici (sunt în UV).
import { stableHash } from '@/domain';
import type { ResolvedTexture } from '@/domain';

export interface TextureData {
  width: number;
  height: number;
  /** RGBA, rând cu rând de sus în jos. */
  data: Uint8Array;
  /** Extinderea în lume a unui modul de textură, în mm (UV = poziție în lume / aceste valori). */
  worldWidthMm: number;
  worldHeightMm: number;
}

export const TEXTURE_PX = 256;

// ───────────── zgomot determinist ─────────────

/** Hash întreg 32 biți → [0, 1). */
function h3(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Zgomot de valoare, periodic pe [0, px) × [0, py) (perioade în celule). */
function vnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const fx = smooth(x - x0),
    fy = smooth(y - y0);
  const m = (v: number, p: number) => ((v % p) + p) % p;
  const a = h3(m(x0, px), m(y0, py), seed);
  const b = h3(m(x0 + 1, px), m(y0, py), seed);
  const c = h3(m(x0, px), m(y0 + 1, py), seed);
  const d = h3(m(x0 + 1, px), m(y0 + 1, py), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Zgomot fractal (3 octave), periodic pe [0,1)² cu `period` celule la octava de bază. */
function fbm(u: number, v: number, period: number, seed: number): number {
  let sum = 0,
    amp = 0.5,
    norm = 0,
    p = period;
  for (let o = 0; o < 3; o++) {
    sum += amp * vnoise(u * p, v * p, p, p, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

// ───────────── culori ─────────────

type Rgb = [number, number, number];
const hexRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const mul = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

/** Dimensiunea lumii (mm) pe care o acoperă un modul de textură, și structura lui (coloane × rânduri de piese). */
export function textureLayout(t: ResolvedTexture): {
  worldW: number;
  worldH: number;
  cols: number;
  rows: number;
} {
  if (t.pattern === 'tile_grid' || t.pattern === 'marble_tile') {
    const pw = t.pieceWidthMm + t.groutMm;
    const ph = t.pieceHeightMm + t.groutMm;
    const cols = Math.max(1, Math.min(6, Math.round(1200 / pw)));
    let rows = Math.max(1, Math.min(6, Math.round(1200 / ph)));
    const step = t.offsetPct === 33 ? 3 : t.offsetPct === 50 ? 2 : 1;
    rows = Math.max(step, Math.ceil(rows / step) * step);
    return { worldW: cols * pw, worldH: rows * ph, cols, rows };
  }
  if (t.pattern === 'plank') {
    const rows = Math.max(6, Math.min(20, Math.round(2000 / t.pieceWidthMm)));
    // două scânduri pe rând și perioadă: modulul e de 2 lungimi, deci tonurile nu se repetă la fiecare lungime de scândură
    return { worldW: 2 * t.pieceHeightMm, worldH: rows * t.pieceWidthMm, cols: 2, rows };
  }
  return { worldW: t.pieceWidthMm, worldH: t.pieceHeightMm, cols: 1, rows: 1 };
}

/** Cheia unei texturi de bază (fără scară/rotație): aceeași cheie ⇒ aceeași textură partajată. */
export function textureKey(t: ResolvedTexture, baseHex: string): string {
  return `t${stableHash({
    p: t.pattern,
    g: t.groutColorHex,
    o: t.offsetPct,
    v: t.toneVariation,
    s: t.seed,
    w: t.pieceWidthMm,
    h: t.pieceHeightMm,
    r: t.groutMm,
    c: baseHex,
  })}`;
}

export function generateTexture(t: ResolvedTexture, baseHex: string, px = TEXTURE_PX): TextureData {
  const L = textureLayout(t);
  const data = new Uint8Array(px * px * 4);
  const base = hexRgb(baseHex);
  const accent = hexRgb(t.groutColorHex);
  const tone = t.toneVariation;
  const put = (x: number, y: number, c: Rgb) => {
    const o = (y * px + x) * 4;
    data[o] = Math.max(0, Math.min(255, Math.round(c[0])));
    data[o + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
    data[o + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
    data[o + 3] = 255;
  };
  const mmX = L.worldW / px; // mm per pixel
  const mmY = L.worldH / px;
  const seed = t.seed | 0;

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px;
      const v = (y + 0.5) / px;
      const xm = u * L.worldW;
      const ym = v * L.worldH;
      let c: Rgb = base;

      if (t.pattern === 'tile_grid' || t.pattern === 'marble_tile') {
        const pw = t.pieceWidthMm + t.groutMm;
        const ph = t.pieceHeightMm + t.groutMm;
        const row = Math.floor(ym / ph);
        const off =
          t.offsetPct === 0 ? 0 : (row % (t.offsetPct === 33 ? 3 : 2)) * (t.offsetPct / 100) * pw;
        const xs = (((xm - off) % L.worldW) + L.worldW) % L.worldW;
        const col = Math.floor(xs / pw);
        const lx = xs - col * pw;
        const ly = ym - row * ph;
        const gx = Math.max(t.groutMm, mmX * 1.2);
        const gy = Math.max(t.groutMm, mmY * 1.2);
        const inGrout = lx > pw - gx || ly > ph - gy;
        const rnd = h3(col, row, seed);
        let tile = mul(base, 1 + (rnd - 0.5) * 2 * tone * 0.14);
        if (t.pattern === 'marble_tile') {
          // vene: creastă de zgomot cu deformare, cu decalaj aleatoriu pe fiecare placă
          const ox = h3(col, row, seed + 7) * 40;
          const oy = h3(col, row, seed + 13) * 40;
          const wu = lx / pw,
            wv = ly / ph;
          const warp = vnoise(wu * 3 + ox, wv * 3 + oy, 1000, 1000, seed + 3) * 1.6;
          const n = vnoise(wu * 4 + warp + ox, wv * 4 + warp * 0.7 + oy, 1000, 1000, seed + 5);
          const vein = Math.pow(1 - Math.abs(n * 2 - 1), 9);
          tile = mix(tile, accent, Math.min(0.75, vein * (0.5 + tone)));
          tile = mul(
            tile,
            1 + (vnoise(wu * 9 + ox, wv * 9 + oy, 1000, 1000, seed + 9) - 0.5) * 0.05,
          );
        } else {
          tile = mul(tile, 1 + (fbm(u, v, 6, seed) - 0.5) * 0.04 * (0.5 + tone));
        }
        c = inGrout ? accent : tile;
      } else if (t.pattern === 'plank') {
        const bw = t.pieceWidthMm;
        const row = Math.floor(ym / bw);
        const ly = ym - row * bw;
        const Lp = t.pieceHeightMm;
        const shift =
          t.offsetPct === 0
            ? h3(row, 5, seed) * L.worldW
            : (row % (t.offsetPct === 33 ? 3 : 2)) * (t.offsetPct / 100) * Lp;
        const xs = (((xm - shift) % L.worldW) + L.worldW) % L.worldW; // poziția în modul, de la capătul unei scânduri
        const which = Math.floor(xs / Lp); // scândura 0 sau 1 din rând (periodic)
        const xl = xs - which * Lp; // poziția în lungimea scândurii
        const board = h3(row, which, seed + 1);
        let tile = mul(base, 1 + (board - 0.5) * 2 * tone * 0.2);
        // fibre: anizotrop — variație lentă pe lungime, rapidă pe lățime, cu fază proprie scândurii
        const ph = board * 50;
        const grain =
          vnoise((xl / Lp) * 3 + ph, (ly / bw) * 14 + row * 3, 1000, 1000, seed + 2) - 0.5;
        const fine =
          vnoise((xl / Lp) * 6 + ph, (ly / bw) * 60 + row * 9, 1000, 1000, seed + 4) - 0.5;
        tile = mul(tile, 1 + grain * 0.16 * (0.6 + tone) + fine * 0.05);
        const seam = Math.max(1.0 * mmY, 0.9);
        const endSeam = xl < 1.2 * mmX || ly < seam || ly > bw - seam;
        c = endSeam ? mix(tile, accent, 0.65) : tile;
      } else if (t.pattern === 'speckle') {
        const n = fbm(u, v, 4, seed);
        const fine = h3(x, y, seed + 17);
        let col = mul(base, 1 + (n - 0.5) * (0.12 + 0.3 * tone) + (fine - 0.5) * 0.04);
        if (fine > 0.9965) col = mix(col, accent, 0.7); // pori / granule
        c = col;
      } else if (t.pattern === 'flagstone') {
        // Voronoi periodic 4×4 celule: fiecare lespede are ton propriu, rosturile sunt între celule
        const N = 4;
        const gx = u * N,
          gy = v * N;
        const cx = Math.floor(gx),
          cy = Math.floor(gy);
        let d1 = 9,
          d2 = 9,
          id = 0;
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const wx = (((cx + i) % N) + N) % N,
              wy = (((cy + j) % N) + N) % N;
            const px2 = cx + i + h3(wx, wy, seed) * 0.8 + 0.1;
            const py2 = cy + j + h3(wx, wy, seed + 1) * 0.8 + 0.1;
            const d = Math.hypot(gx - px2, gy - py2);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              id = wx * 17 + wy;
            } else if (d < d2) d2 = d;
          }
        const tile = mul(base, 1 + (h3(id, 3, seed + 2) - 0.5) * 2 * tone * 0.16);
        const grainy = mul(tile, 1 + (fbm(u, v, 8, seed + 6) - 0.5) * 0.12);
        c = d2 - d1 < 0.045 ? accent : grainy;
      } else if (t.pattern === 'wallpaper') {
        // motiv discret: romb + punct, perioadă = un modul
        const fu = u * 2 - Math.floor(u * 2),
          fv = v * 2 - Math.floor(v * 2);
        const d = Math.abs(fu - 0.5) + Math.abs(fv - 0.5);
        const ring = Math.max(0, 1 - Math.abs(d - 0.34) * 22);
        const dot = Math.max(0, 1 - Math.hypot(fu - 0.5, fv - 0.5) * 14);
        let col = mix(base, accent, Math.min(0.45, ring * 0.35 + dot * 0.45));
        col = mul(col, 1 + (h3(x, y, seed) - 0.5) * 0.025);
        c = col;
      } else {
        // brushed: striuri orizontale fine
        const rowNoise = h3(y, 0, seed) - 0.5;
        const slow = vnoise(u * 5, y * 0.15, 5, 1000, seed + 3) - 0.5;
        c = mul(base, 1 + rowNoise * 0.07 * (0.5 + tone) + slow * 0.05);
      }
      put(x, y, c);
    }
  }
  return { width: px, height: px, data, worldWidthMm: L.worldW, worldHeightMm: L.worldH };
}

/** Amprentă a conținutului (pentru teste de determinism). */
export function textureHash(td: TextureData): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < td.data.length; i++) {
    h ^= td.data[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
