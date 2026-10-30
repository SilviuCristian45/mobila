'use client';

import {
  Component,
  Suspense,
  lazy,
  useMemo,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  InvalidDocumentError,
  type FinishTarget,
  type ProjectDocument,
  type SceneDescription,
} from '@/domain';
import { resolveRecipe } from '@/catalog';
import { selectScene } from '@/state/selectors';
import { Button } from '@/ui/Button';
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

/** Prinde erorile de randare ale canvas-ului (context WebGL pierdut, geometrie degenerată) și le explică. */
class RenderBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Vizualizarea 3D a eșuat', error, info.componentStack);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Alert
          tone="error"
          title="Vizualizarea 3D a întâmpinat o eroare"
          testId="viewer3d-render-error"
          actions={
            <Button
              onClick={() => {
                this.setState({ error: null });
                this.props.onRetry();
              }}
            >
              Încearcă din nou
            </Button>
          }
        >
          {this.state.error.message || 'Eroare necunoscută la randare.'} Planul 2D și proiectul nu
          sunt afectate.
        </Alert>
      </div>
    );
  }
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
    <div className="flex flex-col gap-4 lg:flex-row">
      <section
        aria-label="Vizualizare 3D"
        className="min-w-0 flex-1 space-y-3"
        data-testid="viewer-3d"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setResetNonce((n) => n + 1)}
            disabled={!result.ok || empty || webgl !== 'ok'}
            title="Încadrează întregul proiect"
            data-testid="viewer3d-reset"
          >
            Resetează vederea
          </Button>
          <span className="text-xs text-stone-600" data-testid="viewer3d-hint">
            Click stânga + tragere: rotește · roata mouse-ului: zoom · click dreapta + tragere:
            deplasează
          </span>
        </div>

        <div
          className="relative h-[60vh] min-h-80 overflow-hidden rounded-xl border border-stone-300 bg-stone-100"
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
                    onStats={setStats}
                    selectedObjectId={selectedObjectId}
                    onSelectObject={onSelectObject}
                    selectedSurface={selectedSurface}
                    onSelectSurface={onSelectSurface}
                  />
                </Suspense>
              </RenderBoundary>
              {empty ? (
                <p
                  className="pointer-events-none absolute inset-x-4 top-4 rounded-lg bg-white/90 p-3 text-center text-sm text-stone-700"
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
        <aside aria-label="Obiecte" className="space-y-4 lg:w-80 lg:shrink-0">
          {sidePanel}
        </aside>
      ) : null}
    </div>
  );
}
