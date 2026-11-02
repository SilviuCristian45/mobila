import { Button } from '@/ui/Button';
import type { Tool } from './types';

/** Textul-ajutor al planului (descrie zona planului pentru tehnologii asistive) și butonul de rotire din timpul plasării. */
export function PlanHint({
  placing,
  tool,
  drawing,
  onRotatePlacing,
}: {
  placing: boolean;
  tool: Tool;
  /** Un fir de perete e început (unealta „Perete nou”)? */
  drawing: boolean;
  onRotatePlacing: () => void;
}) {
  return (
    <>
      <p id="plan-hint" className="min-h-8 text-xs text-stone-600" data-testid="plan-hint">
        {placing
          ? 'Mută cursorul pe plan: camera se lipește de grilă și împarte peretele cu o cameră vecină (roșu = nu încape). R o rotește, apasă ca s-o plasezi, Esc anulează.'
          : tool === 'wall'
            ? drawing
              ? 'Alege sfârșitul peretelui. Esc oprește desenarea.'
              : 'Alege începutul peretelui (un nod existent sau un punct din grilă).'
            : 'Trage o cameră din paletă pe plan. Trage nodurile ca să muți pereții, golurile ca să le repoziționezi, o cameră deja selectată ca s-o muți întreagă; trage fundalul ca să deplasezi planul. Săgețile mută elementul selectat.'}
      </p>
      {placing ? (
        <div>
          <Button
            onClick={onRotatePlacing}
            title="Rotește camera din paletă cu 90° (R)"
            data-testid="placing-rotate"
          >
            Rotește camera (R)
          </Button>
        </div>
      ) : null}
    </>
  );
}
