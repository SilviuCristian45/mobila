'use client';

import { formatDateTime } from '@/lib/format';
import type { SessionState, SessionStatus } from '@/state/session';
import { Badge } from '@/ui/feedback';

const LABELS: Record<SessionStatus, string> = {
  saved: 'Salvat',
  dirty: 'Modificări nesalvate',
  saving: 'Se salvează…',
  error: 'Eroare la salvare',
  conflict: 'Conflict de versiuni',
  readonly: 'Doar citire',
  closed: 'Sesiune închisă',
};
const TONES: Record<SessionStatus, 'ok' | 'warning' | 'error' | 'neutral'> = {
  saved: 'ok',
  dirty: 'warning',
  saving: 'neutral',
  error: 'error',
  conflict: 'error',
  readonly: 'neutral',
  closed: 'neutral',
};

/** Indicatorul stării de salvare; anunțat politicos cititoarelor de ecran la fiecare schimbare. */
export function SaveIndicator({ state }: { state: SessionState }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm"
      data-testid="save-status"
      data-status={state.status}
    >
      <Badge tone={TONES[state.status]}>{LABELS[state.status]}</Badge>
      {state.status === 'saved' && state.lastSavedAt ? (
        <span className="text-xs text-stone-500">la {formatDateTime(state.lastSavedAt)}</span>
      ) : null}
    </div>
  );
}
