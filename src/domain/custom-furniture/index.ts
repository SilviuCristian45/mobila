// Calcul pur al listei de debitare (Cut List), feroneriei și costului estimativ pentru mobilă la comandă.
// Fără DOM, fără React, fără modificări de schemă (CURRENT_VERSION = 1 rămâne intact).
import type { ObjectParams, ObjectSize } from '../objects';

export interface CutPanel {
  id: string;
  part: string;
  role: 'body' | 'front' | 'top' | 'back';
  material: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  qty: number;
  /** Metri liniari de cant ABS per bucată (mm totali pe toate bucățile calculați în sumă). */
  edgeBandPerPieceMm: number;
  areaM2: number;
}

export interface HardwareItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface CutListSummary {
  panels: CutPanel[];
  hardware: HardwareItem[];
  /** Suprafață netă PAL/MDF (fără spate PFL), m². */
  boardAreaNetM2: number;
  /** Suprafață brută PAL/MDF cu factor de pierdere/croire (15%), m². */
  boardAreaGrossM2: number;
  /** Suprafață spate PFL/HDF, m². */
  backAreaM2: number;
  /** Coli standard PAL (2800 × 2070 mm ≈ 5,796 m²) estimate. */
  sheetsNeeded: number;
  /** Metri liniari totali cant ABS. */
  edgeBandMl: number;
  /** Defalcare orientativă cost (bani RON, prețuri demonstrative). */
  cost: {
    boardsMinor: number;
    backMinor: number;
    edgeBandMinor: number;
    hardwareMinor: number;
    cuttingMinor: number;
    totalMinor: number;
  };
}

const SHEET_AREA_M2 = 2.8 * 2.07; // 5.796 m² placă standard PAL/MDF
const WASTE_FACTOR = 1.15; // 15% pierdere debitare/croire
// Prețuri demonstrative unitare (bani RON)
const PRICE_BOARD_M2_MINOR = 9500; // 95 RON / m² PAL 18mm
const PRICE_BOARD_36_M2_MINOR = 16500; // 165 RON / m² dublat 36mm
const PRICE_BACK_M2_MINOR = 3200; // 32 RON / m² PFL/HDF 4mm
const PRICE_EDGE_ML_MINOR = 650; // 6,50 RON / ml cant ABS + aplicare
const PRICE_CUTTING_M2_MINOR = 2800; // 28 RON / m² debitare + găurire CNC

const num = (p: ObjectParams, k: string, def: number): number => {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
};
const str = (p: ObjectParams, k: string, def: string): string => {
  const v = p[k];
  return typeof v === 'string' ? v : def;
};
const bool = (p: ObjectParams, k: string, def: boolean): boolean => {
  const v = p[k];
  return typeof v === 'boolean' ? v : def;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Calculează lista completă de panouri de debitat, feroneria și costul estimativ pentru un corp de mobilă la comandă. */
export function computeCutList(
  recipeId: string,
  size: ObjectSize,
  params: ObjectParams,
): CutListSummary {
  const W = Math.max(200, Math.round(size.widthMm));
  const D = Math.max(150, Math.round(size.depthMm));
  const H = Math.max(200, Math.round(size.heightMm));
  const t = str(params, 'boardMm', '18') === '36' ? 36 : 18;
  const boardMat = t === 36 ? 'PAL/MDF 36 mm (dublat)' : 'PAL melaminat 18 mm';
  const frontMat = 'MDF / PAL front 18 mm';

  const panels: CutPanel[] = [];
  const hardware: HardwareItem[] = [];
  let pIdx = 0;

  const addPanel = (
    part: string,
    role: CutPanel['role'],
    material: string,
    lengthMm: number,
    widthMm: number,
    thicknessMm: number,
    qty: number,
    /** Laturi căntuite: ex. `'2L+2W'` sau `'1L'` sau `'none'`. */
    edges: 'all' | 'front1' | 'front1+2side' | 'none',
  ) => {
    const L = Math.max(50, Math.round(lengthMm));
    const B = Math.max(50, Math.round(widthMm));
    if (qty <= 0) return;
    const edgeMm =
      edges === 'all'
        ? 2 * (L + B)
        : edges === 'front1+2side'
          ? L + 2 * B
          : edges === 'front1'
            ? L
            : 0;
    const areaM2 = round2(((L * B) / 1_000_000) * qty);
    panels.push({
      id: `p${++pIdx}`,
      part,
      role,
      material,
      lengthMm: L,
      widthMm: B,
      thicknessMm,
      qty,
      edgeBandPerPieceMm: edgeMm,
      areaM2,
    });
  };

  const addHw = (id: string, name: string, qty: number, unit: string, unitPriceMinor: number) => {
    if (qty <= 0) return;
    hardware.push({ id, name, qty, unit, unitPriceMinor, totalMinor: qty * unitPriceMinor });
  };

  if (recipeId === 'custom-wardrobe') {
    const cols = Math.max(1, Math.min(6, Math.round(num(params, 'columns', 3))));
    const doorStyle = str(params, 'doorStyle', 'hinged');
    const shelves = Math.max(0, Math.min(8, Math.round(num(params, 'shelves', 4))));
    const drawers = Math.max(0, Math.min(8, Math.round(num(params, 'drawers', 3))));
    const hangingRod = bool(params, 'hangingRod', true);
    const base = str(params, 'base', 'plinth');
    const baseH = base === 'none' ? 0 : base === 'legs' ? 120 : 100;
    const carcassH = H - baseH;
    const doorT = doorStyle === 'open' ? 0 : doorStyle === 'sliding' ? 60 : 20;
    const carcassD = Math.max(200, D - doorT);
    const innerW = Math.max(100, W - 2 * t);
    const colW = Math.max(100, Math.round((innerW - (cols - 1) * t) / cols));

    addPanel('Lateral exterior', 'body', boardMat, carcassH, carcassD, t, 2, 'front1+2side');
    addPanel('Capac & Fund', 'body', boardMat, innerW, carcassD, t, 2, 'front1');
    if (cols > 1) {
      addPanel(
        'Despărțitor vertical',
        'body',
        boardMat,
        carcassH - 2 * t,
        carcassD - 10,
        t,
        cols - 1,
        'front1',
      );
    }
    if (base === 'plinth') {
      addPanel('Soclu față/spate', 'body', boardMat, innerW, baseH, t, 2, 'front1');
    }
    if (shelves > 0) {
      addPanel('Poliță interioară', 'body', boardMat, colW, carcassD - 30, 18, shelves, 'front1');
    }
    if (drawers > 0) {
      const drW = Math.max(120, colW - 26);
      const drD = Math.max(200, carcassD - 70);
      addPanel('Front sertar interior', 'front', frontMat, colW - 6, 175, 18, drawers, 'all');
      addPanel('Lateral sertar', 'body', 'PAL 18 mm', drD, 140, 18, drawers * 2, 'front1');
      addPanel(
        'Spate / față interioară sertar',
        'body',
        'PAL 18 mm',
        drW,
        140,
        18,
        drawers * 2,
        'front1',
      );
      addPanel('Fund sertar (PFL)', 'back', 'PFL/HDF 4 mm', drW, drD, 4, drawers, 'none');
      addHw('slides', 'Set glisiere sertar cu amortizare', drawers, 'set', 6500);
    }
    addPanel('Spate PFL / HDF', 'back', 'PFL/HDF 4 mm', carcassH - 6, W - 6, 4, 1, 'none');

    if (doorStyle === 'hinged') {
      const doorCount = Math.max(1, cols);
      const doorW = Math.round(W / doorCount) - 4;
      const doorH = carcassH - 4;
      addPanel('Front ușă batantă', 'front', frontMat, doorH, doorW, 18, doorCount, 'all');
      const hingesPerDoor = doorH > 2000 ? 5 : doorH > 1500 ? 4 : 3;
      addHw('hinges', 'Balama aplicată cu amortizare', doorCount * hingesPerDoor, 'buc', 1800);
      addHw('handles', 'Mâner profil / bară', doorCount, 'buc', 3500);
    } else if (doorStyle === 'sliding') {
      const doorCount = Math.max(2, Math.min(4, cols));
      const doorW = Math.round(W / doorCount) + 25;
      const doorH = carcassH - 40;
      addPanel('Foaie ușă culisantă', 'front', frontMat, doorH, doorW, 18, doorCount, 'all');
      addHw('sliding-kit', 'Sistem complet uși culisante (șine + role)', 1, 'set', 48000);
    }
    if (hangingRod) {
      addHw(
        'rod',
        'Bară haine aluminiu + suporturi',
        Math.max(1, Math.floor(cols / 2)),
        'set',
        4500,
      );
    }
    if (base === 'legs') {
      addHw('legs', 'Picior reglabil mobilier', Math.max(4, cols * 2 + 2), 'buc', 1200);
    }
    addHw('fasteners', 'Dibluri, demontabili & șuruburi asamblare', 1, 'set', 5500);
  } else if (recipeId === 'custom-kitchen') {
    const unitType = str(params, 'unitType', 'base');
    const frontStyle = str(params, 'frontStyle', 'combo');
    const fronts = Math.max(1, Math.min(4, Math.round(num(params, 'fronts', 2))));
    const handles = str(params, 'handles', 'classic');
    const worktop = unitType === 'base' && bool(params, 'worktop', true);
    const baseH = unitType === 'wall' ? 0 : 100;
    const topT = worktop ? 38 : 0;
    const carcassH = Math.max(250, H - baseH - topT);
    const carcassD = Math.max(200, D - (frontStyle === 'open' ? 0 : 20));
    const innerW = Math.max(100, W - 2 * t);

    addPanel('Lateral corp', 'body', boardMat, carcassH, carcassD, t, 2, 'front1+2side');
    addPanel('Fund & Legături sus', 'body', boardMat, innerW, carcassD, t, 2, 'front1');
    const shelfCount = unitType === 'tall' ? 4 : unitType === 'wall' ? 2 : 1;
    addPanel(
      'Poliță reglabilă',
      'body',
      'PAL 18 mm',
      innerW - 2,
      carcassD - 30,
      18,
      shelfCount,
      'front1',
    );
    addPanel('Spate PFL / HDF', 'back', 'PFL/HDF 4 mm', carcassH - 6, W - 6, 4, 1, 'none');

    if (worktop) {
      addPanel('Blat termorezistent 38 mm', 'top', 'Blat 38 mm', W, D, 38, 1, 'front1+2side');
    }
    if (baseH > 0) {
      addPanel('Soclu bucătărie', 'body', boardMat, W - 4, baseH, 18, 1, 'front1');
      addHw('legs', 'Picior reglabil bucătărie + clips soclu', W > 900 ? 6 : 4, 'buc', 1000);
    } else {
      addHw('wall-hangers', 'Set agățători reglabili corp suspendat', 2, 'set', 2200);
    }

    if (frontStyle === 'drawers') {
      const drH = Math.round(carcassH / fronts) - 4;
      addPanel('Front sertar bucătărie', 'front', frontMat, W - 4, drH, 18, fronts, 'all');
      addHw('slides', 'Set glisiere tandem extragere totală', fronts, 'set', 9500);
      if (handles === 'classic') addHw('handles', 'Mâner bucătărie', fronts, 'buc', 2800);
      else addHw('push', 'Sistem push-to-open', fronts, 'buc', 2200);
    } else if (frontStyle === 'doors') {
      const dW = Math.round(W / fronts) - 4;
      addPanel('Front ușă bucătărie', 'front', frontMat, carcassH - 4, dW, 18, fronts, 'all');
      addHw('hinges', 'Balama soft-close', fronts * (unitType === 'tall' ? 4 : 2), 'buc', 1800);
      if (handles === 'classic') addHw('handles', 'Mâner bucătărie', fronts, 'buc', 2800);
      else addHw('push', 'Sistem push-to-open', fronts, 'buc', 2200);
    } else if (frontStyle === 'combo') {
      const topDrH = Math.min(180, Math.round(carcassH * 0.25));
      const lowerH = carcassH - topDrH - 6;
      const dW = Math.round(W / fronts) - 4;
      addPanel('Front sertar superior', 'front', frontMat, W - 4, topDrH, 18, 1, 'all');
      addPanel('Front ușă inferioară', 'front', frontMat, lowerH, dW, 18, fronts, 'all');
      addHw('slides', 'Set glisiere tandem', 1, 'set', 9500);
      addHw('hinges', 'Balama soft-close', fronts * 2, 'buc', 1800);
      if (handles === 'classic') addHw('handles', 'Mâner bucătărie', fronts + 1, 'buc', 2800);
      else addHw('push', 'Sistem push-to-open', fronts + 1, 'buc', 2200);
    }
    addHw('fasteners', 'Feronerie asamblare & colțare', 1, 'set', 3500);
  } else if (recipeId === 'custom-bookcase') {
    const cols = Math.max(1, Math.min(6, Math.round(num(params, 'columns', 3))));
    const rows = Math.max(2, Math.min(8, Math.round(num(params, 'rows', 5))));
    const lowerStorage = str(params, 'lowerStorage', 'doors');
    const back = bool(params, 'back', true);
    const innerW = Math.max(100, W - 2 * t);
    const colW = Math.max(100, Math.round((innerW - (cols - 1) * t) / cols));

    addPanel('Lateral bibliotecă', 'body', boardMat, H, D, t, 2, 'front1+2side');
    addPanel('Capac & Fund', 'body', boardMat, innerW, D, t, 2, 'front1');
    if (cols > 1) {
      addPanel(
        'Montant vertical interior',
        'body',
        boardMat,
        H - 2 * t,
        D - 6,
        t,
        cols - 1,
        'front1',
      );
    }
    addPanel('Poliță bibliotecă', 'body', boardMat, colW, D - 10, t, (rows - 1) * cols, 'front1');
    if (back) {
      addPanel('Spate PFL / HDF', 'back', 'PFL/HDF 4 mm', H - 6, W - 6, 4, 1, 'none');
    }
    if (lowerStorage === 'doors') {
      const doorH = Math.round(H * 0.28);
      addPanel('Front ușă zonă inferioară', 'front', frontMat, doorH, colW - 4, 18, cols, 'all');
      addHw('hinges', 'Balama soft-close', cols * 2, 'buc', 1800);
      addHw('handles', 'Mâner / buton mobilier', cols, 'buc', 2500);
    } else if (lowerStorage === 'drawers') {
      const drH = Math.round(H * 0.25);
      addPanel('Front sertar inferior', 'front', frontMat, colW - 4, drH, 18, cols, 'all');
      addHw('slides', 'Set glisiere sertar', cols, 'set', 6500);
      addHw('handles', 'Mâner sertar', cols, 'buc', 2500);
    }
    addHw('fasteners', 'Demontabili excentrici & prindere perete', 1, 'set', 4500);
  } else {
    // custom-desk (Birou / Insulă / Comodă la comandă)
    const drawersSide = str(params, 'drawersSide', 'right');
    const drawersCount = Math.max(1, Math.min(5, Math.round(num(params, 'drawersCount', 3))));
    const frameStyle = str(params, 'frameStyle', 'panels');
    const thickTop = bool(params, 'thickTop', true);
    const topT = thickTop ? 36 : t;
    const legH = H - topT;
    const pedCount = drawersSide === 'both' ? 2 : drawersSide === 'none' ? 0 : 1;
    const pedW = Math.min(480, Math.round(W * 0.3));

    addPanel(
      'Blat birou / comodă',
      'top',
      thickTop ? 'PAL/MDF 36 mm (dublat)' : boardMat,
      W,
      D,
      topT,
      1,
      'all',
    );
    if (frameStyle === 'panels') {
      const openSides = 2 - pedCount;
      if (openSides > 0) {
        addPanel('Picior panou lateral', 'body', boardMat, legH, D - 40, t, openSides, 'all');
      }
      addPanel(
        'Panou legătură spate',
        'body',
        boardMat,
        Math.max(200, W - pedCount * pedW - 2 * t),
        Math.round(legH * 0.45),
        18,
        1,
        'front1',
      );
    } else {
      addHw(
        'metal-frame',
        'Cadru metalic sudat vopsit electrostatic',
        2 - pedCount || 1,
        'buc',
        22000,
      );
    }

    if (pedCount > 0) {
      addPanel(
        'Lateral corp sertare',
        'body',
        boardMat,
        legH,
        D - 30,
        t,
        pedCount * 2,
        'front1+2side',
      );
      addPanel('Fund corp sertare', 'body', boardMat, pedW - 2 * t, D - 30, t, pedCount, 'front1');
      addPanel(
        'Spate corp sertare',
        'back',
        'PFL/HDF 4 mm',
        legH - 10,
        pedW - 6,
        4,
        pedCount,
        'none',
      );
      const totalDrawers = pedCount * drawersCount;
      const drH = Math.max(90, Math.round((legH - 30) / drawersCount) - 4);
      addPanel('Front sertar', 'front', frontMat, pedW - 4, drH, 18, totalDrawers, 'all');
      addPanel(
        'Cutie sertar (laterale + spate)',
        'body',
        'PAL 18 mm',
        D - 100,
        Math.max(70, drH - 30),
        18,
        totalDrawers * 3,
        'front1',
      );
      addHw('slides', 'Set glisiere sertar cu amortizare', totalDrawers, 'set', 6500);
      addHw('handles', 'Mâner sertar', totalDrawers, 'buc', 2500);
    }
    addHw('fasteners', 'Set șuruburi, demontabili & alunecători', 1, 'set', 3800);
  }

  let boardNetM2 = 0;
  let boardCostMinor = 0;
  let backAreaM2 = 0;
  let edgeBandMm = 0;
  for (const p of panels) {
    edgeBandMm += p.edgeBandPerPieceMm * p.qty;
    if (p.role === 'back') {
      backAreaM2 += p.areaM2;
    } else {
      boardNetM2 += p.areaM2;
      const unitRate = p.thicknessMm >= 32 ? PRICE_BOARD_36_M2_MINOR : PRICE_BOARD_M2_MINOR;
      boardCostMinor += Math.round(p.areaM2 * WASTE_FACTOR * unitRate);
    }
  }

  const boardAreaNetM2 = round2(boardNetM2);
  const boardAreaGrossM2 = round2(boardNetM2 * WASTE_FACTOR);
  const backArea = round2(backAreaM2);
  const edgeBandMl = round2(edgeBandMm / 1000);
  const sheetsNeeded =
    boardAreaGrossM2 > 0 ? Math.max(1, Math.ceil(boardAreaGrossM2 / SHEET_AREA_M2)) : 0;

  const backMinor = Math.round(backArea * WASTE_FACTOR * PRICE_BACK_M2_MINOR);
  const edgeBandMinor = Math.round(edgeBandMl * PRICE_EDGE_ML_MINOR);
  const hardwareMinor = hardware.reduce((s, h) => s + h.totalMinor, 0);
  const cuttingMinor = Math.round(boardAreaGrossM2 * PRICE_CUTTING_M2_MINOR);
  const totalMinor = boardCostMinor + backMinor + edgeBandMinor + hardwareMinor + cuttingMinor;

  return {
    panels,
    hardware,
    boardAreaNetM2,
    boardAreaGrossM2,
    backAreaM2: backArea,
    sheetsNeeded,
    edgeBandMl,
    cost: {
      boardsMinor: boardCostMinor,
      backMinor,
      edgeBandMinor,
      hardwareMinor,
      cuttingMinor,
      totalMinor,
    },
  };
}

const csvSafe = (s: string, sep: string): string => {
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return guarded.includes(sep) || guarded.includes('"') || guarded.includes('\n')
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
};

/** Exportă fișa de debitare (panouri + feronerie + sumar) ca CSV UTF-8 cu BOM, gata pentru atelier. */
export function cutListToCsv(
  pieceName: string,
  size: ObjectSize,
  cutList: CutListSummary,
  sep: ';' | ',' = ';',
): string {
  const row = (cols: Array<string | number>) => cols.map((c) => csvSafe(String(c), sep)).join(sep);
  const lines: string[] = [
    row(['Fișă debitare', pieceName, `${size.widthMm} × ${size.depthMm} × ${size.heightMm} mm`]),
    '',
    row([
      'Piesă',
      'Material',
      'Lungime (mm)',
      'Lățime (mm)',
      'Grosime (mm)',
      'Cantitate',
      'Arie totală (m²)',
      'Cant ABS total (ml)',
    ]),
    ...cutList.panels.map((p) =>
      row([
        p.part,
        p.material,
        p.lengthMm,
        p.widthMm,
        p.thicknessMm,
        p.qty,
        p.areaM2.toFixed(2),
        ((p.edgeBandPerPieceMm * p.qty) / 1000).toFixed(2),
      ]),
    ),
    '',
    row(['Feronerie', 'Cantitate', 'UM', 'Preț unitar estimat (RON)', 'Total (RON)']),
    ...cutList.hardware.map((h) =>
      row([
        h.name,
        h.qty,
        h.unit,
        (h.unitPriceMinor / 100).toFixed(2),
        (h.totalMinor / 100).toFixed(2),
      ]),
    ),
    '',
    row(['Sumar', 'Valoare']),
    row(['Suprafață netă PAL/MDF (m²)', cutList.boardAreaNetM2.toFixed(2)]),
    row(['Suprafață brută cu 15% pierdere (m²)', cutList.boardAreaGrossM2.toFixed(2)]),
    row(['Coli standard 2800×2070 mm estimate', cutList.sheetsNeeded]),
    row(['Spate PFL/HDF (m²)', cutList.backAreaM2.toFixed(2)]),
    row(['Total cant ABS (ml)', cutList.edgeBandMl.toFixed(2)]),
    row(['Cost estimativ demonstrativ (RON)', (cutList.cost.totalMinor / 100).toFixed(2)]),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
