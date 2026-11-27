'use client';

import { Suspense, lazy, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  InvalidDocumentError,
  type FinishTarget,
  type ProjectDocument,
  type SceneDescription,
} from '@/domain';
import { resolveRecipe } from '@/catalog';
import { selectScene } from '@/state/selectors';
import { Button } from '@/ui/Button';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Alert, Spinner } from '@/ui/feedback';
import {
  IconCatalog,
  IconCutaway,
  IconFit,
  IconFocus,
  IconMaterials,
  IconPanelRight,
  IconRotateCcw,
} from '@/ui/icons';
import type { SceneStats } from './ViewerCanvas';
import { webglAvailable } from './webgl';

const ViewerCanvas = lazy(() => import('./ViewerCanvas'));

const subscribeNever = () => () => {};
const webglStatus = (): 'ok' | 'unsupported' => (webglAvailable() ? 'ok' : 'unsupported');

type SceneResult = { ok: true; scene: SceneDescription } | { ok: false; error: Error };

function computeScene(doc: ProjectDocument): SceneResult {
  try {
    return { ok: true, scene: selectScene(doc) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function RenderBoundary({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <ErrorBoundary
      label="vizualizarea 3D"
      onReset={onRetry}
      fallback={({ reset }) => (
        <div className="flex h-full items-center justify-center p-4">
          <Alert
            tone="error"
            title="Vizualizarea 3D a întâmpinat o eroare"
            testId="viewer3d-render-error"
            actions={<Button onClick={reset}>Încearcă din nou</Button>}
          >
            Imaginea 3D nu a putut fi afișată (de exemplu din cauza plăcii video sau a browserului).
            Planul 2D și proiectul nu sunt afectate; ce era salvat a rămas salvat.
          </Alert>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

const railBtn = (active: boolean) =>
  `flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
    active
      ? 'bg-teal-50 text-teal-800 shadow-2xs ring-1 ring-teal-700/25'
      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
  }`;

/**
 * Vizualizarea 3D în arhitectura „Full-Viewport Studio”:
 * - Left Tool Rail (Catalog, Materiale) + Left Drawer retractabil
 * - Viewport 3D full-bleed cu Floating Top Controls Pill și Bottom-Left Micro-Badge
 * - Right Contextual Inspector pentru obiectul selectat
 */
export function Viewer3D({
  doc,
  selectedObjectId = null,
  onSelectObject,
  selectedSurface = null,
  onSelectSurface,
  sidePanel,
  side = null,
  onSideChange,
  leftDrawerContent,
  leftDrawerRef,
}: {
  doc: ProjectDocument;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  selectedSurface?: FinishTarget | null;
  onSelectSurface?: (s: FinishTarget | null) => void;
  sidePanel?: ReactNode;
  side?: 'catalog' | 'materials' | null;
  onSideChange?: (s: 'catalog' | 'materials' | null) => void;
  leftDrawerContent?: ReactNode;
  leftDrawerRef?: (el: HTMLDivElement | null) => void;
}) {
  const result = useMemo(() => computeScene(doc), [doc]);
  const webgl = useSyncExternalStore(subscribeNever, webglStatus, () => 'checking' as const);
  const [resetNonce, setResetNonce] = useState(0);
  const [preset, setPreset] = useState<'perspective' | 'top'>('perspective');
  const [cutaway, setCutaway] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const empty =
    result.ok &&
    result.scene.prisms.length === 0 &&
    result.scene.floors.length === 0 &&
    result.scene.boxes.length === 0;
  const placeholders = result.ok
    ? result.scene.boxes.filter((b) => !b.recipe || !resolveRecipe(b.recipe.id, b.recipe.version))
        .length
    : 0;
  const controlsOff = !result.ok || empty || webgl !== 'ok';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {/* Left Rail (Catalog & Materiale) când suntem în studioul complet */}
      {onSideChange ? (
        <div
          role="toolbar"
          aria-label="Panouri 3D"
          aria-orientation="vertical"
          className="flex shrink-0 flex-row items-center gap-1 border-b border-stone-200 bg-surface p-1.5 lg:w-[52px] lg:flex-col lg:border-r lg:border-b-0 lg:py-2"
        >
          <button
            type="button"
            aria-pressed={side === 'catalog'}
            aria-label="Catalog de obiecte"
            title="Catalog de obiecte"
            onClick={() => onSideChange(side === 'catalog' ? null : 'catalog')}
            data-testid="catalog-toggle"
            className={railBtn(side === 'catalog')}
          >
            <IconCatalog size={17} />
          </button>
          <button
            type="button"
            aria-pressed={side === 'materials'}
            aria-label="Materiale și finisaje"
            title="Materiale și finisaje"
            onClick={() => onSideChange(side === 'materials' ? null : 'materials')}
            data-testid="materials-toggle"
            className={railBtn(side === 'materials')}
          >
            <IconMaterials size={17} />
          </button>
        </div>
      ) : null}

      {/* Left Drawer pentru Catalog / Materiale */}
      {side !== null ? (
        <div
          aria-label={side === 'catalog' ? 'Catalog de obiecte' : 'Materiale și finisaje'}
          className="studio-scroll max-h-72 shrink-0 overflow-y-auto border-b border-stone-200 bg-surface p-3 lg:max-h-none lg:w-[284px] lg:border-r lg:border-b-0"
        >
          <div ref={leftDrawerRef} className={side === 'catalog' ? '' : 'hidden'} />
          {side === 'materials' ? leftDrawerContent : null}
        </div>
      ) : (
        <div ref={leftDrawerRef} className="hidden" />
      )}

      {/* Viewport 3D Full-Bleed + Floating HUD */}
      <section
        aria-label="Vizualizare 3D"
        className="relative flex min-h-[24rem] min-w-0 flex-1 flex-col bg-canvas"
        data-testid="viewer-3d"
      >
        <div
          className="relative h-full min-h-80 flex-1 overflow-hidden bg-stone-100"
          data-testid="viewer3d-box"
          data-walls={stats?.walls ?? ''}
          data-objects={stats?.objects ?? ''}
          data-floors={stats?.floors ?? ''}
          data-scene-hash={result.ok ? result.scene.hash : ''}
        >
          {/* Floating Top-Center 3D Controls Pill */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border border-stone-200/90 bg-surface/92 px-2 py-1 shadow-md backdrop-blur-md">
              <Button
                variant="ghost"
                size="xs"
                className="rounded-full"
                onClick={() => {
                  setPreset('perspective');
                  setResetNonce((n) => n + 1);
                }}
                disabled={controlsOff}
                title="Încadrează întregul proiect, din colț"
                data-testid="viewer3d-reset"
              >
                <IconRotateCcw size={13} />
                Resetează vederea
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="rounded-full"
                onClick={() => {
                  setPreset('top');
                  setResetNonce((n) => n + 1);
                }}
                disabled={controlsOff}
                title="Privește planul de sus"
                data-testid="viewer3d-top"
              >
                <IconFit size={13} />
                De sus
              </Button>
              <Button
                variant={cutaway ? 'primary' : 'ghost'}
                size="xs"
                className="rounded-full"
                aria-pressed={cutaway}
                onClick={() => setCutaway((v) => !v)}
                disabled={controlsOff}
                title="Desenează pereții tăiați la o treime din înălțime, ca să vezi interiorul"
                data-testid="viewer3d-cutaway"
              >
                <IconCutaway size={13} />
                Pereți tăiați
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="rounded-full"
                onClick={() => setFocusNonce((n) => n + 1)}
                disabled={controlsOff || !selectedObjectId}
                title="Mută camera pe obiectul selectat"
                data-testid="viewer3d-focus"
              >
                <IconFocus size={13} />
                Centrează pe selecție
              </Button>
            </div>
          </div>

          {/* Toggle Inspector dacă e ascuns și există obiect selectat */}
          {sidePanel && selectedObjectId && !inspectorOpen ? (
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              aria-label="Arată inspectorul obiectului"
              className="absolute top-3 right-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200/90 bg-surface/92 px-3 text-xs font-medium text-stone-700 shadow-sm backdrop-blur-md hover:bg-surface"
            >
              <IconPanelRight size={14} />
              Proprietăți
            </button>
          ) : null}

          {!result.ok ? (
            <div className="flex h-full items-center justify-center p-4 pt-16">
              <div className="max-w-lg">
                <Alert
                  tone="error"
                  title="Proiectul nu poate fi afișat în 3D"
                  testId="viewer3d-error"
                >
                  <p>
                    {result.error.message} Corectează planul 2D (de exemplu un perete care se
                    intersectează sau o cameră neînchisă) și revino la 3D.
                  </p>
                  {result.error instanceof InvalidDocumentError &&
                  result.error.issues.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5" data-testid="viewer3d-issues">
                      {result.error.issues.slice(0, 8).map((i, k) => (
                        <li key={`${i.code}:${i.path}:${k}`}>{i.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </Alert>
              </div>
            </div>
          ) : webgl === 'unsupported' ? (
            <div className="flex h-full items-center justify-center p-4 pt-16">
              <div className="max-w-lg">
                <Alert tone="warning" title="WebGL nu este disponibil" testId="viewer3d-nowebgl">
                  Browserul sau dispozitivul nu permite grafica 3D (WebGL). Planul 2D funcționează
                  normal; încearcă alt browser sau activează accelerarea hardware.
                </Alert>
              </div>
            </div>
          ) : webgl === 'checking' ? (
            <div className="flex h-full items-center justify-center p-4">
              <Spinner label="Se pregătește vizualizarea 3D…" />
            </div>
          ) : (
            <>
              <RenderBoundary key={retryNonce} onRetry={() => setRetryNonce((n) => n + 1)}>
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center p-4">
                      <Spinner label="Se încarcă vizualizarea 3D…" />
                    </div>
                  }
                >
                  <ViewerCanvas
                    scene={result.scene}
                    resetNonce={resetNonce}
                    preset={preset}
                    cutaway={cutaway}
                    focusNonce={focusNonce}
                    onContextLost={() => setContextLost(true)}
                    onContextRestored={() => setContextLost(false)}
                    onStats={setStats}
                    selectedObjectId={selectedObjectId}
                    onSelectObject={onSelectObject}
                    selectedSurface={selectedSurface}
                    onSelectSurface={onSelectSurface}
                  />
                </Suspense>
              </RenderBoundary>
              {contextLost ? (
                <div
                  className="absolute inset-x-4 top-16 z-20 mx-auto max-w-lg"
                  data-testid="viewer3d-context-lost"
                >
                  <Alert
                    tone="warning"
                    title="Contextul grafic 3D s-a pierdut"
                    actions={
                      <Button
                        onClick={() => {
                          setContextLost(false);
                          setRetryNonce((n) => n + 1);
                        }}
                        data-testid="viewer3d-context-reload"
                      >
                        Reîncarcă 3D
                      </Button>
                    }
                  >
                    Browserul a eliberat memoria video. Încerc să refac imaginea automat; dacă nu
                    apare, reîncarcă vizualizarea. Proiectul nu a fost afectat.
                  </Alert>
                </div>
              ) : null}
              {empty ? (
                <p
                  className="pointer-events-none absolute inset-x-4 top-16 mx-auto max-w-md rounded-2xl border border-stone-200/80 bg-surface/90 p-3 text-center text-xs text-stone-700 shadow-sm backdrop-blur-md"
                  data-testid="viewer3d-empty"
                >
                  Proiectul nu are încă pereți sau camere. Adaugă-le în planul 2D și revino aici.
                </p>
              ) : null}
            </>
          )}

          {/* Floating Bottom-Left Micro-Badge */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5">
            {placeholders > 0 ? (
              <p
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow-sm backdrop-blur-md"
                data-testid="viewer3d-placeholders"
              >
                {placeholders} {placeholders === 1 ? 'obiect folosește' : 'obiecte folosesc'} o
                rețetă necunoscută și {placeholders === 1 ? 'este afișat' : 'sunt afișate'} ca o
                simplă cutie. Dimensiunile și datele se păstrează.
              </p>
            ) : null}
            <span
              className="w-fit rounded-full border border-stone-200/80 bg-surface/85 px-3 py-1 text-[11px] text-stone-600 shadow-xs backdrop-blur-md"
              data-testid="viewer3d-hint"
            >
              Drag: rotește · Scroll: zoom · Click dreapta: pan · Click pe suprafață: materiale
            </span>
          </div>
        </div>
      </section>

      {/* Right Contextual Inspector pentru obiect selectat în 3D */}
      {sidePanel && selectedObjectId && inspectorOpen ? (
        <aside
          aria-label="Obiecte"
          className="studio-scroll flex shrink-0 flex-col border-t border-stone-200 bg-surface lg:w-[296px] lg:overflow-y-auto lg:border-t-0 lg:border-l"
        >
          <div className="flex items-center justify-between border-b border-stone-200/80 px-3 py-2">
            <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
              Inspector obiect
            </span>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              aria-label="Ascunde inspectorul obiectului"
              className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
            >
              <IconPanelRight size={14} />
            </button>
          </div>
          <div className="p-3">{sidePanel}</div>
        </aside>
      ) : sidePanel ? (
        /* Menținem CatalogPanel montat pentru portalul CatalogBrowser din stânga */
        <div className="hidden">{sidePanel}</div>
      ) : null}
    </div>
  );
}
