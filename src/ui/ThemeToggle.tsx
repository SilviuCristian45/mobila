'use client';

import { THEME_LABELS, setThemeMode, useThemeMode, type ThemeMode } from '@/lib/theme';
import { IconSunMoon } from './icons';

/** Alegerea temei (sistem / luminoasă / întunecată); se păstrează local. */
export function ThemeToggle({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const mode = useThemeMode();
  return (
    <label
      className={`inline-flex items-center gap-1.5 text-xs text-stone-600 ${className}`.trim()}
      title="Temă de culoare"
    >
      <IconSunMoon size={15} className="text-stone-500" />
      <span className={compact ? 'sr-only' : 'text-xs font-medium text-stone-600'}>Temă</span>
      <select
        value={mode}
        onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
        className={`rounded-lg border border-stone-200 bg-surface-subtle text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
          compact ? 'h-8 px-2 text-xs' : 'h-8 px-2.5 text-xs font-medium'
        }`}
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
