// Piese comune ale editorului 2D, fără React: constante, tipuri ale gesturilor și ale confirmărilor, funcții pure mici.
// Separate de `PlanEditor.tsx` ca acesta să rămână compoziția stării, a gesturilor și a afișării (audit F-16).
import {
  addPolyRoomShared,
  addRectRoomShared,
  type ProjectDocument,
  type Pt,
  type Result,
} from '@/domain';
import { roomShape } from './roomPresets';
import type { RoomPreset, RoomSide, Selection, SelectionKind } from './types';
import type { Size, View } from './view';

export const DEFAULT_SIZE: Size = { w: 800, h: 560 };
/** Pragul (px) de la care o apăsare devine tragere. */
export const DRAG_THRESHOLD_PX = 4;
/** Raza (px) de captare a nodurilor existente. */
export const SNAP_RADIUS_PX = 12;
/** Pasul de poziționare al golurilor la tragere (mm). */
export const OPENING_STEP_MM = 10;

export const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export type Gesture =
  | { type: 'pan'; startX: number; startY: number; view: View }
  | { type: 'node'; nodeId: string; startX: number; startY: number; active: boolean }
  | { type: 'opening'; openingId: string; startX: number; startY: number; active: boolean }
  | {
      type: 'edge';
      roomId: string;
      index: number;
      startX: number;
      startY: number;
      /** Cursorul în lume la apăsare și normala exterioară a laturii. */
      grab: Pt;
      normal: Pt;
      active: boolean;
    }
  | {
      type: 'side';
      roomId: string;
      side: RoomSide;
      startX: number;
      startY: number;
      /** Cursorul în lume la apăsare și dimensiunea interioară de pornire pe direcția laturii. */
      grab: Pt;
      startLengthMm: number;
      active: boolean;
    }
  | {
      type: 'room';
      roomId: string;
      startX: number;
      startY: number;
      /** Cursorul în lume la apăsare (deplasarea e relativă la el). */
      grab: Pt;
      /** Motivul pentru care camera nu se poate muta ca întreg (noduri comune), altfel `null`. */
      blocked: string | null;
      active: boolean;
    }
  | {
      type: 'object';
      objectId: string;
      /** Obiectele trase împreună (selecție multiplă), altfel `undefined`. */
      groupIds?: string[];
      startX: number;
      startY: number;
      /** Decalajul cursor → centrul obiectului la apăsare (fără salt la începutul tragerii). */
      grab: Pt;
      active: boolean;
    };

export type Confirm = {
  title: string;
  description: string;
  label: string;
  action: () => string | null;
  /** Variantă mai blândă a ștergerii (ex. doar camera, pereții rămân). */
  secondary?: { label: string; action: () => string | null };
};

export const defaultGenId = (): string => crypto.randomUUID().slice(0, 8);

export function exists(doc: ProjectDocument, s: Selection): boolean {
  if (!s) return false;
  const table = { node: doc.nodes, wall: doc.walls, room: doc.rooms, opening: doc.openings }[
    s.kind
  ];
  return s.id in table;
}

export const ELEMENT_LABEL: Record<SelectionKind, string> = {
  node: 'Nod',
  wall: 'Perete',
  room: 'Cameră',
  opening: 'Gol',
};

/** Construiește camera presetului (dreptunghi sau formă) cu colțul casetei în `anchor`, cu pereți comuni. */
export function buildRoom(
  doc: ProjectDocument,
  preset: RoomPreset,
  anchor: Pt,
  genId: () => string,
  name?: string,
): Result<{ doc: ProjectDocument; roomId: string }> {
  if (preset.notch) {
    return addPolyRoomShared(
      doc,
      { interior: roomShape(preset).map((p) => ({ x: p.x + anchor.x, y: p.y + anchor.y })), name },
      genId,
    );
  }
  return addRectRoomShared(
    doc,
    { widthMm: preset.widthMm, depthMm: preset.depthMm, anchor, name },
    genId,
  );
}
