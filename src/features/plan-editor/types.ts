import type { Pt } from '@/domain';

export type SelectionKind = 'node' | 'wall' | 'room' | 'opening';
export type Selection = { kind: SelectionKind; id: string } | null;
export type Tool = 'select' | 'wall';

/** Gest în curs (nu e în document până la final): poziția propusă a unui nod sau a unui gol. */
export type Drag =
  | { kind: 'node'; nodeId: string; to: Pt }
  | { kind: 'opening'; openingId: string; offsetMm: number };

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
