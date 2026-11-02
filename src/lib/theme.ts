import { useSyncExternalStore } from 'react';
import { THEME_KEY } from './theme-script';

/** Tema aplicației: `system` urmează preferința sistemului; alegerea se păstrează local (`rc:theme`). */
export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export { THEME_KEY };
const EVENT = 'rc:theme-changed';
const QUERY = '(prefers-color-scheme: dark)';

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Sistem',
  light: 'Luminoasă',
  dark: 'Întunecată',
};

const isMode = (v: unknown): v is ThemeMode => v === 'system' || v === 'light' || v === 'dark';

export function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isMode(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemPrefersDark = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(QUERY).matches;

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
}

/** Pune tema rezolvată pe <html> (`data-theme`), de unde o citesc stilurile din globals.css. */
export function applyTheme(mode: ThemeMode = readThemeMode()): void {
  document.documentElement.dataset.theme = resolveTheme(mode);
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // stocare indisponibilă: tema se aplică doar pentru sesiunea curentă
    memoryMode = mode;
  }
  applyTheme(mode);
  window.dispatchEvent(new Event(EVENT));
}

let memoryMode: ThemeMode | null = null;
const currentMode = (): ThemeMode => memoryMode ?? readThemeMode();

function subscribe(onChange: () => void): () => void {
  const mq = typeof matchMedia === 'function' ? matchMedia(QUERY) : null;
  const onSystem = () => {
    if (currentMode() === 'system') applyTheme('system');
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onSystem);
  mq?.addEventListener('change', onSystem);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onSystem);
    mq?.removeEventListener('change', onSystem);
  };
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, currentMode, () => 'system');
}

/** Tema efectivă (light/dark), pentru părțile desenate în canvas (de exemplu fundalul 3D). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => resolveTheme(currentMode()),
    () => 'light',
  );
}
