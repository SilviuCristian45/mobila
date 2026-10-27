// Construcții de documente pentru teste. Catalogul de aici există DOAR în teste: aplicația nu are (încă) catalog.
import { createEmptyProject } from '@/domain/factory';
import type { CatalogItem, Finish, ProjectDocument } from '@/domain/schema';

export const NOW = '2026-10-27T10:00:00.000Z';
const provenance = { origin: 'original' as const, license: 'proprietar-proiect' };

export function item(partial: Partial<CatalogItem> & Pick<CatalogItem, 'id'>): CatalogItem {
  return {
    version: 1,
    kind: 'furniture',
    category: 'test',
    name: { ro: partial.id },
    defaultSize: { widthMm: 2000, depthMm: 900, heightMm: 850 },
    sizeLimits: {
      widthMm: { min: 1000, max: 3000 },
      depthMm: { min: 500, max: 1200 },
      heightMm: { min: 300, max: 2500 },
    },
    mounting: 'floor',
    defaultElevationMm: 0,
    recipe: { id: 'box', version: 1 },
    paramSpecs: {},
    defaultColorHex: '#8a9ba8',
    reference: { priceMinor: 220000, currency: 'RON', vatIncluded: true, origin: 'demo' },
    provenance,
    ...partial,
  };
}

export function finish(partial: Partial<Finish> & Pick<Finish, 'id' | 'kind'>): Finish {
  const base = {
    version: 1,
    name: { ro: partial.id },
    priceOrigin: 'demo' as const,
    vatBp: 2100,
    defaultWastePct: 10,
    provenance,
    appearance: { baseColorHex: '#c9c4bb', roughness: 0.5, texture: { type: 'solid' as const } },
  };
  if (partial.kind === 'paint') {
    return {
      ...base,
      priceUnit: 'can',
      unitPriceMinor: 14000,
      paint: { coverageM2PerLiter: 10, coats: 2, canVolumeLiters: 2.5 },
      ...partial,
    } as Finish;
  }
  return {
    ...base,
    priceUnit: 'box',
    unitPriceMinor: 8900,
    tile: { pieceWidthMm: 600, pieceHeightMm: 600, groutMm: 3, piecesPerBox: 4 },
    ...partial,
  } as Finish;
}

export const SOFA = item({ id: 'furn.sofa.3seat', defaultColorHex: '#8a9ba8' });
export const PENDANT = item({
  id: 'light.pendant.shade',
  kind: 'lighting',
  mounting: 'ceiling',
  defaultElevationMm: 2250,
  defaultColorHex: undefined,
  defaultSize: { widthMm: 400, depthMm: 400, heightMm: 350 },
  sizeLimits: {
    widthMm: { min: 250, max: 800 },
    depthMm: { min: 250, max: 800 },
    heightMm: { min: 200, max: 600 },
  },
  reference: { priceMinor: 18000, currency: 'RON', vatIncluded: true, origin: 'demo' },
});
export const TILE = finish({ id: 'fin.tile.600', kind: 'tile', name: { ro: 'Gresie 60×60' } });
export const PAINT = finish({
  id: 'fin.paint.white',
  kind: 'paint',
  name: { ro: 'Vopsea albă' },
  defaultWastePct: 5,
});

/** Document gol cu noduri/pereți/camere dintr-o descriere compactă. Toți pereții au 2600 mm înălțime. */
export function mk(
  nodes: Array<[string, number, number]>,
  walls: Array<[string, string, string, number?]>,
  rooms: Record<string, string[]> = {},
  id = 't',
): ProjectDocument {
  const d = createEmptyProject(id, id, NOW);
  for (const [nid, x, y] of nodes) d.nodes[nid] = { id: nid, levelId: 'L1', x, y };
  for (const [wid, a, b, t] of walls)
    d.walls[wid] = {
      id: wid,
      levelId: 'L1',
      startNodeId: a,
      endNodeId: b,
      thicknessMm: t ?? 100,
      heightMm: 2600,
      baseOffsetMm: 0,
    };
  for (const [rid, loop] of Object.entries(rooms))
    d.rooms[rid] = { id: rid, levelId: 'L1', name: rid, type: 'other', nodeLoop: loop };
  return d;
}

export function withCatalog(
  d: ProjectDocument,
  items: CatalogItem[],
  finishes: Finish[],
): ProjectDocument {
  // copii profunde: testele mută/modifică documentele și nu trebuie să contamineze constantele partajate
  for (const i of items)
    d.catalogSnapshot.items[i.id] = JSON.parse(JSON.stringify(i)) as CatalogItem;
  for (const f of finishes)
    d.catalogSnapshot.finishes[f.id] = JSON.parse(JSON.stringify(f)) as Finish;
  return d;
}

export function placeObject(
  d: ProjectDocument,
  id: string,
  catalogItemId: string,
  x: number,
  y: number,
  size?: { widthMm: number; depthMm: number; heightMm: number },
): void {
  const it = d.catalogSnapshot.items[catalogItemId]!;
  d.objects[id] = {
    id,
    levelId: 'L1',
    catalogItemId,
    position: { x, y },
    elevationMm: it.defaultElevationMm,
    rotationDeg: 0,
    size: { ...(size ?? it.defaultSize) },
    params: {},
  };
}

/** Oracolul pentru banii cu TVA, implementat independent cu BigInt (rotunjire „half up” exactă pe raționale). */
export function splitGrossOracle(gross: number, vatBp: number): { net: number; vat: number } {
  const num = BigInt(gross) * 10000n * 2n + BigInt(10000 + vatBp);
  const net = num / (2n * BigInt(10000 + vatBp));
  return { net: Number(net), vat: gross - Number(net) };
}
export function netToGrossOracle(net: number, vatBp: number): { vat: number; gross: number } {
  const vat = Number((BigInt(net) * BigInt(vatBp) * 2n + 10000n) / 20000n);
  return { vat, gross: net + vat };
}
