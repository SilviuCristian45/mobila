import { Button } from '@/ui/Button';
import type { Tool } from './types';
import { ZOOM_STEP } from './view';

/** Bara de unelte a planului: selectare / perete, zoom, comutatorul de scurtături și ștergerea selecției. */
export function PlanToolbar({
  tool,
  setTool,
  editable,
  zoomBy,
  fit,
  scaleLabel,
  shortcuts,
  setShortcuts,
  canDelete,
  onDelete,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  editable: boolean;
  zoomBy: (factor: number) => void;
  fit: () => void;
  /** Lungimea reprezentată de 100 px, deja formatată (în unitatea proiectului). */
  scaleLabel: string;
  shortcuts: boolean;
  setShortcuts: (on: boolean) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Unelte plan"
      className="flex flex-wrap items-center gap-2"
      data-testid="plan-toolbar"
    >
      <Button
        variant={tool === 'select' ? 'primary' : 'secondary'}
        aria-pressed={tool === 'select'}
        onClick={() => setTool('select')}
        title="Selectează și mută (V)"
        data-testid="tool-select"
      >
        Selectează
      </Button>
      <Button
        variant={tool === 'wall' ? 'primary' : 'secondary'}
        aria-pressed={tool === 'wall'}
        disabled={!editable}
        onClick={() => setTool(tool === 'wall' ? 'select' : 'wall')}
        title="Desenează pereți (W)"
        data-testid="tool-wall"
      >
        Perete nou
      </Button>
      <span className="mx-1 hidden h-6 w-px bg-stone-300 sm:block" aria-hidden="true" />
      <Button
        onClick={() => zoomBy(1 / ZOOM_STEP)}
        aria-label="Micșorează"
        title="Micșorează (−)"
        data-testid="zoom-out"
      >
        −
      </Button>
      <Button
        onClick={() => zoomBy(ZOOM_STEP)}
        aria-label="Mărește"
        title="Mărește (+)"
        data-testid="zoom-in"
      >
        +
      </Button>
      <Button onClick={fit} title="Potrivește planul în fereastră (0)" data-testid="zoom-fit">
        Potrivește
      </Button>
      <span className="text-xs text-stone-600" data-testid="zoom-level">
        Scară: 100 px ≈ {scaleLabel}
      </span>
      <label
        className="flex items-center gap-1.5 text-xs text-stone-700"
        title="Scurtături cu o singură tastă: W perete, V selectare, R rotire, + − zoom, 0 potrivire. Oprește-le dacă te încurcă (de exemplu cu tehnologii asistive)."
      >
        <input
          type="checkbox"
          checked={shortcuts}
          onChange={(e) => setShortcuts(e.target.checked)}
          data-testid="shortcuts-toggle"
        />
        Scurtături de tastă
      </label>
      <span className="ml-auto" />
      <Button
        variant="danger"
        disabled={!canDelete}
        onClick={onDelete}
        title="Șterge elementul selectat (Delete)"
        data-testid="toolbar-delete"
      >
        Șterge
      </Button>
    </div>
  );
}
