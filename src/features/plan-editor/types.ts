import type { Pt, Room } from '@/domain';

export type SelectionKind = 'node' | 'wall' | 'room' | 'opening';
export type Selection = { kind: SelectionKind; id: string } | null;
export type Tool = 'select' | 'wall';

/** Gest în curs (nu e în document până la final): poziția propusă a unui nod sau a unui gol. */
export type Drag =
  | { kind: 'node'; nodeId: string; to: Pt }
  | { kind: 'opening'; openingId: string; offsetMm: number }
  /** `groupIds`: obiectele mutate împreună cu `objectId` (selecție multiplă); `to` e poziția propusă a lui `objectId`. */
  | { kind: 'object'; objectId: string; to: Pt; groupIds?: string[] }
  | { kind: 'room'; roomId: string; delta: Pt }
  /** Redimensionarea unei camere dreptunghiulare din mânerul unei laturi: noua dimensiune interioară pe acea direcție. */
  | { kind: 'roomSide'; roomId: string; side: RoomSide; lengthMm: number }
  /** Mutarea unei laturi a unei camere cu forme oarecare (L, T…): deplasarea pe normala ei exterioară. */
  | { kind: 'roomEdge'; roomId: string; index: number; deltaMm: number };

export type RoomSide = 'n' | 'e' | 's' | 'w';

/** Firul în curs al uneltei „Perete”: începutul ales (nod existent sau punct nou) și cursorul curent. */
export interface WallDraft {
  start: { nodeId: string } | { x: number; y: number };
  from: Pt;
  to: Pt;
  /** Cursorul e lipit de un nod existent? */
  snapNodeId: string | null;
}

export interface Notice {
  tone: 'error' | 'success' | 'info';
  text: string;
}

/** Cameră predefinită din paletă: dimensiuni INTERIOARE (mm) și tipul camerei create. */
export interface RoomPreset {
  id: string;
  label: string;
  type: Room['type'];
  /** Dimensiunile casetei (mm): la o cameră orientată sunt cele de după rotire. */
  widthMm: number;
  depthMm: number;
  /** Colțul de nord-est tăiat al unei camere în L (în orientarea de bază), altfel `undefined` = dreptunghi. */
  notch?: { widthMm: number; depthMm: number };
  /** Câte sferturi de cerc (orare) e rotit un L față de orientarea de bază (0–3). */
  turns?: number;
  /** Dimensiunile casetei în orientarea de bază (păstrate la rotire). */
  base?: { widthMm: number; depthMm: number };
}

/** Previzualizarea camerei care urmează să fie plasată (în coordonatele lumii, mm). */
export interface PlacementGhost {
  preset: RoomPreset;
  /** Colțul interior stânga-sus, după lipire. */
  anchor: Pt;
  thicknessMm: number;
  valid: boolean;
  error: string | null;
  snapped: boolean;
  /** Poligonul interior al camerei, în coordonate absolute (pentru desenat). */
  interior: Pt[];
  /** Axele pereților (conturul benzii de pereți), în coordonate absolute. */
  axes: Pt[];
}
