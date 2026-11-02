// @vitest-environment jsdom
// Tema luminoasă / întunecată (ADR-058): alegerea se păstrează, se aplică pe <html>, iar „Sistem” urmează preferința sistemului.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_INIT_SCRIPT } from '@/lib/theme-script';
import { applyTheme, readThemeMode, resolveTheme, setThemeMode } from '@/lib/theme';
import { ThemeToggle } from '@/ui/ThemeToggle';

let systemDark = false;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  systemDark = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('dark') && systemDark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('tema', () => {
  it('implicit „Sistem”: urmează preferința sistemului', () => {
    expect(readThemeMode()).toBe('system');
    expect(resolveTheme('system')).toBe('light');
    systemDark = true;
    expect(resolveTheme('system')).toBe('dark');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('alegerea explicită bate sistemul și se păstrează; o valoare invalidă cade pe „Sistem”', () => {
    systemDark = true;
    setThemeMode('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(readThemeMode()).toBe('light');
    localStorage.setItem('rc:theme', 'albastru');
    expect(readThemeMode()).toBe('system');
  });

  it('selectorul schimbă tema și o scrie pe <html>', () => {
    render(<ThemeToggle />);
    const select = screen.getByTestId('theme-select') as HTMLSelectElement;
    expect(select.value).toBe('system');
    act(() => {
      fireEvent.change(select, { target: { value: 'dark' } });
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('rc:theme')).toBe('dark');
    expect(select.value).toBe('dark');
  });

  it('scriptul din <head> aplică aceeași regulă ca aplicația', () => {
    const run = () => {
      delete document.documentElement.dataset.theme;
      new Function(THEME_INIT_SCRIPT)();
      return document.documentElement.dataset.theme;
    };
    expect(run()).toBe('light');
    systemDark = true;
    expect(run()).toBe('dark');
    localStorage.setItem('rc:theme', 'light');
    expect(run()).toBe('light');
    systemDark = false;
    localStorage.setItem('rc:theme', 'dark');
    expect(run()).toBe('dark');
  });
});
