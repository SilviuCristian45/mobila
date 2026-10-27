// SPIKE — proiect de referință: 2 camere cu perete comun (T în n2/n3), uși, ferestre, obiecte, finisaje, buget.
import { builtinCatalog } from './catalog';
import type { ProjectDocument } from './schema';

export function emptyProject(id = 'p-ref', name = 'Referință'): ProjectDocument {
  return {
    schemaVersion: 1, id, name, createdAt: '2026-10-27T10:00:00.000Z', updatedAt: '2026-10-27T10:00:00.000Z',
    settings: { currency: 'RON', pricesIncludeVat: true, defaultVatBp: 2100, contingencyBp: 500, defaultWallHeightMm: 2600, defaultWallThicknessMm: 100, gridMm: 100, openingEdgeMarginMm: 50, openingGapMm: 50, displayUnit: 'cm' },
    levels: { L1: { id: 'L1', name: 'Parter', elevationMm: 0, ceilingHeightMm: 2600 } },
    nodes: {}, walls: {}, openings: {}, rooms: {}, objects: {}, finishAssignments: {},
    catalogSnapshot: { items: {}, finishes: {} }, budget: { overrides: {}, manualLines: {} },
  };
}

export function referenceProject(): ProjectDocument {
  const d = emptyProject();
  const N = (id: string, x: number, y: number) => { d.nodes[id] = { id, levelId: 'L1', x, y }; };
  N('n1', 0, 0); N('n2', 4000, 0); N('n3', 4000, 3000); N('n4', 0, 3000); N('n5', 7000, 0); N('n6', 7000, 3000);
  const W = (id: string, a: string, b: string, t = 100) => { d.walls[id] = { id, levelId: 'L1', startNodeId: a, endNodeId: b, thicknessMm: t, heightMm: 2600, baseOffsetMm: 0 }; };
  W('w1', 'n1', 'n2'); W('w2', 'n2', 'n3'); W('w3', 'n3', 'n4'); W('w4', 'n4', 'n1'); W('w5', 'n2', 'n5'); W('w6', 'n5', 'n6'); W('w7', 'n6', 'n3');
  d.rooms.rA = { id: 'rA', levelId: 'L1', name: 'Living', type: 'living', nodeLoop: ['n1', 'n2', 'n3', 'n4'] };
  d.rooms.rB = { id: 'rB', levelId: 'L1', name: 'Dormitor', type: 'bedroom', nodeLoop: ['n2', 'n5', 'n6', 'n3'] };
  d.openings.oDoor = { id: 'oDoor', wallId: 'w2', type: 'door', offsetMm: 1500, widthMm: 900, heightMm: 2100, sillHeightMm: 0 };
  d.openings.oWin = { id: 'oWin', wallId: 'w1', type: 'window', offsetMm: 2000, widthMm: 1200, heightMm: 1200, sillHeightMm: 900 };
  // instantanee din catalog (autonomie D11)
  d.catalogSnapshot.items['furn.sofa.3seat'] = structuredClone(builtinCatalog.items['furn.sofa.3seat']!);
  d.catalogSnapshot.items['light.pendant.shade'] = structuredClone(builtinCatalog.items['light.pendant.shade']!);
  d.catalogSnapshot.finishes['fin.tile.600'] = structuredClone(builtinCatalog.finishes['fin.tile.600']!);
  d.catalogSnapshot.finishes['fin.paint.white'] = structuredClone(builtinCatalog.finishes['fin.paint.white']!);
  d.objects.oSofa = { id: 'oSofa', levelId: 'L1', catalogItemId: 'furn.sofa.3seat', position: { x: 1200, y: 2400 }, elevationMm: 0, rotationDeg: 0, size: { widthMm: 2000, depthMm: 900, heightMm: 850 }, params: { seats: 3 } };
  d.objects.oLamp = { id: 'oLamp', levelId: 'L1', catalogItemId: 'light.pendant.shade', position: { x: 2000, y: 1500 }, elevationMm: 2250, rotationDeg: 0, size: { widthMm: 400, depthMm: 400, heightMm: 350 }, params: {} };
  d.finishAssignments.fFloorA = { id: 'fFloorA', target: { kind: 'roomFloor', roomId: 'rA' }, finishId: 'fin.tile.600', wastePct: 10 };
  // vopsea pe fețele interioare ale camerei A: fața dreaptă a peretelui (traseul n1→n2→n3→n4 e orar, peretii sunt aliniați)
  ['w1', 'w2', 'w3', 'w4'].forEach((w, i) => {
    d.finishAssignments[`fPaint${i}`] = { id: `fPaint${i}`, target: { kind: 'wallSide', wallId: w, side: 'right' }, finishId: 'fin.paint.white', wastePct: 5 };
  });
  d.budget.overrides['object:oLamp'] = { unitPriceMinor: 25000, note: 'ales în magazin' };
  d.budget.manualLines.mLabor = { id: 'mLabor', category: 'labor', description: 'Montaj gresie', roomId: 'rA', unit: 'm2', quantity: 0, binding: { kind: 'roomFloorArea', roomId: 'rA' }, unitPriceMinor: 6000, vatBp: 2100 };
  return d;
}
