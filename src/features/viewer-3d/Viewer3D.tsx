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
import type { SceneStats } from './ViewerCanvas';
import { webglAvailable } from './webgl';

// Canvas-ul (Three/R3F) e un chunk separat, cerut doar după montare pe client: prerandarea statică nu-l importă
// și nu atinge WebGL sau window (ARCHITECTURE §13).
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

/**
 * Prinde erorile de randare ale canvas-ului (context WebGL pierdut, geometrie degenerată). Mesajul excepției nu se
 * afișează (poate fi tehnic sau neinteligibil); rămâne în consola dezvoltatorului. Planul 2D și documentul nu sunt afectate.
 */
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

/**
 * Vizualizarea 3D a proiectului activ. Primește documentul și derivă scena prin `selectScene` (același calcul ca în
 * rest); se actualizează la orice schimbare a documentului. Doar citire: nu modifică documentul.
 */
export function Viewer3D({
  doc,
  selectedObjectId = null,
  onSelectObject,
  selectedSurface = null,
  onSelectSurface,
  sidePanel,
}: {
  doc: ProjectDocument;
  /** Obiectul selectat (comun cu planul 2D); apare conturat în scenă. */
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  /** Podeaua sau fața de perete aleasă (pentru materiale); clic pe suprafață o alege. */
  selectedSurface?: FinishTarget | null;
  onSelectSurface?: (s: FinishTarget | null) => void;
  /** Panou lateral (catalog și proprietăți), compus în `app/`. */
  sidePanel?: ReactNode;
}) {
  const result = useMemo(() => computeScene(doc), [doc]);
  // pe server (prerandare) „checking”; pe client, verificarea reală — fără setState în efect
  const webgl = useSyncExternalStore(subscribeNever, webglStatus, () => 'checking' as const);
  const [resetNonce, setResetNonce] = useState(0);
  const [preset, setPreset] = useState<'perspective' | 'top'>('perspective');
  const [cutaway, setCutaway] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [stats, setStats] = useState<SceneStats | null>(null);

  const empty =
    result.ok &&
    result.scene.prisms.length === 0 &&
    result.scene.floors.length === 0 &&
    result.scene.boxes.length === 0;
  // rețetă necunoscută/mai nouă: obiectul se desenează ca o cutie, cu avertisment (datele nu se pierd)
  const placeholders = result.ok
    ? result.scene.boxes.filter((b) => !b.recipe || !resolveRecipe(b.recipe.id, b.recipe.version))
        .length
    : 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section
        aria-label="Vizualizare 3D"
        className="flex min-w-0 flex-1 flex-col gap-3 lg:sticky lg:top-2 lg:h-[calc(100dvh-12rem)] lg:min-h-[28rem]"
        data-testid="viewer-3d"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setPreset('perspective');
              setResetNonce((n) => n + 1);
            }}
            disabled={!result.ok || empty || webgl !== 'ok'}
            title="Încadrează întregul proiect, din colț"
            data-testid="viewer3d-reset"
          >
            Resetează vederea
          </Button>
          <Button
            onClick={() => {
              setPreset('top');
              setResetNonce((n) => n + 1);
            }}
            disabled={!result.ok || empty || webgl !== 'ok'}
            title="Privește planul de sus"
            data-testid="viewer3d-top"
          >
            De sus
          </Button>
          <Button
            variant={cutaway ? 'primary' : 'secondary'}
            aria-pressed={cutaway}
            onClick={() => setCutaway((v) => !v)}
            disabled={!result.ok || empty || webgl !== 'ok'}
            title="Desenează pereții tăiați la o treime din înălțime, ca să vezi interiorul"
            data-testid="viewer3d-cutaway"
          >
            Pereți tăiați
          </Button>
          <Button
            onClick={() => setFocusNonce((n) => n + 1)}
            disabled={!result.ok || empty || webgl !== 'ok' || !selectedObjectId}
            title="Mută camera pe obiectul selectat"
            data-testid="viewer3d-focus"
          >
            Centrează pe selecție
          </Button>
          <span className="text-xs text-stone-600" data-testid="viewer3d-hint">
            Click stânga + tragere: rotește · roata mouse-ului: zoom · click dreapta + tragere:
            deplasează
          </span>
        </div>

        <div
          className="relative h-[60vh] min-h-80 flex-1 overflow-hidden rounded-xl border border-stone-300 bg-stone-100 lg:h-auto"
          data-testid="viewer3d-box"
          data-walls={stats?.walls ?? ''}
          data-objects={stats?.objects ?? ''}
          data-floors={stats?.floors ?? ''}
          data-scene-hash={result.ok ? result.scene.hash : ''}
        >
          {!result.ok ? (
            <div className="p-4">
              <Alert
                tone="error"
                title="Proiectul nu poate fi afișat în 3D"
                testId="viewer3d-error"
              >
                <p>
                  {result.error.message} Corectează planul 2D (de exemplu un perete care se
                  intersectează sau o cameră neînchisă) și revino la 3D.
                </p>
                {result.error instanceof InvalidDocumentError && result.error.issues.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5" data-testid="viewer3d-issues">
                    {result.error.issues.slice(0, 8).map((i, k) => (
                      <li key={`${i.code}:${i.path}:${k}`}>{i.message}</li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
            </div>
          ) : webgl === 'unsupported' ? (
            <div className="p-4">
              <Alert tone="warning" title="WebGL nu este disponibil" testId="viewer3d-nowebgl">
                Browserul sau dispozitivul nu permite grafica 3D (WebGL). Planul 2D funcționează
                normal; încearcă alt browser sau activează accelerarea hardware.
              </Alert>
            </div>
          ) : webgl === 'checking' ? (
            <div className="p-4">
              <Spinner label="Se pregătește vizualizarea 3D…" />
            </div>
          ) : (
            <>
              <RenderBoundary key={retryNonce} onRetry={() => setRetryNonce((n) => n + 1)}>
                <Suspense
                  fallback={
                    <div className="p-4">
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
                <div className="absolute inset-x-4 top-4" data-testid="viewer3d-context-lost">
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
                  className="pointer-events-none absolute inset-x-4 top-4 rounded-lg bg-surface/90 p-3 text-center text-sm text-stone-700"
                  data-testid="viewer3d-empty"
                >
                  Proiectul nu are încă pereți sau camere. Adaugă-le în planul 2D și revino aici.
                </p>
              ) : null}
            </>
          )}
        </div>
        {placeholders > 0 ? (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
            data-testid="viewer3d-placeholders"
          >
            {placeholders} {placeholders === 1 ? 'obiect folosește' : 'obiecte folosesc'} o rețetă
            necunoscută și {placeholders === 1 ? 'este afișat' : 'sunt afișate'} ca o simplă cutie.
            Dimensiunile și datele se păstrează.
          </p>
        ) : null}
      </section>
      {sidePanel ? (
        <aside
          aria-label="Obiecte"
          className="space-y-4 lg:sticky lg:top-2 lg:max-h-[calc(100dvh-12rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-1"
        >
          {sidePanel}
        </aside>
      ) : null}
    </div>
  );
}
