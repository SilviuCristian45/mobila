import { CURRENT_VERSION, type ProjectDocument, type ProjectSettings } from './schema';

/** Valori implicite (DATA_MODEL §2). TVA 21%: cota standard din 1 august 2025 (Legea 141/2025, art. 291) — setare editabilă. */
export const DEFAULT_SETTINGS: ProjectSettings = {
  currency: 'RON',
  pricesIncludeVat: true,
  defaultVatBp: 2100,
  contingencyBp: 500,
  defaultWallHeightMm: 2600,
  defaultWallThicknessMm: 100,
  gridMm: 100,
  openingEdgeMarginMm: 50,
  openingGapMm: 50,
  displayUnit: 'cm',
};

export const DEFAULT_LEVEL_ID = 'L1';

/** Proiect gol cu un singur nivel (MVP). `now` și `id` vin din exterior: domeniul nu citește ceasul și nu generează ID-uri. */
export function createEmptyProject(id: string, name: string, now: string): ProjectDocument {
  return {
    schemaVersion: CURRENT_VERSION,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    levels: {
      [DEFAULT_LEVEL_ID]: {
        id: DEFAULT_LEVEL_ID,
        name: 'Parter',
        elevationMm: 0,
        ceilingHeightMm: 2600,
      },
    },
    nodes: {},
    walls: {},
    openings: {},
    rooms: {},
    objects: {},
    finishAssignments: {},
    catalogSnapshot: { items: {}, finishes: {} },
    budget: { overrides: {}, manualLines: {} },
  };
}

/** Copie profundă a unui document (JSON-safe), fără `structuredClone` (API de platformă). */
export function cloneDocument(doc: ProjectDocument): ProjectDocument {
  return JSON.parse(JSON.stringify(doc)) as ProjectDocument;
}
