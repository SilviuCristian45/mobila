import type { GeometryModel, ProjectDocument } from '@/domain';
import { formatAreaM2 } from '@/lib/format';
import { ROOM_TYPES } from './PropertiesPanel';

/**
 * Lista camerelor cu suprafața utilă (derivată din geometrie) și totalul. Un clic selectează camera și, dacă e în afara
 * ferestrei, centrează planul pe ea. Fără camere nu se afișează nimic.
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
      className="rounded-xl border border-stone-200 bg-white p-4"
      data-testid="room-list"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-stone-900">Camere ({rooms.length})</h3>
        <span className="text-xs text-stone-600" data-testid="room-list-total">
          Total {formatAreaM2(total)}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
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
                className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
                  selected ? 'bg-teal-50 text-teal-900' : 'hover:bg-stone-50'
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.name}</span>{' '}
                  <span className="text-xs text-stone-500">
                    {ROOM_TYPES.find((t) => t.value === r.type)?.label}
                  </span>
                </span>
                <span
                  className="shrink-0 tabular-nums text-stone-700"
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
