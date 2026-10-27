// SPIKE — proiect mare sintetic: 20 camere (grilă 5×4, pereți comuni) + 300 obiecte. Folosit de teste și de benchmark.
import { referenceProject } from './fixtures';
import type { ProjectDocument } from './schema';

export function bigProject(): ProjectDocument {
  const big = referenceProject();
  big.id = 'p-big';
  big.nodes = {}; big.walls = {}; big.rooms = {}; big.openings = {}; big.objects = {}; big.finishAssignments = {}; big.budget = { overrides: {}, manualLines: {} };
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 4; j++) big.nodes[`g${i}_${j}`] = { id: `g${i}_${j}`, levelId: 'L1', x: i * 4000, y: j * 3500 };
  const W = (id: string, a: string, b: string) => { big.walls[id] = { id, levelId: 'L1', startNodeId: a, endNodeId: b, thicknessMm: 100, heightMm: 2600, baseOffsetMm: 0 }; };
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 4; j++) { if (i < 5) W(`h${i}_${j}`, `g${i}_${j}`, `g${i + 1}_${j}`); if (j < 4) W(`v${i}_${j}`, `g${i}_${j}`, `g${i}_${j + 1}`); }
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) big.rooms[`R${i}_${j}`] = { id: `R${i}_${j}`, levelId: 'L1', name: `R${i}_${j}`, type: 'other', nodeLoop: [`g${i}_${j}`, `g${i + 1}_${j}`, `g${i + 1}_${j + 1}`, `g${i}_${j + 1}`] };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) big.openings[`d${i}_${j}`] = { id: `d${i}_${j}`, wallId: `h${i}_${j}`, type: 'door', offsetMm: 2000, widthMm: 900, heightMm: 2100, sillHeightMm: 0 };
  for (let k = 0; k < 300; k++) big.objects[`o${k}`] = { id: `o${k}`, levelId: 'L1', catalogItemId: 'furn.sofa.3seat', position: { x: 500 + (k % 20) * 1000, y: 500 + Math.floor(k / 20) * 900 }, elevationMm: 0, rotationDeg: (k * 15) % 360, size: { widthMm: 2000, depthMm: 900, heightMm: 850 }, params: {} };
  return big;
}
