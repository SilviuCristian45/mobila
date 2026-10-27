import { emptyProject } from '@/domain/fixtures';
import type { ProjectDocument } from '@/domain/schema';

export function mk(nodes: Array<[string, number, number]>, walls: Array<[string, string, string, number?]>, rooms: Record<string, string[]> = {}): ProjectDocument {
  const d = emptyProject('t', 't');
  for (const [id, x, y] of nodes) d.nodes[id] = { id, levelId: 'L1', x, y };
  for (const [id, a, b, t] of walls) d.walls[id] = { id, levelId: 'L1', startNodeId: a, endNodeId: b, thicknessMm: t ?? 100, heightMm: 2600, baseOffsetMm: 0 };
  for (const [id, loop] of Object.entries(rooms)) d.rooms[id] = { id, levelId: 'L1', name: id, type: 'other', nodeLoop: loop };
  return d;
}
