'use client';

import { useCallback, useState } from 'react';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { MaterialsPanel, type PlanSelectionInfo } from '@/features/materials/MaterialsPanel';
import { PlanEditor } from '@/features/plan-editor/PlanEditor';
import { Viewer3D } from '@/features/viewer-3d/Viewer3D';
import type { ProjectSession, SessionState } from '@/state/session';

type Mode = '2d' | '3d';
type Side = 'catalog' | 'materials' | null;
const TABS: ReadonlyArray<{ mode: Mode; label: string }> = [
  { mode: '2d', label: 'Plan 2D' },
  { mode: '3d', label: 'Vizualizare 3D' },
];

const toggleClass = (on: boolean) =>
  `rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
    on
      ? 'border-teal-700 bg-teal-50 text-teal-900'
      : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
  }`;

/**
 * Suprafața de lucru: același proiect activ (aceeași sesiune, același autosave) văzut în 2D sau 3D.
 * Editorul 2D se demontează în modul 3D (scurtăturile lui — Delete, săgeți — nu trebuie să acționeze nevăzut);
 * tot ce contează trăiește în sesiune, deci revenirea în 2D păstrează documentul.
 */
function Workspace({ session, state }: { session: ProjectSession; state: SessionState }) {
  const [mode, setMode] = useState<Mode>('2d');
  const [side, setSide] = useState<Side>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [planSelection, setPlanSelection] = useState<PlanSelectionInfo | null>(null);
  const [surface, setSurface] = useState<
    | { kind: 'roomFloor'; roomId: string }
    | { kind: 'wallSide'; wallId: string; side: 'left' | 'right' }
    | null
  >(null);

  // selecțiile sunt comune (plan 2D, 3D, panouri); un obiect și o suprafață nu sunt selectate simultan
  const selected =
    selectedObjectId && selectedObjectId in state.doc.objects ? selectedObjectId : null;
  const selectObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    if (id) setSurface(null);
  }, []);
  const selectSurface = useCallback((t: { kind: string } | null) => {
    const s = t && (t.kind === 'roomFloor' || t.kind === 'wallSide') ? (t as typeof surface) : null;
    setSurface(s);
    if (s) {
      setSelectedObjectId(null);
      setSide('materials'); // clic pe o suprafață în 3D deschide panoul de materiale
    }
  }, []);
  const onPlanSelection = useCallback((s: PlanSelectionInfo | null) => {
    setPlanSelection(s);
    if (s) setSurface(null);
  }, []);

  const sidePanel = (
    <>
      {side === 'materials' ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <MaterialsPanel
            session={session}
            state={state}
            selectedObjectId={selected}
            planSelection={planSelection}
            surfaceTarget={surface}
            onSurfaceTarget={selectSurface}
            onClose={() => setSide(null)}
          />
        </div>
      ) : null}
      <CatalogPanel
        session={session}
        state={state}
        catalogOpen={side === 'catalog'}
        onCloseCatalog={() => setSide(null)}
        selectedObjectId={selected}
        onSelectObject={selectObject}
      />
    </>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Mod de vizualizare" className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              role="tab"
              id={`tab-${t.mode}`}
              aria-selected={mode === t.mode}
              aria-controls="workspace-panel"
              data-testid={`mode-${t.mode}`}
              onClick={() => setMode(t.mode)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                mode === t.mode
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={side === 'materials'}
            onClick={() => setSide((s) => (s === 'materials' ? null : 'materials'))}
            data-testid="materials-toggle"
            className={toggleClass(side === 'materials')}
          >
            Materiale și finisaje
          </button>
          <button
            type="button"
            aria-pressed={side === 'catalog'}
            onClick={() => setSide((s) => (s === 'catalog' ? null : 'catalog'))}
            data-testid="catalog-toggle"
            className={toggleClass(side === 'catalog')}
          >
            Catalog de obiecte
          </button>
        </div>
      </div>
      <div id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
        {mode === '2d' ? (
          <PlanEditor
            session={session}
            state={state}
            selectedObjectId={selected}
            onSelectObject={selectObject}
            onSelectionChange={onPlanSelection}
            sidePanel={sidePanel}
          />
        ) : (
          <Viewer3D
            doc={state.doc}
            selectedObjectId={selected}
            onSelectObject={selectObject}
            selectedSurface={surface}
            onSelectSurface={selectSurface}
            sidePanel={sidePanel}
          />
        )}
      </div>
    </div>
  );
}

/** Compoziția rutei editorului: carcasa sesiunii + 2D/3D (modulele din features/ nu se importă între ele). */
export function EditorClient() {
  return (
    <EditorShell workspace={(session, state) => <Workspace session={session} state={state} />} />
  );
}
