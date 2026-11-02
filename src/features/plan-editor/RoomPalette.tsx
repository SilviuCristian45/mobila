import type { PointerEvent as ReactPointerEvent } from 'react';
import { formatLength } from '@/lib/format';
import { ROOM_PRESETS } from './roomPresets';
import type { RoomPreset } from './types';

/**
 * Paleta de camere: trage o cameră pe plan (sau apasă-o și apoi apasă pe plan). Cu tastatura, Enter o plasează în
 * centrul vizibil al planului. Dimensiunile sunt interioare; se pot schimba după plasare.
 */
export function RoomPalette({
  unit,
  editable,
  activeId,
  onPress,
  onPlaceCentered,
}: {
  unit: 'mm' | 'cm' | 'm';
  editable: boolean;
  activeId: string | null;
  onPress: (preset: RoomPreset, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPlaceCentered: (preset: RoomPreset) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Adaugă cameră"
      data-testid="room-palette"
    >
      <span className="text-xs font-medium text-stone-700">Adaugă cameră:</span>
      {ROOM_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={!editable}
          aria-pressed={activeId === p.id}
          title={`${p.label} — trage pe plan sau apasă, apoi apasă pe plan (Esc anulează)`}
          data-testid={`room-preset-${p.id}`}
          onPointerDown={(e) => {
            if (e.button !== 0 || !editable) return;
            e.preventDefault();
            onPress(p, e);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPlaceCentered(p);
            }
          }}
          style={{ touchAction: 'none' }}
          className={`cursor-grab select-none rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50 ${
            activeId === p.id
              ? 'border-teal-700 bg-teal-50 text-teal-900'
              : 'border-stone-300 bg-surface text-stone-800 hover:bg-stone-50'
          }`}
        >
          {p.label}{' '}
          <span className="text-xs text-stone-500">
            {formatLength(p.widthMm, unit)} × {formatLength(p.depthMm, unit)}
          </span>
        </button>
      ))}
    </div>
  );
}
