import { SOFA, mk, placeObject, withCatalog } from './builders';
import type { ProjectDocument } from '@/domain/schema';

/** 20 camere în grilă 5×4 cu pereți comuni, 300 de obiecte. Pentru măsurători de performanță și corectitudine la scară. */
export function bigProject(): ProjectDocument {
  const nodes: Array<[string, number, number]> = [];
  const walls: Array<[string, string, string]> = [];
  const rooms: Record<string, string[]> = {};
  for (let i = 0; i <= 5; i++)
    for (let j = 0; j <= 4; j++) nodes.push([`g${i}_${j}`, i * 4000, j * 3500]);
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 4; j++) {
      if (i < 5) walls.push([`h${i}_${j}`, `g${i}_${j}`, `g${i + 1}_${j}`]);
      if (j < 4) walls.push([`v${i}_${j}`, `g${i}_${j}`, `g${i}_${j + 1}`]);
    }
  }
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 4; j++)
      rooms[`R${i}_${j}`] = [
        `g${i}_${j}`,
        `g${i + 1}_${j}`,
        `g${i + 1}_${j + 1}`,
        `g${i}_${j + 1}`,
      ];
  const d = mk(nodes, walls, rooms, 'big');
  withCatalog(d, [SOFA], []);
  for (let k = 0; k < 300; k++)
    placeObject(d, `o${k}`, SOFA.id, 500 + (k % 20) * 1000, 500 + Math.floor(k / 20) * 900);
  return d;
}
