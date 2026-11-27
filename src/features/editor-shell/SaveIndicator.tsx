'use client';

import { formatDateTime } from '@/lib/format';
import type { SessionState, SessionStatus } from '@/state/session';

const LABELS: Record<SessionStatus, string> = {
  saved: 'Salvat',
  dirty: 'Nesalvat',
  saving: 'Se salvează…',
  error: 'Eroare salvare',
  conflict: 'Conflict',
  readonly: 'Doar citire',
  closed: 'Închis',
};

const DOTS: Record<SessionStatus, string> = {
  saved: 'bg-emerald-500',
  dirty: 'bg-amber-500',
  saving: 'bg-teal-500 animate-pulse',
  error: 'bg-red-500',
  conflict: 'bg-red-500',
  readonly: 'bg-stone-400',
  closed: 'bg-stone-400',
};

const PILLS: Record<SessionStatus, string> = {
  saved: 'border-stone-200 bg-surface-subtle text-stone-700',
  dirty: 'border-amber-200 bg-amber-50 text-amber-900',
  saving: 'border-teal-200 bg-teal-50 text-teal-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  conflict: 'border-red-200 bg-red-50 text-red-900',
  readonly: 'border-stone-200 bg-stone-100 text-stone-700',
  closed: 'border-stone-200 bg-stone-100 text-stone-600',
};

/** Indicatorul stării de salvare tip studio pill; anunțat politicos cititoarelor de ecran la fiecare schimbare. */
export function SaveIndicator({ state }: { state: SessionState }) {
  const savedAt = state.lastSavedAt ? `Ultima salvare: ${formatDateTime(state.lastSavedAt)}` : '';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILLS[state.status]}`}
      data-testid="save-status"
      data-status={state.status}
      title={savedAt || LABELS[state.status]}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[state.status]}`}
      />
      <span>{LABELS[state.status]}</span>
    </div>
  );
}
