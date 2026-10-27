// SPIKE Etapa 0 — subset reprezentativ din DATA_MODEL.md, cu zod (strict).
import { z } from 'zod';

export const CURRENT_VERSION = 1;

const Id = z.string().min(1).max(64);
const Mm = z.number().int();
const PosMm = z.number().int().positive();
const Minor = z.number().int();
const Bp = z.number().int().min(0).max(100000);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Range = z.object({ min: PosMm, max: PosMm }).strict();
const ParamSpec = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), min: z.number(), max: z.number(), step: z.number(), default: z.number(), unit: z.enum(['mm', 'deg', 'count']) }).strict(),
  z.object({ type: z.literal('enum'), options: z.array(z.string()), default: z.string() }).strict(),
  z.object({ type: z.literal('bool'), default: z.boolean() }).strict(),
]);
const Provenance = z.object({ origin: z.enum(['original', 'external']), license: z.string(), author: z.string().optional(), sourceUrl: z.string().optional() }).strict();

export const CatalogItemSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  kind: z.enum(['furniture', 'lighting', 'decor', 'sanitary', 'mirror', 'appliance']),
  category: z.string(),
  name: z.object({ ro: z.string() }).strict(),
  defaultSize: z.object({ widthMm: PosMm, depthMm: PosMm, heightMm: PosMm }).strict(),
  sizeLimits: z.object({ widthMm: Range, depthMm: Range, heightMm: Range }).strict(),
  mounting: z.enum(['floor', 'wall', 'ceiling']),
  defaultElevationMm: Mm,
  recipe: z.object({ id: z.string(), version: z.number().int() }).strict(),
  paramSpecs: z.record(z.string(), ParamSpec),
  defaultColorHex: Hex.optional(),
  reference: z.object({ priceMinor: Minor, currency: z.string(), vatIncluded: z.boolean(), origin: z.enum(['demo', 'user']) }).strict().optional(),
  provenance: Provenance,
}).strict();

const Appearance = z.object({
  baseColorHex: Hex,
  roughness: z.number().min(0).max(1),
  texture: z.discriminatedUnion('type', [
    z.object({ type: z.literal('solid') }).strict(),
    z.object({
      type: z.literal('procedural'),
      pattern: z.enum(['tile_grid', 'plank']),
      groutColorHex: Hex,
      offsetPct: z.union([z.literal(0), z.literal(33), z.literal(50)]),
      toneVariation: z.number().min(0).max(1),
      seed: z.number().int(),
    }).strict(),
  ]),
}).strict();

export const FinishSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  kind: z.enum(['tile', 'wall_tile', 'parquet', 'laminate', 'paint']),
  name: z.object({ ro: z.string() }).strict(),
  appearance: Appearance,
  priceUnit: z.enum(['m2', 'box', 'piece', 'liter', 'can']),
  unitPriceMinor: Minor,
  priceOrigin: z.enum(['demo', 'user']),
  vatBp: Bp.optional(),
  tile: z.object({ pieceWidthMm: PosMm, pieceHeightMm: PosMm, groutMm: z.number().int().min(0), piecesPerBox: z.number().int().positive().optional(), boxCoverageM2: z.number().positive().optional() }).strict().optional(),
  paint: z.object({ coverageM2PerLiter: z.number().positive(), coats: z.number().int().positive(), canVolumeLiters: z.number().positive() }).strict().optional(),
  defaultWastePct: z.number().min(0).max(100),
  provenance: Provenance,
}).strict();

const Settings = z.object({
  currency: z.string(),
  pricesIncludeVat: z.boolean(),
  defaultVatBp: Bp,
  contingencyBp: Bp,
  defaultWallHeightMm: PosMm,
  defaultWallThicknessMm: PosMm,
  gridMm: PosMm,
  openingEdgeMarginMm: z.number().int().min(0),
  openingGapMm: z.number().int().min(0),
  displayUnit: z.enum(['mm', 'cm', 'm']),
}).strict();

const FinishTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('roomFloor'), roomId: Id }).strict(),
  z.object({ kind: z.literal('wallSide'), wallId: Id, side: z.enum(['left', 'right']) }).strict(),
]);

const QuantityBinding = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('roomFloorArea'), roomId: Id }).strict(),
  z.object({ kind: z.literal('assignmentArea'), assignmentId: Id }).strict(),
  z.object({ kind: z.literal('roomWallArea'), roomId: Id }).strict(),
]);

export const ProjectDocumentSchema = z.object({
  schemaVersion: z.literal(CURRENT_VERSION),
  id: Id,
  name: z.string().max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: Settings,
  levels: z.record(Id, z.object({ id: Id, name: z.string(), elevationMm: Mm, ceilingHeightMm: PosMm }).strict()),
  nodes: z.record(Id, z.object({ id: Id, levelId: Id, x: Mm, y: Mm }).strict()),
  walls: z.record(Id, z.object({ id: Id, levelId: Id, startNodeId: Id, endNodeId: Id, thicknessMm: PosMm.refine((n) => n % 2 === 0, 'grosimea trebuie să fie un număr PAR de mm'), heightMm: PosMm, baseOffsetMm: Mm }).strict()),
  openings: z.record(Id, z.object({
    id: Id, wallId: Id, type: z.enum(['door', 'window']), offsetMm: Mm, widthMm: PosMm, heightMm: PosMm, sillHeightMm: z.number().int().min(0),
  }).strict()),
  rooms: z.record(Id, z.object({
    id: Id, levelId: Id, name: z.string(), type: z.string(), nodeLoop: z.array(Id).min(3), ceilingHeightMm: PosMm.optional(),
  }).strict()),
  objects: z.record(Id, z.object({
    id: Id, levelId: Id, catalogItemId: z.string(), position: z.object({ x: Mm, y: Mm }).strict(), elevationMm: Mm, rotationDeg: z.number().min(0).lt(360),
    size: z.object({ widthMm: PosMm, depthMm: PosMm, heightMm: PosMm }).strict(),
    params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
    colorHex: Hex.optional(), note: z.string().optional(),
  }).strict()),
  finishAssignments: z.record(Id, z.object({
    id: Id, target: FinishTarget, finishId: z.string(), wastePct: z.number().min(0).max(100),
    coveredHeightMm: PosMm.optional(), fromHeightMm: z.number().int().min(0).optional(),
  }).strict()),
  catalogSnapshot: z.object({ items: z.record(z.string(), CatalogItemSchema), finishes: z.record(z.string(), FinishSchema) }).strict(),
  budget: z.object({
    overrides: z.record(z.string(), z.object({ unitPriceMinor: Minor.optional(), quantity: z.number().optional(), vatBp: Bp.optional(), excluded: z.boolean().optional(), note: z.string().optional() }).strict()),
    manualLines: z.record(Id, z.object({
      id: Id, category: z.string(), description: z.string(), roomId: Id.nullable().optional(), unit: z.string(), quantity: z.number(),
      binding: QuantityBinding.optional(), unitPriceMinor: Minor, vatBp: Bp, excluded: z.boolean().optional(), note: z.string().optional(),
    }).strict()),
  }).strict(),
}).strict();

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;
export type CatalogItem = z.infer<typeof CatalogItemSchema>;
export type Finish = z.infer<typeof FinishSchema>;
export type Wall = ProjectDocument['walls'][string];
export type Room = ProjectDocument['rooms'][string];
export type Opening = ProjectDocument['openings'][string];
export type PlacedObject = ProjectDocument['objects'][string];

export const RoomcraftFileSchema = z.object({
  format: z.literal('roomcraft'),
  formatVersion: z.number().int(),
  exportedAt: z.string(),
  generator: z.object({ app: z.string(), version: z.string() }).strict(),
  project: z.unknown(),
  assets: z.array(z.unknown()),
}).strict();
