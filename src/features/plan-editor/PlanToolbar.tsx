import { useState } from 'react';
import {
  IconCatalog,
  IconCursor,
  IconKeyboard,
  IconLayers,
  IconMaterials,
  IconPanelLeft,
  IconRooms,
  IconTrash,
  IconWall,
} from '@/ui/icons';
import type { Tool } from './types';

export type LeftDrawerTab = 'rooms' | 'structure' | 'catalog' | 'materials' | null;

const railBtn = (active: boolean, tone: 'primary' | 'danger' = 'primary') =>
  `relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40 ${
    tone === 'danger'
      ? 'text-red-700 hover:bg-red-50'
      : active
        ? 'bg-teal-50 text-teal-800 shadow-2xs ring-1 ring-teal-700/25'
        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
  }`;

/**
 * Tool Rail vertical (52px pe desktop) pentru studioul 2D/Exterior:
 * - Sus: unelte directe pe canvas (Selectează, Perete nou)
 * - Mijloc: panouri retractabile (Camere/Zone, Catalog, Materiale, Structură)
 * - Jos: Șterge selecție, Colapsează drawer, Popover scurtături tastatură.
 */
export function PlanToolbar({
  tool,
  setTool,
  editable,
  canDelete,
  onDelete,
  activeDrawer,
  onSelectDrawer,
  scope = 'interior',
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  editable: boolean;
  canDelete: boolean;
  onDelete: () => void;
  activeDrawer: LeftDrawerTab;
  onSelectDrawer: (tab: LeftDrawerTab) => void;
  scope?: 'interior' | 'exterior';
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div
      role="toolbar"
      aria-label="Unelte plan"
      aria-orientation="vertical"
      className="relative z-10 flex shrink-0 flex-row items-center gap-1 border-b border-stone-200 bg-surface p-1.5 lg:w-[52px] lg:flex-col lg:border-r lg:border-b-0 lg:py-2"
      data-testid="plan-toolbar"
    >
      {/* Unelte directe */}
      <button
        type="button"
        aria-pressed={tool === 'select'}
        aria-label="Selectează (V)"
        title="Selectează și mută (V)"
        onClick={() => setTool('select')}
        data-testid="tool-select"
        className={railBtn(tool === 'select')}
      >
        <IconCursor size={17} />
      </button>
      <button
        type="button"
        aria-pressed={tool === 'wall'}
        aria-label="Perete nou (W)"
        title="Desenează pereți (W)"
        disabled={!editable}
        onClick={() => setTool(tool === 'wall' ? 'select' : 'wall')}
        data-testid="tool-wall"
        className={railBtn(tool === 'wall')}
      >
        <IconWall size={17} />
      </button>

      <span
        className="mx-0.5 h-5 w-px bg-stone-200 lg:mx-0 lg:my-1 lg:h-px lg:w-6"
        aria-hidden="true"
      />

      {/* Panouri stânga (Left Drawer) */}
      <button
        type="button"
        aria-pressed={activeDrawer === 'rooms'}
        aria-label={scope === 'exterior' ? 'Zone exterioare' : 'Camere'}
        title={scope === 'exterior' ? 'Zone exterioare' : 'Camere și forme'}
        onClick={() => onSelectDrawer(activeDrawer === 'rooms' ? null : 'rooms')}
        data-testid="drawer-rooms-toggle"
        className={railBtn(activeDrawer === 'rooms')}
      >
        <IconRooms size={17} />
      </button>
      <button
        type="button"
        aria-pressed={activeDrawer === 'catalog'}
        aria-label="Catalog de obiecte"
        title="Catalog de obiecte"
        onClick={() => onSelectDrawer(activeDrawer === 'catalog' ? null : 'catalog')}
        data-testid="catalog-toggle"
        className={railBtn(activeDrawer === 'catalog')}
      >
        <IconCatalog size={17} />
      </button>
      <button
        type="button"
        aria-pressed={activeDrawer === 'materials'}
        aria-label="Materiale și finisaje"
        title="Materiale și finisaje"
        onClick={() => onSelectDrawer(activeDrawer === 'materials' ? null : 'materials')}
        data-testid="materials-toggle"
        className={railBtn(activeDrawer === 'materials')}
      >
        <IconMaterials size={17} />
      </button>
      <button
        type="button"
        aria-pressed={activeDrawer === 'structure'}
        aria-label="Structură proiect"
        title="Structură proiect (Camere, pereți, goluri)"
        onClick={() => onSelectDrawer(activeDrawer === 'structure' ? null : 'structure')}
        data-testid="drawer-structure-toggle"
        className={railBtn(activeDrawer === 'structure')}
      >
        <IconLayers size={17} />
      </button>

      <span className="ml-auto lg:mt-auto lg:ml-0" />

      {/* Utilitare jos */}
      <button
        type="button"
        disabled={!canDelete}
        aria-label="Șterge selecția"
        title="Șterge elementul selectat (Delete)"
        onClick={onDelete}
        data-testid="toolbar-delete"
        className={railBtn(false, 'danger')}
      >
        <IconTrash size={16} />
      </button>
      <button
        type="button"
        aria-pressed={activeDrawer !== null}
        aria-label={activeDrawer ? 'Ascunde panoul stâng' : 'Arată panoul stâng'}
        title={activeDrawer ? 'Ascunde panoul stâng' : 'Arată panoul stâng'}
        onClick={() => onSelectDrawer(activeDrawer ? null : 'rooms')}
        data-testid="drawer-collapse-toggle"
        className={railBtn(false)}
      >
        <IconPanelLeft size={16} />
      </button>
      <button
        type="button"
        aria-expanded={helpOpen}
        aria-label="Scurtături de tastatură"
        title="Scurtături de tastatură"
        onClick={() => setHelpOpen((v) => !v)}
        data-testid="shortcuts-help-toggle"
        className={railBtn(helpOpen)}
      >
        <IconKeyboard size={16} />
      </button>

      {helpOpen ? (
        <div
          role="dialog"
          aria-label="Scurtături de tastatură"
          className="absolute bottom-12 left-2 z-30 w-56 rounded-xl border border-stone-200 bg-surface p-3 text-xs shadow-lg lg:bottom-2 lg:left-14"
        >
          <div className="mb-2 flex items-center justify-between font-semibold text-stone-900">
            <span>Scurtături rapide</span>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="rounded px-1 text-stone-500 hover:bg-stone-100"
              aria-label="Închide lista de scurtături"
            >
              ✕
            </button>
          </div>
          <dl className="space-y-1 text-stone-600">
            {[
              ['V', 'Selectează'],
              ['W', 'Perete nou'],
              ['R / Shift+R', 'Rotește ±90°'],
              ['Del', 'Șterge selecția'],
              ['Ctrl+D', 'Duplică obiecte'],
              ['Ctrl+Z / Y', 'Undo / Redo'],
              ['+ / − / 0', 'Zoom / Potrivește'],
              ['Esc', 'Anulează / Deselectează'],
            ].map(([k, desc]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="text-stone-500">{desc}</dt>
                <dd className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-stone-800">
                  {k}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
