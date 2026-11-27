import type { GeometryModel, ProjectDocument } from '@/domain';
import { formatAreaM2 } from '@/lib/format';
import { ROOM_TYPES } from './PropertiesPanel';

/**
 * Lista camerelor cu suprafața utilă (derivată din geometrie) și totalul, integrată în Outliner-ul studioului.
 */
export function RoomList({
  doc,
  geometry,
  selectedId,
  onSelect,
}: {
  doc: ProjectDocument;
  geometry: GeometryModel;
  selectedId: string | null;
  onSelect: (roomId: string) => void;
}) {
  const rooms = Object.values(doc.rooms);
  if (rooms.length === 0) return null;
  const total = rooms.reduce((s, r) => s + (geometry.rooms.get(r.id)?.areaMm2 ?? 0), 0);
  return (
    <section
      aria-label="Camere"
      className="space-y-1.5 border-t border-stone-200/80 pt-3"
      data-testid="room-list"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
          Camere ({rooms.length})
        </h3>
        <span
          className="text-[11px] font-medium tabular-nums text-stone-600"
          data-testid="room-list-total"
        >
          Total {formatAreaM2(total)}
        </span>
      </div>
      <ul className="space-y-0.5">
        {rooms.map((r) => {
          const area = geometry.rooms.get(r.id)?.areaMm2;
          const selected = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-current={selected}
                data-testid={`room-list-item-${r.id}`}
                onClick={() => onSelect(r.id)}
                className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
                  selected
                    ? 'bg-teal-50 font-medium text-teal-900'
                    : 'text-stone-800 hover:bg-stone-100'
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.name}</span>{' '}
                  <span className="text-[11px] text-stone-500">
                    {ROOM_TYPES.find((t) => t.value === r.type)?.label}
                  </span>
                </span>
                <span
                  className="shrink-0 tabular-nums text-stone-600"
                  data-testid={`room-list-area-${r.id}`}
                >
                  {area === undefined ? '—' : formatAreaM2(area)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
