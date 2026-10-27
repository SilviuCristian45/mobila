// Modelul central al proiectului (docs/DATA_MODEL.md). O singură definiție pentru tip și validare.
// Din acest document se reconstruiesc planul 2D, scena 3D și bugetul — fără alt catalog.
import { z } from 'zod';

export const CURRENT_VERSION = 1;

/** Limite anti-abuz pentru fișierele importate (nu limite de produs). */
export const MAX_ENTITIES_PER_TABLE = 10_000;
export const MAX_NAME_LENGTH = 200;

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export const IdSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/,
    'ID invalid (1–64 caractere: litere, cifre, . _ : -)',
  )
  .refine((s) => !RESERVED_IDS.has(s), 'ID rezervat');

const MmSchema = z.number().int();
const PosMmSchema = z.number().int().positive();
const MinorSchema = z.number().int();
const BpSchema = z.number().int().min(0).max(100_000);
const HexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'culoare #rrggbb');
const NameSchema = z.string().max(MAX_NAME_LENGTH);
const IsoDateSchema = z.string().min(10).max(40);

/** Tabel `Record<Id, T>` cu limită de mărime; cheia trebuie să fie un ID valid. */
const table = <T extends z.ZodType>(value: T) =>
  z
    .record(IdSchema, value)
    .refine((r) => Object.keys(r).length <= MAX_ENTITIES_PER_TABLE, 'prea multe intrări');

const LocalizedTextSchema = z.strictObject({ ro: NameSchema, en: NameSchema.optional() });
const ProvenanceSchema = z.strictObject({
  origin: z.enum(['original', 'external']),
  license: z.string().min(1).max(100),
  author: z.string().max(200).optional(),
  sourceUrl: z.string().max(500).optional(),
});
const RangeSchema = z
  .strictObject({ min: PosMmSchema, max: PosMmSchema })
  .refine((r) => r.min <= r.max, 'min > max');

const ParamSpecSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('number'),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    default: z.number(),
    unit: z.enum(['mm', 'deg', 'count']),
  }),
  z.strictObject({
    type: z.literal('enum'),
    options: z.array(z.string()).min(1),
    default: z.string(),
  }),
  z.strictObject({ type: z.literal('bool'), default: z.boolean() }),
]);

export const CatalogItemSchema = z.strictObject({
  id: z.string().min(1).max(100),
  version: z.number().int().positive(),
  kind: z.enum(['furniture', 'sanitary', 'mirror', 'lighting', 'decor']),
  category: z.string().max(100),
  name: LocalizedTextSchema,
  defaultSize: z.strictObject({
    widthMm: PosMmSchema,
    depthMm: PosMmSchema,
    heightMm: PosMmSchema,
  }),
  sizeLimits: z.strictObject({ widthMm: RangeSchema, depthMm: RangeSchema, heightMm: RangeSchema }),
  mounting: z.enum(['floor', 'wall', 'ceiling']),
  defaultElevationMm: MmSchema,
  recipe: z.strictObject({ id: z.string().min(1).max(100), version: z.number().int().positive() }),
  paramSpecs: z.record(z.string().max(100), ParamSpecSchema),
  defaultColorHex: HexSchema.optional(),
  reference: z
    .strictObject({
      priceMinor: MinorSchema.min(0),
      currency: z.string().length(3),
      vatIncluded: z.boolean(),
      origin: z.enum(['demo', 'user']),
    })
    .optional(),
  tags: z.array(z.string().max(50)).max(50).optional(),
  provenance: ProvenanceSchema,
});

const AppearanceSchema = z.strictObject({
  baseColorHex: HexSchema,
  roughness: z.number().min(0).max(1),
  texture: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('solid') }),
    z.strictObject({
      type: z.literal('procedural'),
      pattern: z.enum(['tile_grid', 'plank']),
      groutColorHex: HexSchema,
      offsetPct: z.union([z.literal(0), z.literal(33), z.literal(50)]),
      toneVariation: z.number().min(0).max(1),
      seed: z.number().int(),
    }),
  ]),
});

export const FinishSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    version: z.number().int().positive(),
    kind: z.enum(['tile', 'wall_tile', 'parquet', 'paint']),
    name: LocalizedTextSchema,
    appearance: AppearanceSchema,
    priceUnit: z.enum(['m2', 'box', 'piece', 'liter', 'can']),
    unitPriceMinor: MinorSchema.min(0),
    priceOrigin: z.enum(['demo', 'user']),
    vatBp: BpSchema.optional(),
    tile: z
      .strictObject({
        pieceWidthMm: PosMmSchema,
        pieceHeightMm: PosMmSchema,
        groutMm: z.number().int().min(0),
        piecesPerBox: z.number().int().positive().optional(),
        boxCoverageM2: z.number().positive().optional(),
      })
      .optional(),
    paint: z
      .strictObject({
        coverageM2PerLiter: z.number().positive(),
        coats: z.number().int().positive(),
        canVolumeLiters: z.number().positive(),
      })
      .optional(),
    defaultWastePct: z.number().min(0).max(100),
    provenance: ProvenanceSchema,
  })
  .superRefine((f, ctx) => {
    const isPaint = f.kind === 'paint';
    if (isPaint && (!f.paint || f.tile))
      ctx.addIssue({ code: 'custom', message: 'vopseaua cere `paint` și nu `tile`' });
    if (!isPaint && (!f.tile || f.paint))
      ctx.addIssue({
        code: 'custom',
        message: 'gresia/faianța/parchetul cer `tile` și nu `paint`',
      });
  });

const SettingsSchema = z.strictObject({
  currency: z.string().length(3),
  pricesIncludeVat: z.boolean(),
  defaultVatBp: BpSchema,
  contingencyBp: BpSchema,
  defaultWallHeightMm: PosMmSchema,
  defaultWallThicknessMm: PosMmSchema.refine((n) => n % 2 === 0, 'grosimea trebuie să fie pară'),
  gridMm: PosMmSchema,
  openingEdgeMarginMm: z.number().int().min(0),
  openingGapMm: z.number().int().min(0),
  displayUnit: z.enum(['mm', 'cm', 'm']),
});

const FinishTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('roomFloor'), roomId: IdSchema }),
  z.strictObject({
    kind: z.literal('wallSide'),
    wallId: IdSchema,
    side: z.enum(['left', 'right']),
  }),
]);

const QuantityBindingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('roomFloorArea'), roomId: IdSchema }),
  z.strictObject({ kind: z.literal('assignmentArea'), assignmentId: IdSchema }),
  z.strictObject({ kind: z.literal('roomWallArea'), roomId: IdSchema }),
]);

export const BUDGET_CATEGORIES = [
  'furniture',
  'sanitary',
  'mirror',
  'lighting',
  'decor',
  'flooring',
  'wall_finish',
  'paint',
  'labor',
  'transport',
  'other',
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];
export const UNITS = ['buc', 'm2', 'ml', 'l', 'cutie', 'doza', 'h', 'zi', 'lot'] as const;
export type Unit = (typeof UNITS)[number];

export const LineOverrideSchema = z.strictObject({
  unitPriceMinor: MinorSchema.min(0).optional(),
  quantity: z.number().min(0).optional(),
  vatBp: BpSchema.optional(),
  excluded: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});

export const ManualLineSchema = z.strictObject({
  id: IdSchema,
  category: z.enum(BUDGET_CATEGORIES),
  description: NameSchema,
  roomId: IdSchema.nullable().optional(),
  unit: z.enum(UNITS),
  quantity: z.number().min(0),
  binding: QuantityBindingSchema.optional(),
  unitPriceMinor: MinorSchema.min(0),
  vatBp: BpSchema,
  excluded: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});

export const ProjectDocumentSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_VERSION),
  id: IdSchema,
  name: NameSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  settings: SettingsSchema,
  levels: table(
    z.strictObject({
      id: IdSchema,
      name: NameSchema,
      elevationMm: MmSchema,
      ceilingHeightMm: PosMmSchema,
    }),
  ),
  nodes: table(z.strictObject({ id: IdSchema, levelId: IdSchema, x: MmSchema, y: MmSchema })),
  walls: table(
    z.strictObject({
      id: IdSchema,
      levelId: IdSchema,
      startNodeId: IdSchema,
      endNodeId: IdSchema,
      thicknessMm: PosMmSchema.refine(
        (n) => n % 2 === 0,
        'grosimea trebuie să fie un număr PAR de mm',
      ),
      heightMm: PosMmSchema,
      baseOffsetMm: MmSchema,
    }),
  ),
  openings: table(
    z.strictObject({
      id: IdSchema,
      wallId: IdSchema,
      type: z.enum(['door', 'window']),
      offsetMm: MmSchema,
      widthMm: PosMmSchema,
      heightMm: PosMmSchema,
      sillHeightMm: z.number().int().min(0),
      swing: z
        .strictObject({ hinge: z.enum(['start', 'end']), side: z.enum(['left', 'right']) })
        .optional(),
      catalogItemId: z.string().max(100).optional(),
    }),
  ),
  rooms: table(
    z.strictObject({
      id: IdSchema,
      levelId: IdSchema,
      name: NameSchema,
      type: z.enum([
        'living',
        'bedroom',
        'kitchen',
        'bathroom',
        'hall',
        'office',
        'storage',
        'other',
      ]),
      nodeLoop: z.array(IdSchema).min(3).max(500),
      ceilingHeightMm: PosMmSchema.optional(),
    }),
  ),
  objects: table(
    z.strictObject({
      id: IdSchema,
      levelId: IdSchema,
      catalogItemId: z.string().min(1).max(100),
      name: NameSchema.optional(),
      position: z.strictObject({ x: MmSchema, y: MmSchema }),
      elevationMm: MmSchema,
      rotationDeg: z.number().min(0).lt(360),
      mirrored: z.boolean().optional(),
      size: z.strictObject({ widthMm: PosMmSchema, depthMm: PosMmSchema, heightMm: PosMmSchema }),
      params: z.record(
        z.string().max(100),
        z.union([z.number(), z.string().max(200), z.boolean()]),
      ),
      colorHex: HexSchema.optional(),
      wallId: IdSchema.optional(),
      note: z.string().max(1000).optional(),
    }),
  ),
  finishAssignments: table(
    z.strictObject({
      id: IdSchema,
      target: FinishTargetSchema,
      finishId: z.string().min(1).max(100),
      wastePct: z.number().min(0).max(100),
      coveredHeightMm: PosMmSchema.optional(),
      fromHeightMm: z.number().int().min(0).optional(),
      layout: z.enum(['straight', 'diagonal']).optional(),
    }),
  ),
  catalogSnapshot: z.strictObject({
    items: z.record(z.string().min(1).max(100), CatalogItemSchema),
    finishes: z.record(z.string().min(1).max(100), FinishSchema),
  }),
  budget: z.strictObject({
    overrides: z.record(z.string().min(1).max(120), LineOverrideSchema),
    manualLines: table(ManualLineSchema),
  }),
});

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;
export type CatalogItem = z.infer<typeof CatalogItemSchema>;
export type Finish = z.infer<typeof FinishSchema>;
export type Level = ProjectDocument['levels'][string];
export type PlanNode = ProjectDocument['nodes'][string];
export type Wall = ProjectDocument['walls'][string];
export type Opening = ProjectDocument['openings'][string];
export type Room = ProjectDocument['rooms'][string];
export type PlacedObject = ProjectDocument['objects'][string];
export type FinishAssignment = ProjectDocument['finishAssignments'][string];
export type FinishTarget = FinishAssignment['target'];
export type LineOverride = z.infer<typeof LineOverrideSchema>;
export type ManualLine = z.infer<typeof ManualLineSchema>;
export type ProjectSettings = ProjectDocument['settings'];
export type WallSide = 'left' | 'right';

export const RoomcraftFileSchema = z.strictObject({
  format: z.literal('roomcraft'),
  formatVersion: z.number().int(),
  exportedAt: IsoDateSchema,
  generator: z.strictObject({ app: z.string().max(100), version: z.string().max(50) }),
  project: z.unknown(),
  assets: z.array(z.unknown()).max(0, 'asset-urile nu sunt suportate în versiunea 1'),
});
export type RoomcraftFile = z.infer<typeof RoomcraftFileSchema>;
