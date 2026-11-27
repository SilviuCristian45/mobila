// Rețete parametrice versionate (ARCHITECTURE §6, DATA_MODEL §5): (dimensiuni, parametri) → părți primitive.
// Fiecare rețetă acoperă EXACT cutia w × h × d (testat la min/implicit/max pentru fiecare item). Parametrii lipsă iau
// valorile implicite ale rețetei, deci un document poate omite chei. Lungimile interne sunt în metri.
import { builder, type Builder, type Params, type Part, type Size3 } from './parts';

export interface Recipe {
  id: string;
  version: number;
  build: (size: Size3, params: Params) => Part[];
}

const num = (p: Params, k: string, d: number): number => {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
};
const int = (p: Params, k: string, d: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(num(p, k, d))));
const str = (p: Params, k: string, d: string): string => {
  const v = p[k];
  return typeof v === 'string' ? v : d;
};
const bool = (p: Params, k: string, d: boolean): boolean => {
  const v = p[k];
  return typeof v === 'boolean' ? v : d;
};
const lim = (v: number, max: number): number => Math.min(v, max);

// ───────────── canapea / fotoliu ─────────────

function sofaParts(w: number, h: number, d: number, seats: number, arms: boolean, layout: string) {
  const b = builder(w, h, d);
  const leg = lim(0.1, h * 0.18);
  const baseTop = h * 0.5;
  const back = lim(0.24, d * 0.3);
  const aw = arms ? lim(0.14, w * 0.16) : 0;
  const corner = layout === 'corner-left' || layout === 'corner-right';
  const left = layout === 'corner-left';
  const mainD = corner ? d * 0.55 : d;
  const cw = corner ? lim(w * 0.34, 1.1) : 0; // lățimea șezlongului
  const cx0 = left ? 0 : w - cw;
  const cx1 = left ? cw : w;

  b.box(0, leg, 0, w, baseTop, mainD, 'body');
  if (corner) b.box(cx0, leg, mainD, cx1, baseTop, d, 'body');
  b.box(0, baseTop, 0, w, h, back, 'accent'); // spătar

  // brațe: pe toată adâncimea părții pe care stau
  const armTop = h * 0.72;
  if (arms) {
    const depthAt = (atLeft: boolean) => (corner && atLeft === left ? d : mainD);
    b.box(0, leg, 0, aw, armTop, depthAt(true), 'accent');
    b.box(w - aw, leg, 0, w, armTop, depthAt(false), 'accent');
  }
  // perne de șezut pe lățimea utilă (fără șezlong)
  const x0 = aw + (corner && left ? cw : 0);
  const x1 = w - aw - (corner && !left ? cw : 0);
  const cushionW = (x1 - x0) / seats;
  const gap = 0.01;
  for (let i = 0; i < seats; i++)
    b.box(
      x0 + i * cushionW + gap / 2,
      baseTop,
      back,
      x0 + (i + 1) * cushionW - gap / 2,
      baseTop + lim(0.1, h * 0.2),
      mainD,
      'light',
    );
  if (corner) b.box(cx0, baseTop, mainD, cx1, baseTop + lim(0.1, h * 0.2), d, 'light');
  // picioare
  const s = lim(0.06, w * 0.05);
  for (const [x, z] of [
    [0, 0],
    [w - s, 0],
    [0, d - s],
    [w - s, d - s],
  ] as const)
    b.box(x, 0, z, x + s, leg, z + s, 'dark');
  return b.parts;
}

const sofa: Recipe = {
  id: 'sofa',
  version: 1,
  build: ([w, h, d], p) =>
    sofaParts(
      w,
      h,
      d,
      int(p, 'seats', 3, 1, 6),
      bool(p, 'armrests', true),
      str(p, 'layout', 'straight'),
    ),
};
const armchair: Recipe = {
  id: 'armchair',
  version: 1,
  build: ([w, h, d], p) => sofaParts(w, h, d, 1, bool(p, 'armrests', true), 'straight'),
};

// ───────────── mese ─────────────

const table: Recipe = {
  id: 'table',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const shape = str(p, 'shape', 'rectangular');
    const legs = str(p, 'legs', 'legs');
    const t = lim(0.04, h * 0.2);
    const round = shape !== 'rectangular';
    if (round) b.cyl(0, h - t, 0, w, h, d, 'body');
    else b.box(0, h - t, 0, w, h, d, 'body');
    if (legs === 'pedestal') {
      const r = lim(0.09, Math.min(w, d) * 0.15);
      b.cyl(w / 2 - r, 0.0, d / 2 - r, w / 2 + r, h - t, d / 2 + r, 'dark');
      b.cyl(
        w / 2 - 2.2 * r,
        0,
        d / 2 - 2.2 * r,
        w / 2 + 2.2 * r,
        lim(0.03, h * 0.08),
        d / 2 + 2.2 * r,
        'dark',
      );
    } else {
      const s = lim(0.055, Math.min(w, d) * 0.08);
      const inset = round ? Math.min(w, d) * 0.14 : 0.02;
      for (const x of [inset, w - inset - s])
        for (const z of [inset, d - inset - s]) b.box(x, 0, z, x + s, h - t, z + s, 'dark');
    }
    return b.parts;
  },
};

const stool: Recipe = {
  id: 'stool',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const round = str(p, 'shape', 'round') === 'round';
    const seat = lim(0.12, h * 0.3);
    if (round) {
      b.cyl(0, h - seat, 0, w, h, d, 'body');
      b.cyl(w * 0.08, 0, d * 0.08, w * 0.92, h - seat, d * 0.92, 'dark');
    } else {
      b.box(0, h - seat, 0, w, h, d, 'body');
      b.box(w * 0.08, 0, d * 0.08, w * 0.92, h - seat, d * 0.92, 'dark');
    }
    return b.parts;
  },
};

// ───────────── scaune ─────────────

const chair: Recipe = {
  id: 'chair',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const back = bool(p, 'backrest', true);
    const upholstered = bool(p, 'upholstered', false);
    const st = lim(0.04, h * 0.1);
    const seatY = back ? h * 0.5 : h - st; // fără spătar, scaunul devine un taburet cu înălțimea cerută
    const s = lim(0.04, w * 0.1);
    for (const x of [0, w - s])
      for (const z of [0, d - s]) b.box(x, 0, z, x + s, seatY, z + s, 'dark');
    b.box(0, seatY, 0, w, seatY + st, d, upholstered ? 'accent' : 'body');
    if (back) {
      b.box(0, seatY + st, 0, s, h, s, 'dark');
      b.box(w - s, seatY + st, 0, w, h, s, 'dark');
      b.box(
        0,
        h - lim(0.1, h * 0.14),
        0,
        w,
        h,
        lim(0.04, d * 0.1),
        upholstered ? 'accent' : 'body',
      );
    }
    return b.parts;
  },
};

const officeChair: Recipe = {
  id: 'office-chair',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const arms = bool(p, 'armrests', true);
    const seatY = h * 0.45;
    const st = lim(0.08, h * 0.1);
    const sw = w * 0.8;
    // stea cu cinci brațe ≈ două bare încrucișate + rotile
    const bar = lim(0.06, w * 0.1);
    b.box(0, 0.03, d / 2 - bar / 2, w, 0.03 + bar * 0.6, d / 2 + bar / 2, 'dark');
    b.box(w / 2 - bar / 2, 0.03, 0, w / 2 + bar / 2, 0.03 + bar * 0.6, d, 'dark');
    for (const [x, z] of [
      [0, d / 2],
      [w, d / 2],
      [w / 2, 0],
      [w / 2, d],
    ] as const)
      b.cyl(
        Math.max(0, x - 0.03),
        0,
        Math.max(0, z - 0.03),
        Math.min(w, x + 0.03),
        0.06,
        Math.min(d, z + 0.03),
        'dark',
      );
    b.cyl(w / 2 - 0.03, 0.06, d / 2 - 0.03, w / 2 + 0.03, seatY, d / 2 + 0.03, 'metal');
    const x0 = (w - sw) / 2;
    b.box(x0, seatY, d * 0.05, x0 + sw, seatY + st, d * 0.95, 'body');
    b.box(x0, seatY + st, 0, x0 + sw, h, lim(0.08, d * 0.16), 'body');
    if (arms) {
      b.box(x0 - 0.0, seatY + st, d * 0.2, x0 + 0.04, seatY + st + 0.2, d * 0.75, 'dark');
      b.box(x0 + sw - 0.04, seatY + st, d * 0.2, x0 + sw, seatY + st + 0.2, d * 0.75, 'dark');
    }
    return b.parts;
  },
};

// ───────────── corpuri (dulap, comodă, bucătărie) ─────────────

/** Corp cu fronturi (uși/sertare) sau deschis; opțional blat, chiuvetă integrată și decalaj de blat (insulă). */
function cabinetParts(w: number, h: number, d: number, p: Params): Part[] {
  const b = builder(w, h, d);
  const fronts = int(p, 'fronts', 2, 1, 8);
  const kind = str(p, 'frontType', 'doors');
  const base = str(p, 'base', 'plinth');
  const worktop = bool(p, 'worktop', false);
  const sink = worktop && bool(p, 'sink', false);
  const handles = bool(p, 'handles', true);
  const overhang = worktop ? Math.min(num(p, 'overhangMm', 0) / 1000, d * 0.4) : 0;

  const baseH = base === 'none' ? 0 : lim(base === 'legs' ? 0.15 : 0.1, h * 0.25);
  const topT = worktop ? lim(0.04, h * 0.1) : 0;
  const carcassTop = h - topT;
  const carcassD = d - overhang;
  const frontT = lim(0.02, carcassD * 0.1);
  const handleT = handles ? lim(0.012, frontT) : 0;
  const gap = 0.004;
  const shellT = lim(0.018, w * 0.1);

  // picioare / soclu
  if (base === 'plinth') b.box(0.02, 0, 0.02, w - 0.02, baseH, carcassD - frontT - 0.03, 'dark');
  else if (base === 'legs') {
    const s = lim(0.04, w * 0.06);
    for (const x of [0.02, w - 0.02 - s])
      for (const z of [0.02, carcassD - 0.02 - s]) b.box(x, 0, z, x + s, baseH, z + s, 'dark');
  }

  if (kind === 'open') {
    // etajeră deschisă: pereți laterali, fund, plafon, spate și rafturi
    b.box(0, baseH, 0, shellT, carcassTop, carcassD, 'body');
    b.box(w - shellT, baseH, 0, w, carcassTop, carcassD, 'body');
    b.box(shellT, baseH, 0, w - shellT, baseH + shellT, carcassD, 'body');
    b.box(shellT, carcassTop - shellT, 0, w - shellT, carcassTop, carcassD, 'body');
    b.box(shellT, baseH, 0, w - shellT, carcassTop, 0.01, 'accent');
    const inner = carcassTop - shellT - (baseH + shellT);
    for (let i = 1; i < fronts; i++) {
      const y = baseH + shellT + (inner * i) / fronts;
      b.box(shellT, y - shellT / 2, 0.01, w - shellT, y + shellT / 2, carcassD - 0.01, 'body');
    }
  } else {
    // carcasă plină, cu un strat subțire de față pentru fronturi
    b.box(0, baseH, 0, w, carcassTop, carcassD - frontT - handleT, 'body');
    const fz0 = carcassD - frontT - handleT;
    const fz1 = carcassD - handleT;
    const hz = carcassD;
    if (kind === 'drawers') {
      const rowH = (carcassTop - baseH) / fronts;
      for (let i = 0; i < fronts; i++) {
        const y0 = baseH + i * rowH + gap / 2;
        const y1 = baseH + (i + 1) * rowH - gap / 2;
        b.box(gap / 2, y0, fz0, w - gap / 2, y1, fz1, 'accent');
        if (handles) {
          const hw = lim(0.16, w * 0.4);
          b.box(
            w / 2 - hw / 2,
            (y0 + y1) / 2 - 0.008,
            fz1,
            w / 2 + hw / 2,
            (y0 + y1) / 2 + 0.008,
            hz,
            'metal',
          );
        }
      }
    } else {
      const colW = w / fronts;
      for (let i = 0; i < fronts; i++) {
        const x0 = i * colW + gap / 2;
        const x1 = (i + 1) * colW - gap / 2;
        b.box(x0, baseH + gap / 2, fz0, x1, carcassTop - gap / 2, fz1, 'accent');
        if (handles) {
          const hy = baseH + (carcassTop - baseH) * (h > 1.2 ? 0.5 : 0.5);
          const hx = i % 2 === 0 ? x1 - 0.05 : x0 + 0.05; // mânerele se întâlnesc pe perechi
          b.box(hx - 0.008, hy - 0.08, fz1, hx + 0.008, hy + 0.08, hz, 'metal');
        }
      }
    }
  }

  // blat (cu decalaj în față) și chiuvetă integrată (inel de blat + fund întunecat)
  if (worktop) {
    if (!sink) b.box(0, carcassTop, 0, w, h, d, 'wood');
    else {
      const bw = lim(w * 0.55, 0.9);
      const bd = lim(d * 0.55, 0.4);
      const x0 = (w - bw) / 2;
      const z0 = (d - bd) / 2;
      b.box(0, carcassTop, 0, w, h, z0, 'wood');
      b.box(0, carcassTop, z0 + bd, w, h, d, 'wood');
      b.box(0, carcassTop, z0, x0, h, z0 + bd, 'wood');
      b.box(x0 + bw, carcassTop, z0, w, h, z0 + bd, 'wood');
      b.box(x0, carcassTop, z0, x0 + bw, carcassTop + topT * 0.3, z0 + bd, 'metal'); // fundul chiuvetei
    }
  }
  return b.parts;
}

const cabinet: Recipe = {
  id: 'cabinet',
  version: 1,
  build: ([w, h, d], p) => cabinetParts(w, h, d, p),
};

// ───────────── bibliotecă și raft de perete ─────────────

const bookcase: Recipe = {
  id: 'bookcase',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const shelves = int(p, 'shelves', 4, 1, 10);
    const back = bool(p, 'back', true);
    const t = lim(0.025, w * 0.05);
    b.box(0, 0, 0, t, h, d, 'body');
    b.box(w - t, 0, 0, w, h, d, 'body');
    b.box(t, 0, 0, w - t, t, d, 'body');
    b.box(t, h - t, 0, w - t, h, d, 'body');
    if (back) b.box(t, t, 0, w - t, h - t, 0.01, 'accent');
    const inner = h - 2 * t;
    for (let i = 1; i < shelves; i++) {
      const y = t + (inner * i) / shelves;
      b.box(t, y - t / 2, back ? 0.01 : 0, w - t, y + t / 2, d, 'body');
    }
    return b.parts;
  },
};

const wallShelf: Recipe = {
  id: 'wall-shelf',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const boards = int(p, 'boards', 2, 1, 4);
    const brackets = bool(p, 'brackets', true);
    // un singur raft fără console = placă plină pe toată înălțimea (cutia rămâne exactă)
    const t = boards === 1 && !brackets ? h : lim(0.03, h / (boards * 2));
    for (let i = 0; i < boards; i++) {
      const y = boards === 1 ? h - t : (i * (h - t)) / (boards - 1);
      b.box(0, y, 0, w, y + t, d, 'body');
    }
    if (brackets)
      for (const x of [w * 0.1, w * 0.9 - 0.02]) b.box(x, 0, 0, x + 0.02, h - t, 0.02, 'metal');
    return b.parts;
  },
};

// ───────────── pat ─────────────

const bed: Recipe = {
  id: 'bed',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const type = str(p, 'type', 'platform');
    const head = str(p, 'headboard', 'high');
    const legH = type === 'frame' ? lim(0.2, h * 0.3) : 0;
    const mattressTop = head === 'none' ? h : h * 0.6;
    const mt = lim(0.22, (mattressTop - legH) * 0.6);
    const frameTop = mattressTop - mt;
    if (type === 'frame') {
      const s = lim(0.06, w * 0.05);
      for (const x of [0, w - s])
        for (const z of [0, d - s]) b.box(x, 0, z, x + s, legH, z + s, 'dark');
    }
    b.box(0, legH, 0, w, frameTop, d, 'wood');
    b.box(0.02, frameTop, 0.02, w - 0.02, mattressTop, d - 0.02, 'light');
    if (head !== 'none') b.box(0, legH, 0, w, h, lim(0.06, d * 0.05), 'body');
    return b.parts;
  },
};

// ───────────── birou ─────────────

const desk: Recipe = {
  id: 'desk',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const drawers = str(p, 'drawers', 'right');
    const legs = str(p, 'legs', 'legs');
    const t = lim(0.03, h * 0.08);
    b.box(0, h - t, 0, w, h, d, 'wood');
    const s = lim(0.05, w * 0.05);
    const dw = drawers === 'none' ? 0 : lim(0.45, w * 0.35);
    const leftSolid = drawers === 'left';
    const rightSolid = drawers === 'right';
    const post = (x0: number, x1: number, solid: boolean) => {
      if (solid) {
        b.box(x0, 0, 0, x1, h - t, d, 'body');
        const n = 3;
        const rh = (h - t - 0.05) / n;
        for (let i = 0; i < n; i++)
          b.box(
            x0 + 0.01,
            0.03 + i * rh + 0.004,
            d - 0.02,
            x1 - 0.01,
            0.03 + (i + 1) * rh - 0.004,
            d,
            'accent',
          );
      } else if (legs === 'panels')
        b.box(x0, 0, 0.02, Math.min(x0 + 0.03, x1), h - t, d - 0.02, 'body');
      else for (const z of [0.02, d - 0.02 - s]) b.box(x0, 0, z, x0 + s, h - t, z + s, 'dark');
    };
    post(0, leftSolid ? dw : s, leftSolid);
    post(rightSolid ? w - dw : w - s, w, rightSolid);
    return b.parts;
  },
};

// ───────────── blat (suprafață de lucru) ─────────────

const countertop: Recipe = {
  id: 'countertop',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const corner = str(p, 'corner', 'straight');
    if (corner === 'straight') b.box(0, 0, 0, w, h, d, 'wood');
    else {
      const arm = lim(0.6, d);
      b.box(0, 0, 0, w, h, arm, 'wood');
      if (corner === 'corner-left') b.box(0, 0, arm, arm, h, d, 'wood');
      else b.box(w - arm, 0, arm, w, h, d, 'wood');
    }
    return b.parts;
  },
};

// ───────────── electrocasnice ─────────────

const fridge: Recipe = {
  id: 'fridge',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const layout = str(p, 'freezer', 'bottom');
    const handles = bool(p, 'handles', true);
    const ft = lim(0.03, d * 0.08);
    const hT = handles ? 0.012 : 0; // grosimea mânerelor: fața ușilor ajunge la adâncimea totală fără ele
    b.box(0, 0, 0, w, h, d - ft - hT, 'body');
    const z0 = d - ft - hT;
    const z1 = d - hT;
    const gap = 0.004;
    if (layout === 'none') {
      b.box(gap, gap, z0, w - gap, h - gap, z1, 'light');
      if (handles) b.box(w - 0.06, h * 0.45, z1, w - 0.04, h * 0.75, d, 'metal');
      return b.parts;
    }
    const split = layout === 'top' ? h * 0.72 : h * 0.3; // linia de despărțire
    b.box(gap, gap, z0, w - gap, split - gap, z1, 'light');
    b.box(gap, split + gap, z0, w - gap, h - gap, z1, 'light');
    if (handles) {
      const x = w - 0.06;
      b.box(x, Math.max(0.05, split - 0.35), z1, x + 0.02, split - 0.05, d, 'metal');
      b.box(x, split + 0.05, z1, x + 0.02, Math.min(h - 0.05, split + 0.4), d, 'metal');
    }
    return b.parts;
  },
};

const oven: Recipe = {
  id: 'oven',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const knobs = bool(p, 'knobs', true);
    const ft = lim(0.02, d * 0.06);
    const z0 = d - ft - 0.01;
    b.box(0, 0, 0, w, h, z0, 'body');
    b.box(0, 0, z0, w, h, d - 0.01, 'metal');
    const panel = lim(0.1, h * 0.18);
    b.box(0.03, h * 0.12, d - 0.01, w - 0.03, h - panel - 0.02, d, 'dark'); // geam
    b.box(0.06, h - panel, d - 0.01, w - 0.06, h - panel + 0.012, d, 'metal');
    if (knobs)
      for (let i = 0; i < 4; i++) {
        const cx = w * (0.2 + (i * 0.6) / 3);
        b.cyl(cx - 0.015, h - panel * 0.85, d - 0.01, cx + 0.015, h - panel * 0.15, d, 'dark', {
          axis: 'z',
        });
      }
    return b.parts;
  },
};

const cooktop: Recipe = {
  id: 'cooktop',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const burners = int(p, 'burners', 4, 2, 5);
    const body = h * 0.8;
    b.box(0, 0, 0, w, body, d, 'dark');
    const cols = burners <= 2 ? 2 : burners === 4 ? 2 : 3;
    const rows = burners <= 3 ? 1 : 2;
    const cells = cols * rows;
    let placed = 0;
    for (let i = 0; i < cells && placed < burners; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const cw = w / cols;
      const cd = d / rows;
      const rad = lim(0.09, Math.min(cw, cd) * 0.36);
      const cx = cw * (c + 0.5);
      const cz = cd * (r + 0.5);
      b.cyl(cx - rad, body, cz - rad, cx + rad, h, cz + rad, 'metal');
      placed++;
    }
    return b.parts;
  },
};

const washer: Recipe = {
  id: 'washer',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const top = bool(p, 'loadFromTop', false);
    if (top) {
      b.box(0, 0, 0, w, h - 0.01, d, 'body');
      b.box(w * 0.1, h - 0.01, d * 0.1, w * 0.9, h, d * 0.9, 'metal'); // capac
      b.box(0, h - 0.01, 0, w, h, d * 0.1, 'body');
      b.box(0, h - 0.01, d * 0.9, w, h, d, 'body');
      b.box(0, h - 0.01, d * 0.1, w * 0.1, h, d * 0.9, 'body');
      b.box(w * 0.9, h - 0.01, d * 0.1, w, h, d * 0.9, 'body');
      return b.parts;
    }
    const ft = 0.02;
    b.box(0, 0, 0, w, h, d - ft, 'body');
    b.box(0.0, 0, d - ft, w, h, d, 'body');
    const rad = Math.min(w, h) * 0.34;
    const cx = w / 2;
    const cy = h * 0.46;
    b.cyl(cx - rad, cy - rad, d - 0.04, cx + rad, cy + rad, d, 'metal', { axis: 'z' });
    b.cyl(
      cx - rad * 0.78,
      cy - rad * 0.78,
      d - 0.035,
      cx + rad * 0.78,
      cy + rad * 0.78,
      d,
      'dark',
      { axis: 'z' },
    );
    b.box(w * 0.1, h * 0.86, d - 0.02, w * 0.9, h * 0.94, d, 'dark');
    return b.parts;
  },
};

const hood: Recipe = {
  id: 'hood',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const style = str(p, 'style', 'chimney');
    if (style === 'flat') {
      b.box(0, lim(0.01, h * 0.3), 0, w, h, d, 'metal');
      b.box(w * 0.05, 0, d * 0.05, w * 0.95, lim(0.01, h * 0.3), d * 0.95, 'dark'); // filtru
      return b.parts;
    }
    const lower = lim(0.15, h * 0.3);
    b.box(0, 0, 0, w, lower, d, 'metal');
    const cw = lim(0.3, w * 0.5);
    b.box((w - cw) / 2, lower, 0, (w + cw) / 2, h, d * 0.55, 'metal');
    return b.parts;
  },
};

// ───────────── sanitare ─────────────

const toilet: Recipe = {
  id: 'toilet',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const tank = str(p, 'tank', 'cistern');
    const seatY = h * 0.55;
    const tankD = tank === 'cistern' ? lim(0.2, d * 0.35) : 0;
    const bowlTop = tank === 'cistern' ? seatY : h; // fără rezervor aparent, vasul/placa ajunge la înălțimea totală
    // vas
    b.box(w * 0.05, 0, tankD, w * 0.95, seatY - 0.04, d, 'ceramic');
    b.cyl(0, seatY - 0.04, tankD, w, seatY, d, 'ceramic');
    if (tank === 'cistern') {
      b.box(w * 0.05, seatY - 0.04, 0, w * 0.95, h, tankD, 'ceramic');
    } else {
      b.box(w * 0.1, seatY, 0, w * 0.9, bowlTop, 0.06, 'ceramic'); // placa de acționare
    }
    return b.parts;
  },
};

const basin: Recipe = {
  id: 'basin',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const mount = str(p, 'mount', 'pedestal');
    const bowlH = lim(0.18, h * 0.5);
    const rim = lim(0.03, w * 0.08);
    const top = h;
    const bowlY0 = top - bowlH;
    // cuva: patru pereți + fund (interior întunecat)
    b.box(0, bowlY0, 0, w, top, rim, 'ceramic');
    b.box(0, bowlY0, d - rim, w, top, d, 'ceramic');
    b.box(0, bowlY0, rim, rim, top, d - rim, 'ceramic');
    b.box(w - rim, bowlY0, rim, w, top, d - rim, 'ceramic');
    b.box(rim, bowlY0, rim, w - rim, bowlY0 + 0.04, d - rim, 'dark');
    if (mount === 'pedestal') {
      const pw = lim(0.14, w * 0.35);
      b.box((w - pw) / 2, 0, d * 0.1, (w + pw) / 2, bowlY0, d * 0.5, 'ceramic');
    }
    return b.parts;
  },
};

const bathtub: Recipe = {
  id: 'bathtub',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const type = str(p, 'type', 'built-in');
    const feet = type === 'freestanding' ? lim(0.08, h * 0.15) : 0;
    const t = lim(0.06, Math.min(w, d) * 0.12);
    b.box(0, feet, 0, w, h, t, 'ceramic');
    b.box(0, feet, d - t, w, h, d, 'ceramic');
    b.box(0, feet, t, t, h, d - t, 'ceramic');
    b.box(w - t, feet, t, w, h, d - t, 'ceramic');
    b.box(t, feet, t, w - t, feet + (h - feet) * 0.3, d - t, 'ceramic');
    b.box(t, feet + (h - feet) * 0.3, t, w - t, feet + (h - feet) * 0.3 + 0.002, d - t, 'dark');
    if (feet > 0)
      for (const x of [0.06, w - 0.12])
        for (const z of [0.06, d - 0.12]) b.box(x, 0, z, x + 0.06, feet, z + 0.06, 'metal');
    return b.parts;
  },
};

const shower: Recipe = {
  id: 'shower',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const side = str(p, 'doorSide', 'right');
    const style = str(p, 'enclosure', 'corner');
    const trayH = lim(0.08, h * 0.08);
    const g = 0.008;
    b.box(0, 0, 0, w, trayH, d, 'ceramic');
    b.box(w * 0.4, trayH, d * 0.4, w * 0.6, trayH + 0.001, d * 0.6, 'dark');
    // panou de sticlă pe față și unul lateral; sprijin metalic pe colțuri
    b.box(0, trayH, d - g, w, h, d, 'glass');
    const sideX = side === 'right' ? 0 : w - g; // peretele lateral opus ușii
    b.box(sideX, trayH, 0, sideX + g, h, d, 'glass');
    if (style === 'corner') {
      const back = side === 'right' ? w - g : 0;
      b.box(back, trayH, 0, back + g, h, d, 'glass');
    }
    const post = 0.02;
    b.box(sideX === 0 ? 0 : w - post, trayH, d - post, sideX === 0 ? post : w, h, d, 'metal');
    b.box(
      side === 'right' ? w - post : 0,
      trayH,
      d - post,
      side === 'right' ? w : post,
      h,
      d,
      'metal',
    );
    return b.parts;
  },
};

// ───────────── iluminat și decor ─────────────

const floorLamp: Recipe = {
  id: 'floor-lamp',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const shade = str(p, 'shade', 'cone');
    const shadeH = lim(0.35, h * 0.3);
    const shadeY0 = h - shadeH;
    const base = Math.min(w, d) * 0.55;
    b.cyl((w - base) / 2, 0, (d - base) / 2, (w + base) / 2, 0.03, (d + base) / 2, 'dark');
    b.cyl(
      w / 2 - 0.012,
      0.03,
      d / 2 - 0.012,
      w / 2 + 0.012,
      shadeY0 + 0.05,
      d / 2 + 0.012,
      'metal',
    );
    if (shade === 'sphere') b.sph(0, shadeY0, 0, w, h, d, 'glow');
    else if (shade === 'cylinder') b.cyl(0, shadeY0, 0, w, h, d, 'glow');
    else b.cyl(0, shadeY0, 0, w, h, d, 'glow', { taper: 0.55 });
    return b.parts;
  },
};

const ceilingLight: Recipe = {
  id: 'ceiling-light',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const style = str(p, 'style', 'disc');
    if (style === 'pendant') {
      const shadeH = lim(0.25, h * 0.4);
      b.cyl(w / 2 - 0.05, h - 0.02, d / 2 - 0.05, w / 2 + 0.05, h, d / 2 + 0.05, 'dark');
      b.cyl(w / 2 - 0.006, shadeH, d / 2 - 0.006, w / 2 + 0.006, h - 0.02, d / 2 + 0.006, 'dark');
      b.cyl(0, 0, 0, w, shadeH, d, 'glow', { taper: 0.4 });
    } else if (style === 'square') {
      b.box(0, 0, 0, w, h, d, 'glow');
    } else {
      b.cyl(0, 0, 0, w, h, d, 'glow');
    }
    return b.parts;
  },
};

const mirror: Recipe = {
  id: 'mirror',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const shape = str(p, 'shape', 'rectangular');
    const frame = bool(p, 'frame', true);
    const t = frame ? lim(0.03, Math.min(w, h) * 0.1) : 0.004;
    const zf = Math.max(d - 0.003, d * 0.5); // fața cadrului; sticla iese 3 mm în față
    if (shape === 'rectangular') {
      b.box(0, 0, 0, w, h, zf, 'wood');
      b.box(t, t, zf, w - t, h - t, d, 'glass');
    } else {
      b.cyl(0, 0, 0, w, h, zf, 'wood', { axis: 'z' }); // rotund (w = h) sau oval (w ≠ h)
      b.cyl(t, t, zf, w - t, h - t, d, 'glass', { axis: 'z' });
    }
    return b.parts;
  },
};

const picture: Recipe = {
  id: 'picture',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const thick = str(p, 'frame', 'thin') === 'thick';
    const mat = bool(p, 'mat', true);
    const t = lim(thick ? 0.05 : 0.02, Math.min(w, h) * 0.12);
    b.box(0, 0, 0, w, h, d, 'dark');
    const m = mat ? lim(0.05, Math.min(w, h) * 0.12) : 0;
    b.box(t, t, d - 0.002, w - t, h - t, d, mat ? 'ceramic' : 'accent');
    if (mat) b.box(t + m, t + m, d - 0.0015, w - t - m, h - t - m, d, 'accent');
    return b.parts;
  },
};

const plant: Recipe = {
  id: 'plant',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const kind = str(p, 'kind', 'ficus');
    const potH = lim(0.3, h * 0.28);
    const potW = Math.min(w, d) * 0.6;
    const cx = w / 2,
      cz = d / 2;
    b.cyl(0, 0, 0, w, 0.02, d, 'dark'); // farfurie: dă plantei amprenta w × d
    b.cyl(cx - potW / 2, 0.02, cz - potW / 2, cx + potW / 2, potH, cz + potW / 2, 'body', {
      taper: 1.15,
    });
    b.cyl(
      cx - potW * 0.46,
      potH - 0.01,
      cz - potW * 0.46,
      cx + potW * 0.46,
      potH + 0.015,
      cz + potW * 0.46,
      'soil',
    );
    if (kind === 'cactus') {
      b.cyl(cx - w * 0.14, potH, cz - d * 0.14, cx + w * 0.14, h, cz + d * 0.14, 'foliage', {
        taper: 0.8,
      });
      b.cyl(
        0,
        potH + (h - potH) * 0.35,
        cz - d * 0.05,
        cx - w * 0.14,
        potH + (h - potH) * 0.35 + lim(0.12, (h - potH) * 0.2),
        cz + d * 0.05,
        'foliage',
        { axis: 'x' },
      );
      b.cyl(
        cx + w * 0.14,
        potH + (h - potH) * 0.55,
        cz - d * 0.05,
        w,
        potH + (h - potH) * 0.55 + lim(0.12, (h - potH) * 0.2),
        cz + d * 0.05,
        'foliage',
        { axis: 'x' },
      );
    } else if (kind === 'palm') {
      b.cyl(cx - 0.02, potH, cz - 0.02, cx + 0.02, h * 0.72, cz + 0.02, 'soil');
      b.sph(0, h * 0.62, 0, w, h, d, 'foliage');
    } else {
      b.cyl(cx - 0.02, potH, cz - 0.02, cx + 0.02, h * 0.55, cz + 0.02, 'soil');
      b.sph(0, h * 0.4, 0, w, h, d, 'foliage');
      b.sph(w * 0.15, h * 0.3, d * 0.1, w * 0.85, h * 0.85, d * 0.9, 'foliage');
    }
    return b.parts;
  },
};

// ───────────── exterior: fundație, garduri, porți, parcare, garaj, hală, copaci, mașini ─────────────

const foundation: Recipe = {
  id: 'foundation',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const style = str(p, 'style', 'slab');
    const stairs = bool(p, 'stairs', true);
    const footingH = lim(0.12, h * 0.35);
    const stepD = stairs ? lim(0.6, d * 0.18) : 0;
    const slabD = d - stepD;
    // talpă/bază pe toată amprenta w × d
    b.box(0, 0, 0, w, footingH, d, 'dark');
    // placa principală de beton
    const deckT = style === 'terrace' ? lim(0.05, (h - footingH) * 0.35) : 0;
    b.box(0, footingH, 0, w, h - deckT, slabD, 'body');
    if (deckT > 0) b.box(0, h - deckT, 0, w, h, slabD, 'wood');
    if (style === 'raised') {
      const curb = lim(0.14, Math.min(w, slabD) * 0.06);
      b.box(0, footingH, 0, curb, h, slabD, 'accent');
      b.box(w - curb, footingH, 0, w, h, slabD, 'accent');
      b.box(0, footingH, 0, w, h, curb, 'accent');
    }
    if (stairs && stepD > 0.05) {
      const sw = lim(1.8, w * 0.45);
      const sx0 = (w - sw) / 2;
      const sx1 = sx0 + sw;
      const n = 2;
      for (let i = 0; i < n; i++) {
        const y1 = footingH + ((h - footingH) * (n - i)) / (n + 1);
        const z0 = slabD + (stepD * i) / n;
        const z1 = slabD + (stepD * (i + 1)) / n;
        b.box(sx0, footingH, z0, sx1, y1, z1, 'accent');
      }
    }
    return b.parts;
  },
};

const fence: Recipe = {
  id: 'fence',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const style = str(p, 'style', 'slats');
    const posts = int(p, 'posts', 2, 2, 8);
    const plinth = bool(p, 'plinth', true);
    const plinthH = plinth ? lim(0.28, h * 0.22) : 0;
    const postW = lim(0.1, w / (posts * 3));
    if (plinthH > 0) b.box(0, 0, 0, w, plinthH, d, 'dark');
    // stâlpi (inclusiv capetele: acoperă exact [0, w] × [0, h] × [0, d])
    const postXs: number[] = [];
    for (let i = 0; i < posts; i++) {
      const x0 = ((w - postW) * i) / (posts - 1);
      postXs.push(x0);
      b.box(x0, 0, 0, x0 + postW, h, d, 'dark');
    }
    const y0 = plinthH;
    const y1 = h - lim(0.04, h * 0.04);
    const pz0 = d * 0.25;
    const pz1 = d * 0.75;
    for (let i = 0; i < posts - 1; i++) {
      const xA = postXs[i]! + postW;
      const xB = postXs[i + 1]!;
      const span = xB - xA;
      if (span <= 0.02) continue;
      if (style === 'solid') {
        b.box(xA, y0, pz0, xB, y1, pz1, 'body');
      } else if (style === 'mesh') {
        const rail = lim(0.035, (y1 - y0) * 0.08);
        b.box(xA, y0, pz0, xB, y0 + rail, pz1, 'metal');
        b.box(xA, y1 - rail, pz0, xB, y1, pz1, 'metal');
        const bars = Math.max(3, Math.min(10, Math.round(span / 0.25)));
        const bw = lim(0.018, span / (bars * 3));
        for (let k = 1; k < bars; k++) {
          const bx = xA + (span * k) / bars - bw / 2;
          b.box(bx, y0 + rail, pz0, bx + bw, y1 - rail, pz1, 'metal');
        }
      } else {
        // șipci orizontale
        const slats = Math.max(4, Math.min(12, Math.round((y1 - y0) / 0.18)));
        const step = (y1 - y0) / slats;
        const sh = step * 0.72;
        for (let k = 0; k < slats; k++) {
          const sy = y0 + k * step + (step - sh) / 2;
          b.box(xA, sy, pz0, xB, sy + sh, pz1, 'body');
        }
      }
    }
    return b.parts;
  },
};

const gate: Recipe = {
  id: 'gate',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const opening = str(p, 'opening', 'double');
    const style = str(p, 'style', 'slats');
    const pilW = lim(0.18, w * 0.12);
    // stâlpi laterali
    b.box(0, 0, 0, pilW, h, d, 'dark');
    b.box(w - pilW, 0, 0, w, h, d, 'dark');
    const xA = pilW + 0.02;
    const xB = w - pilW - 0.02;
    const y0 = lim(0.08, h * 0.08);
    const y1 = h - lim(0.06, h * 0.06);
    const z0 = d * 0.28;
    const z1 = d * 0.72;
    const frame = lim(0.05, (xB - xA) * 0.06);
    const drawLeaf = (lx0: number, lx1: number) => {
      if (lx1 - lx0 <= frame * 2) return;
      b.box(lx0, y0, z0, lx1, y0 + frame, z1, 'metal');
      b.box(lx0, y1 - frame, z0, lx1, y1, z1, 'metal');
      b.box(lx0, y0, z0, lx0 + frame, y1, z1, 'metal');
      b.box(lx1 - frame, y0, z0, lx1, y1, z1, 'metal');
      if (style === 'solid') {
        b.box(lx0 + frame, y0 + frame, z0 + 0.005, lx1 - frame, y1 - frame, z1 - 0.005, 'body');
      } else {
        const slats = Math.max(4, Math.min(10, Math.round((y1 - y0) / 0.2)));
        const step = (y1 - y0 - 2 * frame) / slats;
        const sh = step * 0.7;
        for (let k = 0; k < slats; k++) {
          const sy = y0 + frame + k * step + (step - sh) / 2;
          b.box(lx0 + frame, sy, z0 + 0.005, lx1 - frame, sy + sh, z1 - 0.005, 'body');
        }
      }
    };
    if (opening === 'double') {
      const mid = (xA + xB) / 2;
      drawLeaf(xA, mid - 0.015);
      drawLeaf(mid + 0.015, xB);
    } else {
      // poartă culisantă + șină jos
      b.box(xA, 0, z0, xB, y0 * 0.5, z1, 'metal');
      drawLeaf(xA, xB);
    }
    return b.parts;
  },
};

const parking: Recipe = {
  id: 'parking',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const spots = int(p, 'spots', 2, 1, 6);
    const wheelStops = bool(p, 'wheelStops', true);
    const padH = lim(h * 0.55, 0.06);
    b.box(0, 0, 0, w, padH, d, 'body');
    const lineW = lim(0.1, w / (spots * 14));
    const lineTop = wheelStops ? Math.min(h, padH + 0.015) : h;
    // linii de delimitare locuri
    for (let i = 0; i <= spots; i++) {
      const x0 = ((w - lineW) * i) / spots;
      b.box(x0, padH, d * 0.06, x0 + lineW, lineTop, d * 0.94, 'ceramic');
    }
    b.box(0, padH, d * 0.06, w, lineTop, d * 0.06 + lineW, 'ceramic');
    if (wheelStops) {
      const spotW = w / spots;
      const stopW = spotW * 0.62;
      const stopD = lim(0.16, d * 0.06);
      for (let i = 0; i < spots; i++) {
        const cx = spotW * (i + 0.5);
        b.box(cx - stopW / 2, padH, d * 0.14, cx + stopW / 2, h, d * 0.14 + stopD, 'accent');
      }
    }
    return b.parts;
  },
};

const garage: Recipe = {
  id: 'garage',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const roof = str(p, 'roof', 'gable');
    const doors = int(p, 'doors', 1, 1, 2);
    const sideWindow = bool(p, 'sideWindow', true);
    const slabH = lim(0.12, h * 0.06);
    const roofH = roof === 'gable' ? h * 0.26 : lim(0.24, h * 0.12);
    const wallH = h - roofH;
    const t = lim(0.2, Math.min(w, d) * 0.06);
    // placă
    b.box(0, 0, 0, w, slabH, d, 'dark');
    // pereți (stânga, dreapta, spate)
    b.box(0, slabH, 0, t, wallH, d, 'body');
    b.box(w - t, slabH, 0, w, wallH, d, 'body');
    b.box(t, slabH, 0, w - t, wallH, t, 'body');
    // fațadă cu 1 sau 2 uși secționale
    const pierW = lim(0.35, w * 0.1);
    const doorH = Math.min(wallH - slabH - 0.15, 2.3);
    const span = w - pierW * (doors + 1);
    const dw = span / doors;
    for (let i = 0; i <= doors; i++) {
      const px = i * (pierW + dw);
      b.box(px, slabH, d - t, px + pierW, wallH, d, 'body');
    }
    b.box(0, slabH + doorH, d - t, w, wallH, d, 'body');
    for (let i = 0; i < doors; i++) {
      const dx0 = pierW + i * (dw + pierW);
      b.box(dx0, slabH, d - t * 0.65, dx0 + dw, slabH + doorH, d - t * 0.25, 'accent');
      // nervuri orizontale pe ușa secțională
      for (let r = 1; r <= 3; r++) {
        const ry = slabH + (doorH * r) / 4;
        b.box(dx0 + 0.04, ry - 0.015, d - t * 0.25, dx0 + dw - 0.04, ry + 0.015, d - 0.01, 'metal');
      }
    }
    if (sideWindow) {
      const ww = lim(1.2, d * 0.3);
      const wy0 = slabH + (wallH - slabH) * 0.45;
      const wy1 = Math.min(wallH - 0.2, wy0 + 0.75);
      b.box(w - t * 0.4, wy0, (d - ww) / 2, w, wy1, (d + ww) / 2, 'glass');
    }
    // acoperiș
    if (roof === 'gable') {
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const frac = i / steps;
        const inset = (w * 0.48 * i) / steps;
        const y0 = wallH + roofH * frac;
        const y1 = wallH + (roofH * (i + 1)) / steps;
        b.box(inset, y0, 0, w - inset, y1, d, 'accent');
      }
    } else {
      b.box(0, wallH, 0, w, h, d, 'accent');
    }
    return b.parts;
  },
};

const carport: Recipe = {
  id: 'carport',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const roof = str(p, 'roof', 'flat');
    const posts = int(p, 'posts', 4, 4, 6);
    const roofH = roof === 'gable' ? h * 0.22 : lim(0.22, h * 0.12);
    const clearH = h - roofH;
    const pw = lim(0.14, Math.min(w, d) * 0.05);
    const perSide = posts >= 6 ? 3 : 2;
    for (const px of [0, w - pw]) {
      for (let i = 0; i < perSide; i++) {
        const pz = ((d - pw) * i) / (perSide - 1);
        b.box(px, 0, pz, px + pw, clearH, pz + pw, 'dark');
      }
      // grindă longitudinală
      b.box(px, clearH - pw, 0, px + pw, clearH, d, 'metal');
    }
    // grinzi transversale
    b.box(0, clearH - pw, 0, w, clearH, pw, 'metal');
    b.box(0, clearH - pw, d - pw, w, clearH, d, 'metal');
    if (roof === 'gable') {
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const inset = (w * 0.46 * i) / steps;
        b.box(
          inset,
          clearH + (roofH * i) / steps,
          0,
          w - inset,
          clearH + (roofH * (i + 1)) / steps,
          d,
          'body',
        );
      }
    } else {
      b.box(0, clearH, 0, w, h, d, 'body');
    }
    return b.parts;
  },
};

const hall: Recipe = {
  id: 'hall',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const roof = str(p, 'roof', 'gable');
    const gates = int(p, 'gates', 1, 1, 3);
    const windows = bool(p, 'windows', true);
    const sideDoor = bool(p, 'sideDoor', true);
    const slabH = lim(0.18, h * 0.05);
    const roofH = roof === 'gable' ? h * 0.24 : lim(0.32, h * 0.1);
    const wallH = h - roofH;
    const t = lim(0.24, Math.min(w, d) * 0.04);
    // placă industrială
    b.box(0, 0, 0, w, slabH, d, 'dark');
    // pereți exteriori din panouri sandwich
    b.box(0, slabH, 0, t, wallH, d, 'body');
    b.box(w - t, slabH, 0, w, wallH, d, 'body');
    b.box(t, slabH, 0, w - t, wallH, t, 'body');
    // stâlpi metalici exteriori pe laterale
    const bays = Math.max(3, Math.min(6, Math.round(d / 3)));
    const colW = lim(0.18, d / (bays * 6));
    for (let i = 0; i <= bays; i++) {
      const cz = ((d - colW) * i) / bays;
      b.box(0, slabH, cz, t + 0.04, wallH, cz + colW, 'metal');
      b.box(w - t - 0.04, slabH, cz, w, wallH, cz + colW, 'metal');
    }
    // fațada frontală cu porți industriale secționale
    const gateH = Math.min(wallH - slabH - 0.4, 3.8);
    const pierW = lim(0.6, w / (gates * 4));
    const gw = (w - pierW * (gates + 1)) / gates;
    for (let i = 0; i <= gates; i++) {
      const px = i * (pierW + gw);
      b.box(px, slabH, d - t, px + pierW, wallH, d, 'body');
    }
    b.box(0, slabH + gateH, d - t, w, wallH, d, 'body');
    for (let i = 0; i < gates; i++) {
      const gx0 = pierW + i * (gw + pierW);
      b.box(gx0, slabH, d - t * 0.6, gx0 + gw, slabH + gateH, d - t * 0.2, 'accent');
      for (let r = 1; r <= 4; r++) {
        const ry = slabH + (gateH * r) / 5;
        b.box(gx0 + 0.05, ry - 0.02, d - t * 0.2, gx0 + gw - 0.05, ry + 0.02, d - 0.01, 'metal');
      }
    }
    // ferestre bandă sus pe laterale
    if (windows) {
      const wy0 = slabH + (wallH - slabH) * 0.65;
      const wy1 = Math.min(wallH - 0.25, wy0 + 0.8);
      b.box(0, wy0, d * 0.12, t * 0.3, wy1, d * 0.88, 'glass');
      b.box(w - t * 0.3, wy0, d * 0.12, w, wy1, d * 0.88, 'glass');
    }
    // ușă pietonală laterală
    if (sideDoor) {
      const dh = Math.min(wallH - slabH - 0.2, 2.1);
      const dw = lim(1.0, d * 0.18);
      b.box(0, slabH, d * 0.72, t * 0.35, slabH + dh, d * 0.72 + dw, 'metal');
    }
    // acoperiș
    if (roof === 'gable') {
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const inset = (w * 0.48 * i) / steps;
        b.box(
          inset,
          wallH + (roofH * i) / steps,
          0,
          w - inset,
          wallH + (roofH * (i + 1)) / steps,
          d,
          'metal',
        );
      }
    } else {
      b.box(0, wallH, 0, w, h, d, 'metal');
    }
    return b.parts;
  },
};

const tree: Recipe = {
  id: 'tree',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const species = str(p, 'species', 'deciduous');
    const cx = w / 2;
    const cz = d / 2;
    // bază sol
    const baseR = Math.min(w, d) * 0.24;
    b.cyl(cx - baseR, 0, cz - baseR, cx + baseR, lim(0.08, h * 0.03), cz + baseR, 'soil');
    if (species === 'conifer') {
      const trW = Math.min(w, d) * 0.16;
      const trunkTop = h * 0.26;
      b.cyl(cx - trW / 2, 0.04, cz - trW / 2, cx + trW / 2, trunkTop, cz + trW / 2, 'wood', {
        taper: 0.75,
      });
      // 3 coroane conice suprapuse
      b.cyl(0, trunkTop * 0.75, 0, w, h * 0.56, d, 'foliage', { taper: 0.25 });
      b.cyl(w * 0.12, h * 0.44, d * 0.12, w * 0.88, h * 0.78, d * 0.88, 'foliage', { taper: 0.22 });
      b.cyl(w * 0.24, h * 0.68, d * 0.24, w * 0.76, h, d * 0.76, 'foliage', { taper: 0.05 });
    } else {
      const trW = Math.min(w, d) * 0.18;
      const trunkTop = h * 0.45;
      b.cyl(cx - trW / 2, 0.04, cz - trW / 2, cx + trW / 2, trunkTop, cz + trW / 2, 'wood', {
        taper: 0.7,
      });
      // coroană foios: sferă principală + 2 volume secundare în interiorul casetei
      b.sph(0, h * 0.34, 0, w, h, d, 'foliage');
      b.sph(w * 0.06, h * 0.3, d * 0.08, w * 0.72, h * 0.84, d * 0.76, 'foliage');
      b.sph(w * 0.28, h * 0.38, d * 0.22, w * 0.94, h * 0.92, d * 0.92, 'foliage');
    }
    return b.parts;
  },
};

const hedge: Recipe = {
  id: 'hedge',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const segments = int(p, 'segments', 3, 1, 8);
    const soilH = lim(0.1, h * 0.1);
    b.box(0, 0, 0, w, soilH, d, 'soil');
    const segW = w / segments;
    const gap = segments > 1 ? Math.min(0.04, segW * 0.05) : 0;
    for (let i = 0; i < segments; i++) {
      const x0 = i * segW + (i === 0 ? 0 : gap / 2);
      const x1 = (i + 1) * segW - (i === segments - 1 ? 0 : gap / 2);
      b.box(x0, soilH, 0, x1, h * 0.86, d, 'foliage');
      b.sph(x0, h * 0.7, 0, x1, h, d, 'foliage');
    }
    return b.parts;
  },
};

const vehicle: Recipe = {
  id: 'vehicle',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const kind = str(p, 'vehicleType', 'sedan');
    const wheelR = lim(h * 0.24, Math.min(w * 0.22, d * 0.1));
    const wheelD = wheelR * 2;
    const wheelW = lim(0.24, w * 0.14);
    const clearance = wheelR * 0.65;
    const wzF = d * 0.76;
    const wzR = d * 0.22;
    // 4 roți (ating y=0 și x=0 / x=w)
    for (const wz of [wzR, wzF]) {
      b.cyl(0, 0, wz - wheelR, wheelW, wheelD, wz + wheelR, 'dark', { axis: 'x' });
      b.cyl(w - wheelW, 0, wz - wheelR, w, wheelD, wz + wheelR, 'dark', { axis: 'x' });
    }
    if (kind === 'truck') {
      // platformă / camion: cabină în față + benă/caroserie în spate
      const cabZ0 = d * 0.68;
      const bedH = h * 0.96;
      b.box(w * 0.03, clearance, 0, w * 0.97, clearance + h * 0.22, d, 'dark');
      b.box(0, clearance + h * 0.2, 0, w, bedH, cabZ0 - 0.12, 'light');
      b.box(w * 0.04, clearance + h * 0.18, cabZ0, w * 0.96, h, d, 'body');
      b.box(w * 0.08, h * 0.58, d - 0.08, w * 0.92, h * 0.9, d, 'glass');
    } else if (kind === 'van') {
      // dubă / utilitară
      const hoodZ = d * 0.84;
      b.box(0, clearance, 0, w, h * 0.52, d, 'body');
      b.box(w * 0.03, h * 0.5, 0, w * 0.97, h, hoodZ, 'body');
      b.box(w * 0.08, h * 0.56, hoodZ - 0.04, w * 0.92, h * 0.92, hoodZ + 0.06, 'glass');
      b.box(w * 0.03, h * 0.56, d * 0.55, w * 0.97, h * 0.88, hoodZ - 0.08, 'glass');
    } else {
      // sedan sau SUV
      const isSuv = kind === 'suv';
      const waistH = isSuv ? h * 0.56 : h * 0.54;
      const cabZ0 = isSuv ? d * 0.14 : d * 0.22;
      const cabZ1 = isSuv ? d * 0.72 : d * 0.68;
      b.box(0, clearance, 0, w, waistH, d, 'body');
      b.box(w * 0.08, waistH, cabZ0, w * 0.92, h, cabZ1, 'body');
      // parbriz, lunetă și geamuri laterale
      b.box(w * 0.12, waistH + 0.03, cabZ1 - 0.05, w * 0.88, h - 0.05, cabZ1 + 0.06, 'glass');
      b.box(w * 0.12, waistH + 0.03, cabZ0 - 0.05, w * 0.88, h - 0.05, cabZ0 + 0.05, 'glass');
      b.box(w * 0.06, waistH + 0.04, cabZ0 + 0.1, w * 0.94, h - 0.06, cabZ1 - 0.1, 'glass');
    }
    // faruri față (+Z) și stopuri spate (0)
    const lh = lim(0.14, h * 0.1);
    const lw = lim(0.28, w * 0.18);
    const ly = clearance + h * 0.18;
    b.box(w * 0.08, ly, d - 0.04, w * 0.08 + lw, ly + lh, d, 'glow');
    b.box(w * 0.92 - lw, ly, d - 0.04, w * 0.92, ly + lh, d, 'glow');
    b.box(w * 0.08, ly, 0, w * 0.08 + lw, ly + lh, 0.04, 'accent');
    b.box(w * 0.92 - lw, ly, 0, w * 0.92, ly + lh, 0.04, 'accent');
    return b.parts;
  },
};

const gazebo: Recipe = {
  id: 'gazebo',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const railings = bool(p, 'railings', true);
    const deckH = lim(0.16, h * 0.08);
    const roofH = h * 0.28;
    const clearH = h - roofH;
    const pw = lim(0.12, Math.min(w, d) * 0.05);
    // platformă lemn
    b.box(0, 0, 0, w, deckH, d, 'wood');
    // 4 stâlpi
    for (const px of [0, w - pw])
      for (const pz of [0, d - pw]) b.box(px, deckH, pz, px + pw, clearH, pz + pw, 'wood');
    if (railings) {
      const rh = deckH + lim(0.85, (clearH - deckH) * 0.42);
      const rt = lim(0.06, pw * 0.6);
      b.box(pw, rh - rt, 0, w - pw, rh, rt, 'wood');
      b.box(0, rh - rt, pw, rt, rh, d - pw, 'wood');
      b.box(w - rt, rh - rt, pw, w, rh, d - pw, 'wood');
    }
    // acoperiș piramidal în trepte
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const ix = (w * 0.44 * i) / steps;
      const iz = (d * 0.44 * i) / steps;
      b.box(
        ix,
        clearH + (roofH * i) / steps,
        iz,
        w - ix,
        clearH + (roofH * (i + 1)) / steps,
        d - iz,
        'body',
      );
    }
    return b.parts;
  },
};

const streetLamp: Recipe = {
  id: 'street-lamp',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const style = str(p, 'style', 'modern');
    const cx = w / 2;
    const cz = d / 2;
    const baseH = lim(0.14, h * 0.06);
    b.cyl(0, 0, 0, w, baseH, d, 'dark');
    const poleR = Math.min(w, d) * 0.14;
    const headH = lim(0.42, h * 0.16);
    const poleTop = h - headH;
    b.cyl(cx - poleR, baseH, cz - poleR, cx + poleR, poleTop, cz + poleR, 'metal', { taper: 0.75 });
    if (style === 'classic') {
      b.cyl(w * 0.15, poleTop, d * 0.15, w * 0.85, h - headH * 0.25, d * 0.85, 'glow', {
        taper: 1.2,
      });
      b.cyl(w * 0.1, h - headH * 0.25, d * 0.1, w * 0.9, h, d * 0.9, 'dark', { taper: 0.2 });
    } else {
      b.box(w * 0.1, poleTop, d * 0.1, w * 0.9, h - headH * 0.35, d * 0.9, 'glow');
      b.box(w * 0.05, h - headH * 0.35, d * 0.05, w * 0.95, h, d * 0.95, 'dark');
    }
    return b.parts;
  },
};

// ───────────── mobilă la comandă (parametrice cu interior detaliat + _hideFronts) ─────────────

const customWardrobe: Recipe = {
  id: 'custom-wardrobe',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const cols = int(p, 'columns', 3, 1, 6);
    const doorStyle = str(p, 'doorStyle', 'hinged');
    const shelves = int(p, 'shelves', 4, 1, 8);
    const drawers = int(p, 'drawers', 3, 0, 8);
    const hangingRod = bool(p, 'hangingRod', true);
    const base = str(p, 'base', 'plinth');
    const hideFronts = bool(p, '_hideFronts', false);
    const t = lim(str(p, 'boardMm', '18') === '36' ? 0.036 : 0.018, Math.min(w / (cols * 4), 0.04));

    const baseH = base === 'none' ? 0 : lim(base === 'legs' ? 0.12 : 0.1, h * 0.15);
    const hasDoors = doorStyle !== 'open';
    const frontZone = hasDoors ? lim(doorStyle === 'sliding' ? 0.055 : 0.028, d * 0.14) : 0;
    const carcassD = hasDoors && !hideFronts ? d - frontZone : d;
    const backT = 0.008;

    // bază: soclu sau picioare (atinge y=0)
    if (base === 'plinth') {
      b.box(0.015, 0, 0.01, w - 0.015, baseH, Math.max(0.05, carcassD - 0.025), 'dark');
    } else if (base === 'legs') {
      const ls = lim(0.04, w * 0.05);
      for (const x of [0.02, w - 0.02 - ls])
        for (const z of [0.02, Math.max(0.03, carcassD - 0.02 - ls)])
          b.box(x, 0, z, x + ls, baseH, z + ls, 'metal');
    }

    // carcasă: laterale (x=0..w), fund, capac (y=..h), spate (z=0)
    b.box(0, baseH, 0, t, h, carcassD, 'body');
    b.box(w - t, baseH, 0, w, h, carcassD, 'body');
    b.box(t, baseH, 0, w - t, baseH + t, carcassD, 'body');
    b.box(t, h - t, 0, w - t, h, carcassD, 'body');
    b.box(t, baseH + t, 0, w - t, h - t, backT, 'light');

    // despărțitoare verticale & compartimentare interioară
    const innerW = w - 2 * t;
    const colW = (innerW - (cols - 1) * t) / cols;
    const innerY0 = baseH + t;
    const innerY1 = h - t;
    const innerH = innerY1 - innerY0;

    for (let c = 1; c < cols; c++) {
      const x = t + c * colW + (c - 1) * t;
      b.box(x, innerY0, backT, x + t, innerY1, carcassD - 0.01, 'body');
    }

    // sertare interioare în prima coloană (sau împărțite)
    const drawerColX0 = t;
    const drawerColX1 = t + colW;
    const drawerStackH = drawers > 0 ? lim(drawers * 0.19, innerH * 0.55) : 0;
    if (drawers > 0) {
      const dh = drawerStackH / drawers;
      for (let i = 0; i < drawers; i++) {
        const y0 = innerY0 + i * dh + 0.004;
        const y1 = innerY0 + (i + 1) * dh - 0.004;
        b.box(
          drawerColX0 + 0.006,
          y0,
          backT + 0.02,
          drawerColX1 - 0.006,
          y1,
          carcassD - 0.02,
          'wood',
        );
        b.box(
          drawerColX0 + colW * 0.35,
          (y0 + y1) / 2 - 0.006,
          carcassD - 0.02,
          drawerColX0 + colW * 0.65,
          (y0 + y1) / 2 + 0.006,
          carcassD - 0.008,
          'metal',
        );
      }
    }

    // polițe și bară de haine
    for (let c = 0; c < cols; c++) {
      const x0 = t + c * (colW + t);
      const x1 = x0 + colW;
      const isHangingCol = hangingRod && (cols === 1 || c === Math.min(1, cols - 1));
      if (isHangingCol) {
        const topShelfY = innerY1 - lim(0.38, innerH * 0.22);
        b.box(x0, topShelfY - t / 2, backT, x1, topShelfY + t / 2, carcassD - 0.015, 'body');
        const rodY = topShelfY - 0.07;
        b.cyl(
          x0 + 0.01,
          rodY - 0.014,
          carcassD * 0.5 - 0.014,
          x1 - 0.01,
          rodY + 0.014,
          carcassD * 0.5 + 0.014,
          'metal',
          { axis: 'x' },
        );
      } else {
        const startY = c === 0 ? innerY0 + drawerStackH : innerY0;
        const avail = innerY1 - startY;
        const nShelves = Math.max(1, Math.min(shelves, Math.floor(avail / 0.22)));
        for (let s = 1; s <= nShelves; s++) {
          const y = startY + (avail * s) / (nShelves + 1);
          b.box(x0, y - t / 2, backT, x1, y + t / 2, carcassD - 0.015, 'body');
        }
      }
    }

    // uși batante sau culisante (ascunse când _hideFronts = true pentru vederea interioară)
    if (hasDoors && !hideFronts) {
      const gap = 0.004;
      if (doorStyle === 'sliding') {
        const doorCount = Math.max(2, Math.min(4, cols));
        const dw = w / doorCount + 0.015;
        const trackT = frontZone * 0.42;
        // șină sus & jos
        b.box(0, baseH, carcassD, w, baseH + 0.018, d, 'metal');
        b.box(0, h - 0.018, carcassD, w, h, d, 'metal');
        for (let i = 0; i < doorCount; i++) {
          const x0 = Math.max(0, Math.min(w - dw, (i * (w - dw)) / Math.max(1, doorCount - 1)));
          const z0 = i % 2 === 0 ? carcassD + 0.004 : d - trackT;
          const z1 = Math.min(d, z0 + trackT);
          b.box(x0, baseH + 0.018, z0, x0 + dw, h - 0.018, z1, 'accent');
          b.box(x0, baseH + 0.018, z0, x0 + 0.012, h - 0.018, z1, 'metal');
          b.box(x0 + dw - 0.012, baseH + 0.018, z0, x0 + dw, h - 0.018, z1, 'metal');
        }
      } else {
        const doorCount = cols;
        const dw = w / doorCount;
        const handleT = lim(0.01, frontZone * 0.4);
        const fz0 = carcassD;
        const fz1 = d - handleT;
        for (let i = 0; i < doorCount; i++) {
          const x0 = i * dw + gap / 2;
          const x1 = (i + 1) * dw - gap / 2;
          b.box(x0, baseH + gap / 2, fz0, x1, h - gap / 2, fz1, 'accent');
          const hx = i % 2 === 0 ? x1 - 0.045 : x0 + 0.045;
          const hy = baseH + (h - baseH) * 0.48;
          b.box(hx - 0.007, hy - 0.12, fz1, hx + 0.007, hy + 0.12, d, 'metal');
        }
      }
    }
    return b.parts;
  },
};

const customKitchen: Recipe = {
  id: 'custom-kitchen',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const unitType = str(p, 'unitType', 'base');
    const frontStyle = str(p, 'frontStyle', 'combo');
    const fronts = int(p, 'fronts', 2, 1, 4);
    const handles = str(p, 'handles', 'classic');
    const worktop = unitType === 'base' && bool(p, 'worktop', true);
    const sink = worktop && bool(p, 'sink', false);
    const hideFronts = bool(p, '_hideFronts', false);
    const t = lim(str(p, 'boardMm', '18') === '36' ? 0.036 : 0.018, w * 0.08);

    const baseH = unitType === 'wall' ? 0 : lim(0.1, h * 0.18);
    const topT = worktop ? lim(0.038, h * 0.08) : 0;
    const carcassTop = h - topT;
    const hasFronts = frontStyle !== 'open' && !hideFronts;
    const handleT = hasFronts && handles === 'classic' ? 0.012 : 0;
    const frontT = hasFronts ? lim(0.02, d * 0.1) : 0;
    const carcassD = d - frontT - handleT;
    const backT = 0.008;
    const gap = 0.004;

    if (baseH > 0) {
      b.box(0.015, 0, 0.015, w - 0.015, baseH, Math.max(0.05, carcassD - 0.03), 'dark');
    }
    // carcasă deschisă (cu polițe interioare vizibile când _hideFronts = true sau open)
    b.box(0, baseH, 0, t, carcassTop, carcassD, 'body');
    b.box(w - t, baseH, 0, w, carcassTop, carcassD, 'body');
    b.box(t, baseH, 0, w - t, baseH + t, carcassD, 'body');
    b.box(t, carcassTop - t, 0, w - t, carcassTop, carcassD, 'body');
    b.box(t, baseH + t, 0, w - t, carcassTop - t, backT, 'light');

    const innerH = carcassTop - t - (baseH + t);
    const shelfCount = unitType === 'tall' ? 4 : unitType === 'wall' ? 2 : 1;
    for (let i = 1; i <= shelfCount; i++) {
      const y = baseH + t + (innerH * i) / (shelfCount + 1);
      b.box(t, y - t / 2, backT, w - t, y + t / 2, carcassD - 0.02, 'body');
    }

    if (hasFronts) {
      const fz0 = carcassD;
      const fz1 = carcassD + frontT;
      if (frontStyle === 'drawers') {
        const rh = (carcassTop - baseH) / fronts;
        for (let i = 0; i < fronts; i++) {
          const y0 = baseH + i * rh + gap / 2;
          const y1 = baseH + (i + 1) * rh - gap / 2;
          b.box(gap / 2, y0, fz0, w - gap / 2, y1, fz1, 'accent');
          if (handles === 'classic') {
            const hw = lim(0.16, w * 0.4);
            b.box(
              w / 2 - hw / 2,
              (y0 + y1) / 2 - 0.007,
              fz1,
              w / 2 + hw / 2,
              (y0 + y1) / 2 + 0.007,
              d,
              'metal',
            );
          }
        }
      } else if (frontStyle === 'combo') {
        const topDrH = lim(0.18, (carcassTop - baseH) * 0.28);
        const splitY = carcassTop - topDrH;
        // sertar sus
        b.box(gap / 2, splitY + gap / 2, fz0, w - gap / 2, carcassTop - gap / 2, fz1, 'accent');
        if (handles === 'classic') {
          const hw = lim(0.16, w * 0.4);
          b.box(
            w / 2 - hw / 2,
            splitY + topDrH / 2 - 0.007,
            fz1,
            w / 2 + hw / 2,
            splitY + topDrH / 2 + 0.007,
            d,
            'metal',
          );
        }
        // uși jos
        const dw = w / fronts;
        for (let i = 0; i < fronts; i++) {
          const x0 = i * dw + gap / 2;
          const x1 = (i + 1) * dw - gap / 2;
          b.box(x0, baseH + gap / 2, fz0, x1, splitY - gap / 2, fz1, 'accent');
          if (handles === 'classic') {
            const hx = i % 2 === 0 ? x1 - 0.04 : x0 + 0.04;
            const hy = splitY - lim(0.12, (splitY - baseH) * 0.25);
            b.box(hx - 0.006, hy - 0.06, fz1, hx + 0.006, hy + 0.06, d, 'metal');
          }
        }
      } else {
        const dw = w / fronts;
        for (let i = 0; i < fronts; i++) {
          const x0 = i * dw + gap / 2;
          const x1 = (i + 1) * dw - gap / 2;
          b.box(x0, baseH + gap / 2, fz0, x1, carcassTop - gap / 2, fz1, 'accent');
          if (handles === 'classic') {
            const hx = i % 2 === 0 ? x1 - 0.04 : x0 + 0.04;
            const hy = baseH + (carcassTop - baseH) * 0.55;
            b.box(hx - 0.006, hy - 0.07, fz1, hx + 0.006, hy + 0.07, d, 'metal');
          }
        }
      }
    }

    if (worktop) {
      if (!sink) {
        b.box(0, carcassTop, 0, w, h, d, 'wood');
      } else {
        const bw = lim(w * 0.55, 0.72);
        const bd = lim(d * 0.58, 0.42);
        const x0 = (w - bw) / 2;
        const z0 = (d - bd) / 2;
        b.box(0, carcassTop, 0, w, h, z0, 'wood');
        b.box(0, carcassTop, z0 + bd, w, h, d, 'wood');
        b.box(0, carcassTop, z0, x0, h, z0 + bd, 'wood');
        b.box(x0 + bw, carcassTop, z0, w, h, z0 + bd, 'wood');
        b.box(x0, carcassTop, z0, x0 + bw, carcassTop + topT * 0.35, z0 + bd, 'metal');
      }
    }
    return b.parts;
  },
};

const customBookcase: Recipe = {
  id: 'custom-bookcase',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const cols = int(p, 'columns', 3, 1, 6);
    const rows = int(p, 'rows', 5, 2, 8);
    const tvNiche = bool(p, 'tvNiche', true) && cols >= 3 && rows >= 3;
    const lowerStorage = str(p, 'lowerStorage', 'doors');
    const back = bool(p, 'back', true);
    const hideFronts = bool(p, '_hideFronts', false);
    const t = lim(str(p, 'boardMm', '18') === '36' ? 0.036 : 0.018, Math.min(w / (cols * 4), 0.04));

    const hasLowerFronts = lowerStorage !== 'none' && !hideFronts;
    const frontT = hasLowerFronts ? lim(0.022, d * 0.1) : 0;
    const carcassD = d - frontT;
    const backT = back ? 0.008 : 0;

    // carcasă exterioară (acoperă 0..w, 0..h, 0..d)
    b.box(0, 0, 0, t, h, d, 'body');
    b.box(w - t, 0, 0, w, h, d, 'body');
    b.box(t, 0, 0, w - t, t, carcassD, 'body');
    b.box(t, h - t, 0, w - t, h, d, 'body');
    if (back) b.box(t, t, 0, w - t, h - t, backT, 'light');

    const innerW = w - 2 * t;
    const colW = (innerW - (cols - 1) * t) / cols;
    const innerH = h - 2 * t;
    const rowH = innerH / rows;

    // polițe orizontale
    for (let r = 1; r < rows; r++) {
      const y = t + r * rowH;
      if (tvNiche && r > 1 && r < rows - 1) {
        // păstrăm nișa TV liberă în zona centrală (coloanele interioare)
        b.box(t, y - t / 2, backT, t + colW, y + t / 2, carcassD, 'body');
        b.box(w - t - colW, y - t / 2, backT, w - t, y + t / 2, carcassD, 'body');
      } else {
        b.box(t, y - t / 2, backT, w - t, y + t / 2, carcassD, 'body');
      }
    }

    // montanți verticali
    for (let c = 1; c < cols; c++) {
      const x = t + c * colW + (c - 1) * t;
      const inNiche = tvNiche && c > 1 && c < cols - 1;
      if (inNiche) {
        b.box(x, t, backT, x + t, t + rowH, carcassD, 'body');
        b.box(x, h - t - rowH, backT, x + t, h - t, carcassD, 'body');
      } else {
        b.box(x, t, backT, x + t, h - t, carcassD, 'body');
      }
    }

    // uși / sertare pe rândul inferior
    if (hasLowerFronts) {
      const gap = 0.004;
      const y0 = t + gap;
      const y1 = t + rowH - gap;
      const fz0 = carcassD;
      const fz1 = d - 0.008;
      for (let c = 0; c < cols; c++) {
        const x0 = t + c * (colW + t) + gap / 2;
        const x1 = x0 + colW - gap;
        b.box(x0, y0, fz0, x1, y1, fz1, 'accent');
        const hw = lowerStorage === 'drawers' ? lim(0.12, colW * 0.35) : 0.016;
        const hh = lowerStorage === 'drawers' ? 0.012 : lim(0.08, (y1 - y0) * 0.3);
        const hx = lowerStorage === 'drawers' ? (x0 + x1) / 2 : x1 - 0.035;
        b.box(
          hx - hw / 2,
          (y0 + y1) / 2 - hh / 2,
          fz1,
          hx + hw / 2,
          (y0 + y1) / 2 + hh / 2,
          d,
          'metal',
        );
      }
    }
    return b.parts;
  },
};

const customDesk: Recipe = {
  id: 'custom-desk',
  version: 1,
  build: ([w, h, d], p) => {
    const b = builder(w, h, d);
    const drawersSide = str(p, 'drawersSide', 'right');
    const drawersCount = int(p, 'drawersCount', 3, 1, 5);
    const frameStyle = str(p, 'frameStyle', 'panels');
    const thickTop = bool(p, 'thickTop', true);
    const hideFronts = bool(p, '_hideFronts', false);
    const t = lim(str(p, 'boardMm', '18') === '36' ? 0.036 : 0.018, w * 0.05);

    const topT = lim(thickTop ? 0.036 : t, h * 0.1);
    const legH = h - topT;
    // blat (acoperă 0..w, h-topT..h, 0..d)
    b.box(0, legH, 0, w, h, d, 'wood');

    const pedW = lim(0.44, w * 0.3);
    const hasLeftPed = drawersSide === 'left' || drawersSide === 'both';
    const hasRightPed = drawersSide === 'right' || drawersSide === 'both';
    const pedD = d - 0.02;

    const buildPedestal = (x0: number, x1: number) => {
      b.box(x0, 0, 0, x0 + t, legH, pedD, 'body');
      b.box(x1 - t, 0, 0, x1, legH, pedD, 'body');
      b.box(x0 + t, 0, 0, x1 - t, t, pedD, 'body');
      b.box(x0 + t, t, 0, x1 - t, legH, 0.008, 'light');
      const innerH = legH - t;
      const rh = innerH / drawersCount;
      for (let i = 0; i < drawersCount; i++) {
        const y0 = t + i * rh + 0.004;
        const y1 = t + (i + 1) * rh - 0.004;
        if (hideFronts) {
          b.box(x0 + t + 0.008, y0, 0.015, x1 - t - 0.008, y0 + 0.014, pedD - 0.015, 'wood');
        } else {
          b.box(x0 + 0.004, y0, pedD, x1 - 0.004, y1, d - 0.008, 'accent');
          const hw = lim(0.12, (x1 - x0) * 0.35);
          b.box(
            (x0 + x1) / 2 - hw / 2,
            (y0 + y1) / 2 - 0.006,
            d - 0.008,
            (x0 + x1) / 2 + hw / 2,
            (y0 + y1) / 2 + 0.006,
            d,
            'metal',
          );
        }
      }
    };

    const buildSupport = (x0: number, x1: number) => {
      if (frameStyle === 'metal') {
        const s = lim(0.04, (x1 - x0) * 0.8);
        b.box(x0, 0, 0.02, x0 + s, legH, 0.02 + s, 'metal');
        b.box(x0, 0, d - 0.02 - s, x0 + s, legH, d - 0.02, 'metal');
        b.box(x0, 0, 0.02, x0 + s, s, d - 0.02, 'metal');
      } else {
        b.box(x0, 0, 0.02, x0 + t, legH, d - 0.02, 'body');
      }
    };

    if (hasLeftPed) buildPedestal(0, pedW);
    else buildSupport(0, t);

    if (hasRightPed) buildPedestal(w - pedW, w);
    else buildSupport(w - t, w);

    // panou legătură spate (modesty panel)
    const spanX0 = hasLeftPed ? pedW : t;
    const spanX1 = hasRightPed ? w - pedW : w - t;
    if (spanX1 - spanX0 > 0.1) {
      b.box(
        spanX0,
        legH * 0.5,
        0.02,
        spanX1,
        legH,
        0.02 + t,
        frameStyle === 'metal' ? 'metal' : 'body',
      );
    }
    return b.parts;
  },
};

export const RECIPES: Readonly<Record<string, Recipe>> = Object.fromEntries(
  [
    sofa,
    armchair,
    table,
    stool,
    chair,
    officeChair,
    cabinet,
    bookcase,
    wallShelf,
    bed,
    desk,
    countertop,
    fridge,
    oven,
    cooktop,
    washer,
    hood,
    toilet,
    basin,
    bathtub,
    shower,
    floorLamp,
    ceilingLight,
    mirror,
    picture,
    plant,
    foundation,
    fence,
    gate,
    parking,
    garage,
    carport,
    hall,
    tree,
    hedge,
    vehicle,
    gazebo,
    streetLamp,
    customWardrobe,
    customKitchen,
    customBookcase,
    customDesk,
  ].map((r) => [r.id, r]),
);

export type { Builder };

/**
 * Rețeta pentru `id`/`version`. Rețetă necunoscută sau mai nouă decât cea cunoscută ⇒ `null` (apelantul desenează o cutie
 * de înlocuire la dimensiunile instanței; datele nu se pierd — DATA_MODEL §5).
 */
export function resolveRecipe(id: string, version: number): Recipe | null {
  const r = RECIPES[id];
  return r && r.version >= version ? r : null;
}

/** Părțile unui obiect; fără rețetă potrivită ⇒ o cutie de înlocuire. */
export function buildParts(
  recipe: { id: string; version: number } | null,
  size: Size3,
  params: Params,
): { parts: Part[]; placeholder: boolean } {
  const r = recipe ? resolveRecipe(recipe.id, recipe.version) : null;
  if (r) return { parts: r.build(size, params), placeholder: false };
  const b = builder(size[0], size[1], size[2]);
  b.box(0, 0, 0, size[0], size[1], size[2], 'body');
  return { parts: b.parts, placeholder: true };
}
