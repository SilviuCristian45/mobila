'use client';

import { useCallback, useState } from 'react';
import { BudgetPanel } from '@/features/budget/BudgetPanel';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import {
  CustomFurnitureStudio,
  type CustomPreviewProps,
} from '@/features/custom-furniture/CustomFurnitureStudio';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { MaterialsPanel, type PlanSelectionInfo } from '@/features/materials/MaterialsPanel';
import { PlanEditor } from '@/features/plan-editor/PlanEditor';
import { IsolatedObjectViewer } from '@/features/viewer-3d/IsolatedObjectViewer';
import { Viewer3D } from '@/features/viewer-3d/Viewer3D';
import type { ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Alert } from '@/ui/feedback';
import { IconBudget, IconCube3D, IconCustomFurniture, IconExterior, IconPlan2D } from '@/ui/icons';

type Mode = '2d' | 'exterior' | 'custom' | '3d' | 'budget';
type Side = 'catalog' | 'materials' | null;

const TABS: ReadonlyArray<{
  mode: Mode;
  label: string;
  shortLabel: string;
  accent?: 'exterior' | 'custom';
}> = [
  { mode: '2d', label: 'Plan 2D', shortLabel: '2D' },
  { mode: 'exterior', label: 'Build Exterior', shortLabel: 'Exterior', accent: 'exterior' },
  { mode: 'custom', label: 'Mobilă la comandă', shortLabel: 'Mobilă', accent: 'custom' },
  { mode: '3d', label: 'Vizualizare 3D', shortLabel: '3D' },
  { mode: 'budget', label: 'Buget', shortLabel: 'Buget' },
];

function TabIcon({ mode }: { mode: Mode }) {
  if (mode === '2d') return <IconPlan2D size={14} />;
  if (mode === 'exterior') return <IconExterior size={14} />;
  if (mode === 'custom') return <IconCustomFurniture size={14} />;
  if (mode === '3d') return <IconCube3D size={14} />;
  return <IconBudget size={14} />;
}

/**
 * Segmented Control de moduri plasat în centrul barei de sus (48px).
 * Păstrează modelul ARIA complet (`role="tablist"`, roving `tabindex`, săgeți / Home / End).
 */
function ModeSegmentedControl({ mode, onSwitch }: { mode: Mode; onSwitch: (next: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Mod de vizualizare"
      className="inline-flex items-center gap-0.5 rounded-xl border border-stone-200/80 bg-stone-100 p-0.5"
      onKeyDown={(e) => {
        const i = TABS.findIndex((t) => t.mode === mode);
        const next =
          e.key === 'ArrowRight'
            ? (i + 1) % TABS.length
            : e.key === 'ArrowLeft'
              ? (i - 1 + TABS.length) % TABS.length
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? TABS.length - 1
                  : -1;
        if (next < 0) return;
        e.preventDefault();
        const target = TABS[next]!.mode;
        onSwitch(target);
        document.getElementById(`tab-${target}`)?.focus();
      }}
    >
      {TABS.map((t) => {
        const active = mode === t.mode;
        const activeStyle =
          t.accent === 'exterior'
            ? 'bg-surface text-emerald-800 shadow-xs ring-1 ring-emerald-700/20'
            : t.accent === 'custom'
              ? 'bg-surface text-amber-900 shadow-xs ring-1 ring-amber-700/20'
              : 'bg-surface text-teal-900 shadow-xs ring-1 ring-stone-200/80';
        return (
          <button
            key={t.mode}
            type="button"
            role="tab"
            id={`tab-${t.mode}`}
            aria-selected={active}
            aria-controls="workspace-panel"
            tabIndex={active ? 0 : -1}
            data-testid={`mode-${t.mode}`}
            onClick={() => onSwitch(t.mode)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
              active ? activeStyle : 'text-stone-600 hover:text-stone-950'
            }`}
          >
            <TabIcon mode={t.mode} />
            <span className="hidden md:inline">{t.label}</span>
            <span className="md:hidden">{t.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Suprafața de lucru full-viewport: compune PlanEditor, CustomFurnitureStudio, Viewer3D, BudgetPanel,
 * CatalogPanel și MaterialsPanel fără ca modulele din `features/` să se importe între ele.
 */
function Workspace({
  session,
  state,
  mode,
  side,
  setSide,
  onSwitchMode,
}: {
  session: ProjectSession;
  state: SessionState;
  mode: Mode;
  side: Side;
  setSide: (s: Side) => void;
  onSwitchMode: (next: Mode) => void;
}) {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [planSelection, setPlanSelection] = useState<PlanSelectionInfo | null>(null);
  const [surface, setSurface] = useState<
    | { kind: 'roomFloor'; roomId: string }
    | { kind: 'wallSide'; wallId: string; side: 'left' | 'right' }
    | null
  >(null);
  const [browserHost, setBrowserHost] = useState<HTMLDivElement | null>(null);

  const selected =
    selectedObjectId && selectedObjectId in state.doc.objects ? selectedObjectId : null;
  const selectObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    if (id) setSurface(null);
  }, []);
  const selectSurface = useCallback(
    (t: { kind: string } | null) => {
      const s =
        t && (t.kind === 'roomFloor' || t.kind === 'wallSide') ? (t as typeof surface) : null;
      setSurface(s);
      if (s) {
        setSelectedObjectId(null);
        setSide('materials');
      }
    },
    [setSide],
  );
  const onPlanSelection = useCallback((s: PlanSelectionInfo | null) => {
    setPlanSelection(s);
    if (s) setSurface(null);
  }, []);

  const openCustomConfigurator = useCallback(
    (objectId: string) => {
      setSelectedObjectId(objectId);
      onSwitchMode('custom');
    },
    [onSwitchMode],
  );

  const renderCustomPreview = useCallback(
    (props: CustomPreviewProps) => <IsolatedObjectViewer {...props} />,
    [],
  );

  const leftMaterialsContent =
    side === 'materials' ? (
      <ErrorBoundary
        label="panoul de materiale"
        resetKey={side}
        fallback={({ reset }) => (
          <Alert
            tone="error"
            title="Panoul de materiale a întâmpinat o eroare"
            actions={<Button onClick={reset}>Încearcă din nou</Button>}
          >
            Planul și proiectul nu sunt afectate.
          </Alert>
        )}
      >
        <MaterialsPanel
          key={mode === 'exterior' ? 'ext-mat' : 'all-mat'}
          session={session}
          state={state}
          selectedObjectId={selected}
          planSelection={planSelection}
          surfaceTarget={surface}
          onSurfaceTarget={selectSurface}
          onClose={() => setSide(null)}
          defaultCategory={mode === 'exterior' ? 'exterior' : null}
        />
      </ErrorBoundary>
    ) : null;

  // CatalogPanel e montat O SINGURĂ DATĂ în ErrorBoundary: randare CatalogBrowser prin portal în Left Drawer,
  // și ObjectPanel direct în Right Contextual Inspector.
  const rightSidePanel = (
    <ErrorBoundary
      label="panoul lateral"
      resetKey={side}
      fallback={({ reset }) => (
        <Alert
          tone="error"
          title="Panoul lateral a întâmpinat o eroare"
          testId="side-panel-error"
          actions={<Button onClick={reset}>Încearcă din nou</Button>}
        >
          Planul și proiectul nu sunt afectate.
        </Alert>
      )}
    >
      <CatalogPanel
        session={session}
        state={state}
        catalogOpen={side === 'catalog'}
        onCloseCatalog={() => setSide(null)}
        selectedObjectId={selected}
        onSelectObject={selectObject}
        scope={mode === 'exterior' ? 'exterior' : 'all'}
        browserHost={browserHost}
        onOpenMaterials={() => setSide('materials')}
        onOpenCustomConfigurator={openCustomConfigurator}
      />
    </ErrorBoundary>
  );

  return (
    <div
      id="workspace-panel"
      role="tabpanel"
      aria-labelledby={`tab-${mode}`}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {mode === 'budget' ? (
        <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            <ErrorBoundary
              label="bugetul"
              fallback={({ reset }) => (
                <Alert
                  tone="error"
                  title="Bugetul a întâmpinat o eroare"
                  testId="budget-render-error"
                  actions={<Button onClick={reset}>Încearcă din nou</Button>}
                >
                  Planul și proiectul nu sunt afectate; ce era salvat a rămas salvat.
                </Alert>
              )}
            >
              <BudgetPanel session={session} state={state} />
            </ErrorBoundary>
          </div>
        </div>
      ) : mode === 'custom' ? (
        <ErrorBoundary
          label="configuratorul de mobilă la comandă"
          fallback={({ reset }) => (
            <div className="p-4">
              <Alert
                tone="error"
                title="Configuratorul de mobilă a întâmpinat o eroare"
                actions={<Button onClick={reset}>Încearcă din nou</Button>}
              >
                Planul și proiectul nu sunt afectate.
              </Alert>
            </div>
          )}
        >
          <CustomFurnitureStudio
            key={selected ?? 'new'}
            session={session}
            state={state}
            initialObjectId={selected}
            renderPreview={renderCustomPreview}
            onPlacedInPlan={(id, goToPlan) => {
              selectObject(id);
              if (goToPlan) onSwitchMode('2d');
            }}
          />
        </ErrorBoundary>
      ) : mode === '2d' || mode === 'exterior' ? (
        <PlanEditor
          session={session}
          state={state}
          selectedObjectId={selected}
          onSelectObject={selectObject}
          onSelectionChange={onPlanSelection}
          sidePanel={rightSidePanel}
          side={side}
          onSideChange={setSide}
          leftDrawerContent={leftMaterialsContent}
          leftDrawerRef={setBrowserHost}
          scope={mode === 'exterior' ? 'exterior' : 'interior'}
        />
      ) : (
        <Viewer3D
          doc={state.doc}
          selectedObjectId={selected}
          onSelectObject={selectObject}
          selectedSurface={surface}
          onSelectSurface={selectSurface}
          sidePanel={rightSidePanel}
          side={side}
          onSideChange={setSide}
          leftDrawerContent={leftMaterialsContent}
          leftDrawerRef={setBrowserHost}
        />
      )}
    </div>
  );
}

/** Compoziția rutei editorului: carcasa studioului + segmented control în Top Bar + zonele de lucru. */
export function EditorClient() {
  const [mode, setMode] = useState<Mode>('2d');
  const [side, setSide] = useState<Side>(null);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    if (next === 'exterior') setSide((s) => s ?? 'catalog');
  }, []);

  return (
    <EditorShell
      headerCenter={<ModeSegmentedControl mode={mode} onSwitch={switchMode} />}
      workspace={(session, state) => (
        <Workspace
          session={session}
          state={state}
          mode={mode}
          side={side}
          setSide={setSide}
          onSwitchMode={switchMode}
        />
      )}
    />
  );
}
