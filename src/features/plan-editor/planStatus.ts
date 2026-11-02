// Texte de stare ale editorului 2D (pure): anunțul selecției pentru cititoarele de ecran și linia de stare a sesiunii.
import type { GeometryModel, ProjectDocument } from '@/domain';
import { formatAreaM2 } from '@/lib/format';
import type { SessionState } from '@/state/session';
import type { Selection } from './types';

/** Ce e selectat, pentru cititoarele de ecran (regiune `aria-live`): selecția din plan nu are altfel nicio expresie textuală. */
export function selectionAnnouncement(ctx: {
  doc: ProjectDocument;
  geometry: GeometryModel;
  selection: Selection;
  selectedObjectId: string | null;
  groupIds: readonly string[];
}): string {
  const { doc, geometry, selection, selectedObjectId, groupIds } = ctx;
  if (selectedObjectId) {
    if (groupIds.length > 1) return `${groupIds.length} obiecte selectate.`;
    const o = doc.objects[selectedObjectId];
    const name = o?.name ?? (o && doc.catalogSnapshot.items[o.catalogItemId]?.name.ro) ?? 'Obiect';
    return `Obiect selectat: ${name}.`;
  }
  if (selection?.kind === 'room') {
    const r = doc.rooms[selection.id];
    const area = geometry.rooms.get(selection.id)?.areaMm2;
    return `Cameră selectată: ${r?.name ?? ''}${area === undefined ? '' : `, ${formatAreaM2(area)}`}.`;
  }
  if (selection?.kind === 'opening') {
    const o = doc.openings[selection.id];
    return `${o?.type === 'door' ? 'Ușă' : 'Fereastră'} selectată.`;
  }
  if (selection?.kind === 'wall') return 'Perete selectat.';
  if (selection?.kind === 'node') return 'Nod selectat.';
  return 'Nimic selectat.';
}

export type StatusTone = 'info' | 'warning' | 'error' | 'success';

/** Linia de stare de deasupra planului: doar citire, conflict, sesiune încheiată, eroare de salvare, salvare în curs. */
export function sessionStatusLine(
  state: Pick<SessionState, 'readOnly' | 'conflict' | 'status' | 'error'>,
): { tone: StatusTone; text: string } | null {
  if (state.readOnly)
    return { tone: 'warning', text: 'Doar citire: proiectul nu poate fi modificat în acest tab.' };
  if (state.conflict)
    return {
      tone: 'error',
      text: 'Conflict de versiuni: editarea e oprită până rezolvi conflictul (vezi mesajul de mai sus).',
    };
  if (state.status === 'closed') return { tone: 'warning', text: 'Sesiunea s-a încheiat.' };
  if (state.error)
    return {
      tone: 'error',
      text: 'Salvarea a eșuat; modificările rămân în memorie. Poți continua sau exporta o copie.',
    };
  if (state.status === 'saving') return { tone: 'info', text: 'Se salvează…' };
  return null;
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};
