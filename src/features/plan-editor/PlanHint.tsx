import type { Tool } from './types';

/** Micro-indicație contextuală discretă (1 linie, colțul stânga-jos al canvas-ului); păstrează `id="plan-hint"` pentru `aria-describedby`. */
export function PlanHint({
  placing,
  tool,
  drawing,
}: {
  placing: boolean;
  tool: Tool;
  /** Un fir de perete e început (unealta „Perete nou”)? */
  drawing: boolean;
}) {
  const text = placing
    ? 'Click pe plan pentru a plasa · R rotește · Esc anulează'
    : tool === 'wall'
      ? drawing
        ? 'Click pentru capătul peretelui · Esc oprește desenarea'
        : 'Click pe un nod sau punct din grilă pentru începutul peretelui'
      : 'Trage camere din panoul stâng · Drag pe fundal: pan · Scroll: zoom · Săgeți: mutare';

  return (
    <p
      id="plan-hint"
      className="pointer-events-none max-w-[32rem] truncate rounded-full border border-stone-200/80 bg-surface/85 px-3 py-1 text-[11px] text-stone-600 shadow-xs backdrop-blur-md"
      data-testid="plan-hint"
      title={text}
    >
      {text}
    </p>
  );
}
