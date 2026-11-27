import type { PointerEvent as ReactPointerEvent } from 'react';
import { formatLength } from '@/lib/format';
import { EXTERIOR_ZONE_PRESETS, ROOM_PRESETS } from './roomPresets';
import type { RoomPreset } from './types';

function PresetSketch({ preset, exterior }: { preset: RoomPreset; exterior: boolean }) {
  const stroke = exterior ? 'stroke-emerald-700' : 'stroke-teal-700';
  const fill = exterior ? 'fill-emerald-50/70' : 'fill-teal-50/70';
  if (preset.notch) {
    return (
      <svg viewBox="0 0 40 28" className="h-7 w-10 shrink-0" aria-hidden="true">
        <polygon
          points="4,4 22,4 22,12 36,12 36,24 4,24"
          className={`${fill} ${stroke}`}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const ratio = Math.max(0.45, Math.min(1.6, preset.widthMm / preset.depthMm));
  const rw = ratio >= 1 ? 30 : Math.round(20 * ratio);
  const rh = ratio >= 1 ? Math.round(30 / ratio) : 20;
  const x = (40 - rw) / 2;
  const y = (28 - rh) / 2;
  return (
    <svg viewBox="0 0 40 28" className="h-7 w-10 shrink-0" aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={rw}
        height={rh}
        rx="1.5"
        className={`${fill} ${stroke}`}
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * Paleta de camere / zone exterioare în format de carduri vizuale 2-coloane (pentru Left Drawer).
 * Trage un preset pe plan sau apasă-l și apoi apasă pe plan. Cu tastatura, Enter îl plasează în centrul vizibil.
 */
export function RoomPalette({
  unit,
  editable,
  activeId,
  scope = 'interior',
  onPress,
  onPlaceCentered,
}: {
  unit: 'mm' | 'cm' | 'm';
  editable: boolean;
  activeId: string | null;
  scope?: 'interior' | 'exterior';
  onPress: (preset: RoomPreset, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPlaceCentered: (preset: RoomPreset) => void;
}) {
  const exterior = scope === 'exterior';
  const presets = exterior ? EXTERIOR_ZONE_PRESETS : ROOM_PRESETS;
  const heading = exterior ? 'Zone exterioare' : 'Adaugă cameră';
  return (
    <div
      className="space-y-2"
      role="group"
      aria-label={exterior ? 'Adaugă zonă exterioară' : 'Adaugă cameră'}
      data-testid="room-palette"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
          {heading}
        </span>
        <span className="text-[10px] text-stone-400">Trage pe plan</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {presets.map((p) => {
          const active = activeId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!editable}
              aria-pressed={active}
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
              className={`flex cursor-grab flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? exterior
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-950 shadow-xs'
                    : 'border-teal-700 bg-teal-50 text-teal-950 shadow-xs'
                  : 'border-stone-200 bg-surface-subtle text-stone-800 hover:border-stone-300 hover:bg-surface'
              }`}
            >
              <PresetSketch preset={p} exterior={exterior} />
              <span className="line-clamp-1 text-xs font-medium">{p.label}</span>
              <span className="text-[10px] tabular-nums text-stone-500">
                {formatLength(p.widthMm, unit)} × {formatLength(p.depthMm, unit)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
