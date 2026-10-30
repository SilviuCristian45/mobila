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
