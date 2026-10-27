import { SOFA, PENDANT, TILE, PAINT, mk, placeObject, withCatalog } from './builders';
import type { ProjectDocument } from '@/domain/schema';

export interface GridParams {
  cols: number[]; // lățimi de celulă (axe), mm
  rows: number[]; // adâncimi de celulă (axe), mm
  thickness: number; // mm, par
  sofas: number; // câte canapele plasate (în prima celulă)
  tilePct: number;
  priceOverride?: number;
}

/** Proiect valid generat: grilă de camere cu pereți comuni, finisaje și buget; folosit în teste bazate pe proprietăți. */
export function gridProject(p: GridParams): ProjectDocument {
  const xs = [0];
  for (const c of p.cols) xs.push(xs[xs.length - 1]! + c);
  const ys = [0];
  for (const r of p.rows) ys.push(ys[ys.length - 1]! + r);
  const nodes: Array<[string, number, number]> = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = 0; j < ys.length; j++) nodes.push([`n${i}_${j}`, xs[i]!, ys[j]!]);
  const walls: Array<[string, string, string, number]> = [];
  for (let j = 0; j < ys.length; j++)
    for (let i = 0; i < p.cols.length; i++)
      walls.push([`h${i}_${j}`, `n${i}_${j}`, `n${i + 1}_${j}`, p.thickness]);
  for (let i = 0; i < xs.length; i++)
    for (let j = 0; j < p.rows.length; j++)
      walls.push([`v${i}_${j}`, `n${i}_${j}`, `n${i}_${j + 1}`, p.thickness]);
  const rooms: Record<string, string[]> = {};
  for (let i = 0; i < p.cols.length; i++)
    for (let j = 0; j < p.rows.length; j++)
      rooms[`r${i}_${j}`] = [
        `n${i}_${j}`,
        `n${i + 1}_${j}`,
        `n${i + 1}_${j + 1}`,
        `n${i}_${j + 1}`,
      ];
  const d = mk(nodes, walls, rooms, 'grid');
  withCatalog(d, [SOFA, PENDANT], [TILE, PAINT]);
  for (let k = 0; k < p.sofas; k++) placeObject(d, `o${k}`, SOFA.id, 1200 + k * 10, 1200);
  d.finishAssignments.f0 = {
    id: 'f0',
    target: { kind: 'roomFloor', roomId: 'r0_0' },
    finishId: TILE.id,
    wastePct: p.tilePct,
  };
  d.finishAssignments.f1 = {
    id: 'f1',
    target: { kind: 'wallSide', wallId: 'h0_0', side: 'right' },
    finishId: PAINT.id,
    wastePct: 5,
  };
  d.budget.manualLines.m1 = {
    id: 'm1',
    category: 'labor',
    description: 'Montaj',
    roomId: 'r0_0',
    unit: 'm2',
    quantity: 0,
    binding: { kind: 'roomFloorArea', roomId: 'r0_0' },
    unitPriceMinor: 5000,
    vatBp: 2100,
  };
  if (p.priceOverride !== undefined)
    d.budget.overrides[`finish:${TILE.id}`] = { unitPriceMinor: p.priceOverride };
  return d;
}
