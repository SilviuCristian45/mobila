'use client';

import { Suspense, lazy, useMemo, useSyncExternalStore } from 'react';
import { buildParts, buildPreview, type Params } from '@/catalog';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Spinner } from '@/ui/feedback';
import type { IsolatedCanvasProps, IsolatedViewPreset } from './IsolatedObjectCanvas';
import { webglAvailable } from './webgl';

const IsolatedObjectCanvas = lazy(() => import('./IsolatedObjectCanvas'));

const subscribeNever = () => () => {};
const webglStatus = (): 'ok' | 'unsupported' => (webglAvailable() ? 'ok' : 'unsupported');

export type { IsolatedViewPreset };

function FallbackPreview({
  recipe,
  sizeMm,
  params,
  colorHex,
  slotLooks,
  hideFronts,
}: Omit<IsolatedCanvasProps, 'viewPreset' | 'viewNonce'>) {
  const preview = useMemo(() => {
    const dims: [number, number, number] = [
      sizeMm.widthMm / 1000,
      sizeMm.heightMm / 1000,
      sizeMm.depthMm / 1000,
    ];
    const effective: Params = hideFronts ? { ...params, _hideFronts: true } : params;
    const { parts } = buildParts(recipe, dims, effective);
    return buildPreview(parts, colorHex, 260, slotLooks);
  }, [recipe, sizeMm, params, colorHex, slotLooks, hideFronts]);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
      data-testid="custom-preview-fallback"
    >
      <svg
        width={260}
        height={260}
        viewBox={preview.viewBox}
        role="img"
        aria-label="Previzualizare piesă mobilă la comandă"
        className="max-h-full max-w-full"
      >
        {preview.polygons.map((p, i) => (
          <polygon
            key={i}
            points={p.points}
            fill={p.fill}
            stroke={p.fill}
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <p className="text-xs text-stone-500">
        Previzualizare izometrică vectorială (WebGL indisponibil)
      </p>
    </div>
  );
}

/**
 * Viewport 3D izolat pentru o singură piesă de mobilier (folosit în studioul „Mobilă la comandă”).
 * Respectă regula depcruise `three-doar-in-viewer-3d` și se încarcă leneș doar la nevoie.
 */
export function IsolatedObjectViewer({
  recipe,
  sizeMm,
  params,
  colorHex,
  slotLooks,
  hideFronts,
  viewPreset,
  viewNonce,
  showDimensions,
}: IsolatedCanvasProps & { showDimensions: boolean }) {
  const webgl = useSyncExternalStore(subscribeNever, webglStatus, () => 'checking' as const);

  return (
    <div
      className="relative flex h-full w-full flex-1 flex-col overflow-hidden bg-canvas"
      data-testid="custom-3d-viewport"
      data-hide-fronts={hideFronts}
      data-view-preset={viewPreset}
    >
      {webgl === 'unsupported' ? (
        <FallbackPreview
          recipe={recipe}
          sizeMm={sizeMm}
          params={params}
          colorHex={colorHex}
          slotLooks={slotLooks}
          hideFronts={hideFronts}
        />
      ) : webgl === 'checking' ? (
        <div className="flex h-full items-center justify-center">
          <Spinner label="Se pregătește previzualizarea 3D…" />
        </div>
      ) : (
        <ErrorBoundary
          label="previzualizarea 3D a piesei"
          fallback={() => (
            <FallbackPreview
              recipe={recipe}
              sizeMm={sizeMm}
              params={params}
              colorHex={colorHex}
              slotLooks={slotLooks}
              hideFronts={hideFronts}
            />
          )}
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner label="Se încarcă scena 3D…" />
              </div>
            }
          >
            <IsolatedObjectCanvas
              recipe={recipe}
              sizeMm={sizeMm}
              params={params}
              colorHex={colorHex}
              slotLooks={slotLooks}
              hideFronts={hideFronts}
              viewPreset={viewPreset}
              viewNonce={viewNonce}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Cote globale L × A × H plutitoare */}
      {showDimensions ? (
        <div
          className="pointer-events-none absolute top-3 left-3 z-10 flex flex-wrap gap-1.5"
          data-testid="custom-dimensions-overlay"
        >
          {[
            ['L', sizeMm.widthMm],
            ['A', sizeMm.depthMm],
            ['H', sizeMm.heightMm],
          ].map(([label, val]) => (
            <span
              key={label}
              className="rounded-full border border-stone-200/90 bg-surface/90 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-stone-800 shadow-xs backdrop-blur-md"
            >
              <span className="text-stone-400">{label}</span> {val} mm
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
