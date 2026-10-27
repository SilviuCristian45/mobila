// Proiecte de referință. Valorile așteptate din teste sunt calculate INDEPENDENT (manual / formule analitice),
// nu citite din rezultatul codului.
import type { ProjectDocument } from '@/domain/schema';
import { PAINT, PENDANT, SOFA, TILE, finish, mk, placeObject, withCatalog } from './builders';

/**
 * „Garsonieră”: două camere cu perete comun (T în n2 și n3), axe 4000×3000 + 3000×3000, pereți de 100 mm.
 * Interior A = 3900×2900 = 11,31 m²; interior B = 2900×2900 = 8,41 m².
 */
export function studioProject(): ProjectDocument {
  const d = mk(
    [
      ['n1', 0, 0],
      ['n2', 4000, 0],
      ['n3', 4000, 3000],
      ['n4', 0, 3000],
      ['n5', 7000, 0],
      ['n6', 7000, 3000],
    ],
    [
      ['w1', 'n1', 'n2'],
      ['w2', 'n2', 'n3'],
      ['w3', 'n3', 'n4'],
      ['w4', 'n4', 'n1'],
      ['w5', 'n2', 'n5'],
      ['w6', 'n5', 'n6'],
      ['w7', 'n6', 'n3'],
    ],
    { rA: ['n1', 'n2', 'n3', 'n4'], rB: ['n2', 'n5', 'n6', 'n3'] },
    'studio',
  );
  d.rooms.rA!.name = 'Living';
  d.rooms.rA!.type = 'living';
  d.rooms.rB!.name = 'Dormitor';
  d.rooms.rB!.type = 'bedroom';
  d.openings.oDoor = {
    id: 'oDoor',
    wallId: 'w2',
    type: 'door',
    offsetMm: 1500,
    widthMm: 900,
    heightMm: 2100,
    sillHeightMm: 0,
  };
  d.openings.oWin = {
    id: 'oWin',
    wallId: 'w1',
    type: 'window',
    offsetMm: 2000,
    widthMm: 1200,
    heightMm: 1200,
    sillHeightMm: 900,
  };
  withCatalog(d, [SOFA, PENDANT], [TILE, PAINT]);
  placeObject(d, 'oSofa', SOFA.id, 1200, 2400);
  placeObject(d, 'oLamp', PENDANT.id, 2000, 1500);
  d.finishAssignments.fFloorA = {
    id: 'fFloorA',
    target: { kind: 'roomFloor', roomId: 'rA' },
    finishId: TILE.id,
    wastePct: 10,
  };
  (['w1', 'w2', 'w3', 'w4'] as const).forEach((w, i) => {
    d.finishAssignments[`fPaint${i}`] = {
      id: `fPaint${i}`,
      target: { kind: 'wallSide', wallId: w, side: 'right' },
      finishId: PAINT.id,
      wastePct: 5,
    };
  });
  d.budget.overrides['object:oLamp'] = { unitPriceMinor: 25000, note: 'ales în magazin' };
  d.budget.manualLines.mLabor = {
    id: 'mLabor',
    category: 'labor',
    description: 'Montaj gresie',
    roomId: 'rA',
    unit: 'm2',
    quantity: 0,
    binding: { kind: 'roomFloorArea', roomId: 'rA' },
    unitPriceMinor: 6000,
    vatBp: 2100,
  };
  return d;
}

/**
 * Cameră în L: axe (0,0)(6000,0)(6000,3000)(3000,3000)(3000,5000)(0,5000), pereți de 100 mm.
 * Interior = 5900×2900 + 2900×2000 = 22,91 m². Fața de sus (w1) are 5900 mm.
 * Fereastră în w1; parchet pe podea; faianță 0–1200 și vopsea 1200–2600 pe fața de sus.
 */
export function lShapeProject(): ProjectDocument {
  const d = mk(
    [
      ['a', 0, 0],
      ['b', 6000, 0],
      ['c', 6000, 3000],
      ['d', 3000, 3000],
      ['e', 3000, 5000],
      ['f', 0, 5000],
    ],
    [
      ['w1', 'a', 'b'],
      ['w2', 'b', 'c'],
      ['w3', 'c', 'd'],
      ['w4', 'd', 'e'],
      ['w5', 'e', 'f'],
      ['w6', 'f', 'a'],
    ],
    { rL: ['a', 'b', 'c', 'd', 'e', 'f'] },
    'lshape',
  );
  d.openings.oWin = {
    id: 'oWin',
    wallId: 'w1',
    type: 'window',
    offsetMm: 3000,
    widthMm: 1200,
    heightMm: 1200,
    sillHeightMm: 900,
  };
  const parquet = finish({
    id: 'fin.parquet',
    kind: 'parquet',
    priceUnit: 'box',
    unitPriceMinor: 15000,
    defaultWastePct: 7,
    tile: { pieceWidthMm: 1200, pieceHeightMm: 190, groutMm: 0, boxCoverageM2: 2.28 },
  });
  const faianta = finish({
    id: 'fin.faianta',
    kind: 'wall_tile',
    priceUnit: 'piece',
    unitPriceMinor: 1200,
    defaultWastePct: 10,
    tile: { pieceWidthMm: 300, pieceHeightMm: 600, groutMm: 3 },
  });
  const paint = finish({
    id: 'fin.paint.12',
    kind: 'paint',
    unitPriceMinor: 12000,
    paint: { coverageM2PerLiter: 12, coats: 2, canVolumeLiters: 2.5 },
  });
  withCatalog(d, [SOFA], [parquet, faianta, paint]);
  placeObject(d, 'oSofa', SOFA.id, 2000, 1500);
  d.finishAssignments.aFloor = {
    id: 'aFloor',
    target: { kind: 'roomFloor', roomId: 'rL' },
    finishId: parquet.id,
    wastePct: 7,
  };
  d.finishAssignments.aTile = {
    id: 'aTile',
    target: { kind: 'wallSide', wallId: 'w1', side: 'right' },
    finishId: faianta.id,
    wastePct: 10,
    fromHeightMm: 0,
    coveredHeightMm: 1200,
  };
  d.finishAssignments.aPaint = {
    id: 'aPaint',
    target: { kind: 'wallSide', wallId: 'w1', side: 'right' },
    finishId: paint.id,
    wastePct: 5,
    fromHeightMm: 1200,
    coveredHeightMm: 1400,
  };
  d.budget.manualLines.mLabor = {
    id: 'mLabor',
    category: 'labor',
    description: 'Montaj parchet',
    roomId: 'rL',
    unit: 'm2',
    quantity: 0,
    binding: { kind: 'roomFloorArea', roomId: 'rL' },
    unitPriceMinor: 4500,
    vatBp: 2100,
  };
  return d;
}

/**
 * Patru camere 2×2 în jurul unui nod central cu PATRU pereți. Noduri 3×3 la 0/3000/6000 (x) și 0/2500/5000 (y).
 * Fiecare cameră: axe 3000×2500 → interior 2900×2400 = 6,96 m².
 */
export function crossProject(): ProjectDocument {
  const xs = [0, 3000, 6000];
  const ys = [0, 2500, 5000];
  const nodes: Array<[string, number, number]> = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) nodes.push([`n${i}${j}`, xs[i]!, ys[j]!]);
  const walls: Array<[string, string, string]> = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 2; i++) walls.push([`h${i}${j}`, `n${i}${j}`, `n${i + 1}${j}`]);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) walls.push([`v${i}${j}`, `n${i}${j}`, `n${i}${j + 1}`]);
  const rooms: Record<string, string[]> = {};
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      rooms[`r${i}${j}`] = [`n${i}${j}`, `n${i + 1}${j}`, `n${i + 1}${j + 1}`, `n${i}${j + 1}`];
  return mk(nodes, walls, rooms, 'cross');
}
