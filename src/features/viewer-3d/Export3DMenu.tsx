'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button';
import { IconChevronDown, IconCube3D, IconDownload, IconX } from '@/ui/icons';
import type { Export3DFormat, Export3DStage } from './export3d';

export interface ExportMenuOptions {
  format: Export3DFormat;
  includeStructure: boolean;
  includeObjects: boolean;
}

const FORMATS: ReadonlyArray<{
  id: Export3DFormat;
  ext: string;
  title: string;
  badge?: string;
  desc: string;
}> = [
  {
    id: 'glb',
    ext: '.glb',
    title: 'glTF 2.0 Binar (Blender / 3D)',
    badge: 'Recomandat',
    desc: 'Păstrează culori, materiale PBR, texturi și ierarhia. Import direct în Blender, SketchUp, Unreal, Unity.',
  },
  {
    id: 'obj',
    ext: '.obj',
    title: 'Wavefront OBJ (CAD / Universal)',
    desc: 'Geometrie universală la scară reală (metri) pentru AutoCAD, FreeCAD, SketchUp, 3ds Max.',
  },
  {
    id: 'stl',
    ext: '.stl',
    title: 'STL Binar (Printare 3D / CNC)',
    desc: 'Mesh triangulat compact pentru machete 3D, imprimante 3D și prelucrare CNC.',
  },
];

/**
 * Meniu compact de export 3D (`.glb`, `.obj`, `.stl`) + overlay de încărcare fluid pe durata procesării.
 */
export function Export3DMenu({
  disabled = false,
  showScopeOptions = false,
  busyStage,
  error,
  onClearError,
  onExport,
  align = 'right',
}: {
  disabled?: boolean;
  /** Afișează bifele „Pereți și podele” / „Mobilier și obiecte” (pentru exportul proiectului complet). */
  showScopeOptions?: boolean;
  busyStage: Export3DStage | null;
  error: string | null;
  onClearError?: () => void;
  onExport: (opts: ExportMenuOptions) => void;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [includeStructure, setIncludeStructure] = useState(true);
  const [includeObjects, setIncludeObjects] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const busy = busyStage !== null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const nothingSelected = showScopeOptions && !includeStructure && !includeObjects;

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant={open ? 'primary' : 'ghost'}
        size="xs"
        className="rounded-full"
        disabled={disabled || busy}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          onClearError?.();
          setOpen((v) => !v);
        }}
        title="Exportă modelul 3D pentru Blender, SketchUp, CAD sau printare 3D"
        data-testid="export3d-trigger"
      >
        {busy ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700"
          />
        ) : (
          <IconDownload size={13} />
        )}
        <span>{busy ? 'Se exportă…' : 'Exportă 3D'}</span>
        <IconChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Alege formatul de export 3D"
          data-testid="export3d-menu"
          className={`absolute top-10 z-30 w-72 rounded-2xl border border-stone-200 bg-surface p-3 text-left shadow-xl ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900">
              <IconCube3D size={14} className="text-teal-700" />
              <span>Exportă model 3D</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Închide meniul de export 3D"
              className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
            >
              <IconX size={13} />
            </button>
          </div>

          {showScopeOptions ? (
            <div className="mb-2.5 space-y-1 rounded-xl border border-stone-200/80 bg-surface-subtle p-2 text-xs">
              <p className="text-[10px] font-semibold tracking-wider text-stone-500 uppercase">
                Include în export
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-stone-800">
                <input
                  type="checkbox"
                  checked={includeStructure}
                  onChange={(e) => setIncludeStructure(e.target.checked)}
                  className="h-3.5 w-3.5 accent-teal-700"
                  data-testid="export3d-include-structure"
                />
                Pereți și podele
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-stone-800">
                <input
                  type="checkbox"
                  checked={includeObjects}
                  onChange={(e) => setIncludeObjects(e.target.checked)}
                  className="h-3.5 w-3.5 accent-teal-700"
                  data-testid="export3d-include-objects"
                />
                Mobilier și obiecte
              </label>
            </div>
          ) : null}

          <div className="space-y-1.5">
            {FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                role="menuitem"
                disabled={nothingSelected || busy}
                onClick={() => {
                  setOpen(false);
                  onExport({
                    format: fmt.id,
                    includeStructure,
                    includeObjects,
                  });
                }}
                data-testid={`export3d-format-${fmt.id}`}
                className="flex w-full flex-col gap-0.5 rounded-xl border border-stone-200/90 bg-surface-subtle p-2.5 text-left transition-colors hover:border-teal-600 hover:bg-teal-50/60 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-900">{fmt.title}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      fmt.badge
                        ? 'bg-teal-100 text-teal-900'
                        : 'bg-stone-200/80 font-mono text-stone-700'
                    }`}
                  >
                    {fmt.badge ?? fmt.ext}
                  </span>
                </div>
                <span className="text-[11px] leading-snug text-stone-500">{fmt.desc}</span>
              </button>
            ))}
          </div>

          {nothingSelected ? (
            <p role="alert" className="mt-2 text-[11px] text-amber-800">
              Selectează cel puțin un strat (pereți/podele sau obiecte).
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2 text-[11px] text-red-700" data-testid="export3d-error">
              {error}
            </p>
          ) : null}

          <p className="mt-2.5 border-t border-stone-200/70 pt-2 text-[10px] text-stone-500">
            Scară reală: 1 unitate = 1 metru · procesat 100% local în browser.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Overlay elegant de încărcare peste viewport-ul 3D pe durata generării și împachetării fișierului 3D.
 */
export function Export3DLoadingOverlay({
  stage,
  format,
}: {
  stage: Export3DStage | null;
  format: Export3DFormat | null;
}) {
  if (!stage) return null;
  const pct = Math.max(8, Math.min(100, Math.round(stage.progress)));
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="export3d-loading"
      className="absolute inset-0 z-30 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-xs rounded-2xl border border-stone-200 bg-surface p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-spin rounded-xl border-2 border-teal-200 border-t-teal-700"
            />
            <IconCube3D size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-stone-900">
              Se exportă modelul {format ? `.${format.toUpperCase()}` : '3D'}…
            </p>
            <p className="mt-0.5 truncate text-[11px] text-stone-600">{stage.label}</p>
          </div>
        </div>

        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-teal-700 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-stone-500">
          <span>Generare locală, fără server</span>
          <span className="font-medium text-stone-700">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
