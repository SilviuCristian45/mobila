// SPIKE — „catalogul încorporat” al aplicației. Testul de autonomie îl înlocuiește cu unul gol.
import type { CatalogItem, Finish } from './schema';

const prov = { origin: 'original' as const, license: 'proprietar-proiect' };

export const SOFA: CatalogItem = {
  id: 'furn.sofa.3seat', version: 1, kind: 'furniture', category: 'canapele', name: { ro: 'Canapea 3 locuri' },
  defaultSize: { widthMm: 2000, depthMm: 900, heightMm: 850 },
  sizeLimits: { widthMm: { min: 1600, max: 2800 }, depthMm: { min: 800, max: 1100 }, heightMm: { min: 700, max: 1000 } },
  mounting: 'floor', defaultElevationMm: 0, recipe: { id: 'sofa', version: 1 },
  paramSpecs: { seats: { type: 'number', min: 2, max: 4, step: 1, default: 3, unit: 'count' } },
  defaultColorHex: '#8a9ba8', reference: { priceMinor: 220000, currency: 'RON', vatIncluded: true, origin: 'demo' }, provenance: prov,
};
export const PENDANT: CatalogItem = {
  id: 'light.pendant.shade', version: 1, kind: 'lighting', category: 'lustre', name: { ro: 'Pendul cu abajur' },
  defaultSize: { widthMm: 400, depthMm: 400, heightMm: 350 },
  sizeLimits: { widthMm: { min: 250, max: 800 }, depthMm: { min: 250, max: 800 }, heightMm: { min: 200, max: 600 } },
  mounting: 'ceiling', defaultElevationMm: 2250, recipe: { id: 'pendant', version: 1 }, paramSpecs: {},
  reference: { priceMinor: 18000, currency: 'RON', vatIncluded: true, origin: 'demo' }, provenance: prov,
};
export const TILE: Finish = {
  id: 'fin.tile.600', version: 1, kind: 'tile', name: { ro: 'Gresie 60×60' },
  appearance: { baseColorHex: '#c9c4bb', roughness: 0.4, texture: { type: 'procedural', pattern: 'tile_grid', groutColorHex: '#8d8d8d', offsetPct: 0, toneVariation: 0.1, seed: 7 } },
  priceUnit: 'box', unitPriceMinor: 8900, priceOrigin: 'demo', vatBp: 2100,
  tile: { pieceWidthMm: 600, pieceHeightMm: 600, groutMm: 3, piecesPerBox: 4 },
  defaultWastePct: 10, provenance: prov,
};
export const PAINT: Finish = {
  id: 'fin.paint.white', version: 1, kind: 'paint', name: { ro: 'Vopsea lavabilă albă' },
  appearance: { baseColorHex: '#f4f2ee', roughness: 0.9, texture: { type: 'solid' } },
  priceUnit: 'can', unitPriceMinor: 14000, priceOrigin: 'demo', vatBp: 2100,
  paint: { coverageM2PerLiter: 10, coats: 2, canVolumeLiters: 2.5 },
  defaultWastePct: 5, provenance: prov,
};

export let builtinCatalog: { items: Record<string, CatalogItem>; finishes: Record<string, Finish> } = {
  items: { [SOFA.id]: SOFA, [PENDANT.id]: PENDANT },
  finishes: { [TILE.id]: TILE, [PAINT.id]: PAINT },
};
export function setBuiltinCatalog(c: typeof builtinCatalog): void { builtinCatalog = c; }
