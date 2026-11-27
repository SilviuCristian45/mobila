import type { ProjectDocument } from '@/domain';
import { formatLength } from '@/lib/format';
import { ELEMENT_LABEL } from './editorSupport';
import { ROOM_TYPES } from './PropertiesPanel';
import type { SelectionKind } from './types';

/** Arborele elementelor planului (camere, pereți, goluri) ca alternativă la tastatură a selecției din canvas. */
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
    <details className="border-t border-stone-200/80 pt-3" data-testid="element-list">
      <summary className="cursor-pointer text-[11px] font-semibold tracking-wider text-stone-500 uppercase hover:text-stone-800">
        Elemente din plan ({roomList.length} camere · {wallList.length} pereți ·{' '}
        {openingList.length} goluri)
      </summary>
      <ul className="mt-2 space-y-0.5 text-xs">
        {roomList.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-left text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => onSelect('room', r.id)}
            >
              {ELEMENT_LABEL.room} „{r.name}” ({ROOM_TYPES.find((t) => t.value === r.type)?.label})
            </button>
          </li>
        ))}
        {wallList.map((w, i) => (
          <li key={w.id}>
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-left text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => onSelect('wall', w.id)}
            >
              {ELEMENT_LABEL.wall} {i + 1}
            </button>
          </li>
        ))}
        {openingList.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-left text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => onSelect('opening', o.id)}
            >
              {o.type === 'door' ? 'Ușă' : 'Fereastră'} ({formatLength(o.widthMm, unit)})
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
