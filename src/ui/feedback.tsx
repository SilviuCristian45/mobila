import type { ReactNode } from 'react';

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-stone-600">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700"
      />
      <span>{label}</span>
    </div>
  );
}

type AlertTone = 'error' | 'warning' | 'info' | 'success';
const tones: Record<AlertTone, string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

/** Mesaj de stare. `error`/`warning` sunt anunțate imediat (role="alert"), restul politicos (role="status"). */
export function Alert({
  tone,
  title,
  children,
  actions,
  testId,
}: {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      data-testid={testId}
      className={`rounded-xl border p-4 ${tones[tone]}`}
    >
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm">{children}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warning' | 'error' | 'ok';
  children: ReactNode;
}) {
  const t = {
    neutral: 'bg-stone-200 text-stone-800',
    warning: 'bg-amber-100 text-amber-900',
    error: 'bg-red-100 text-red-900',
    ok: 'bg-emerald-100 text-emerald-900',
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>
      {children}
    </span>
  );
}
