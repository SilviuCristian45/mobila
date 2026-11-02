'use client';

import { THEME_LABELS, setThemeMode, useThemeMode, type ThemeMode } from '@/lib/theme';

/** Alegerea temei (sistem / luminoasă / întunecată); se păstrează local. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const mode = useThemeMode();
  return (
    <label className={`inline-flex items-center gap-1.5 text-sm text-stone-600 ${className}`}>
      Temă
      <select
        value={mode}
        onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
        className="rounded-md border border-stone-300 bg-surface px-2 py-1 text-sm text-stone-900"
        data-testid="theme-select"
      >
        {(Object.keys(THEME_LABELS) as ThemeMode[]).map((m) => (
          <option key={m} value={m}>
            {THEME_LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  );
}
