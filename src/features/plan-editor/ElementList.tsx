import type { ProjectDocument } from '@/domain';
import { formatLength } from '@/lib/format';
import { ELEMENT_LABEL } from './editorSupport';
import { ROOM_TYPES } from './PropertiesPanel';
import type { SelectionKind } from './types';

/** Lista elementelor planului (camere, pereți, goluri) ca alternativă la tastatură a selecției din canvas. */
export function ElementList({
  doc,
  unit,
  onSelect,
}: {
  doc: ProjectDocument;
  unit: 'mm' | 'cm' | 'm';
  onSelect: (kind: SelectionKind, id: string) => void;
}) {
  const wallList = Object.values(doc.walls);
  const roomList = Object.values(doc.rooms);
  const openingList = Object.values(doc.openings);
  return (
    <details className="rounded-xl border border-stone-200 bg-white p-4" data-testid="element-list">
      <summary className="cursor-pointer text-sm font-semibold text-stone-900">
        Elemente din plan ({roomList.length} camere · {wallList.length} pereți ·{' '}
        {openingList.length} goluri)
      </summary>
      <ul className="mt-2 space-y-1 text-sm">
        {roomList.map((r) => (
          <li key={r.id}>
            <button type="button" className="underline" onClick={() => onSelect('room', r.id)}>
              {ELEMENT_LABEL.room} „{r.name}” ({ROOM_TYPES.find((t) => t.value === r.type)?.label})
            </button>
          </li>
        ))}
        {wallList.map((w, i) => (
          <li key={w.id}>
            <button type="button" className="underline" onClick={() => onSelect('wall', w.id)}>
              {ELEMENT_LABEL.wall} {i + 1}
            </button>
          </li>
        ))}
        {openingList.map((o) => (
          <li key={o.id}>
            <button type="button" className="underline" onClick={() => onSelect('opening', o.id)}>
              {o.type === 'door' ? 'Ușă' : 'Fereastră'} ({formatLength(o.widthMm, unit)})
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
