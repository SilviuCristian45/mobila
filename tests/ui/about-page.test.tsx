// @vitest-environment jsdom
// Pagina „Despre / Licențe / Confidențialitate” (ROADMAP Etapa 8): conținut, lista de licențe și respectarea politicii.
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import AboutPage from '@/app/despre/page';
import { APP_VERSION } from '@/lib/app-info';
import licenses from '@/lib/third-party-licenses.json';

afterEach(cleanup);

describe('pagina Despre', () => {
  it('afișează secțiunile, versiunea și sumarul licențelor', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-page')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/licențe/);
    for (const name of [/^Despre /, /Confidențialitate/, /Licențe și atribuiri/]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(screen.getByTestId('about-version').textContent).toBe(APP_VERSION);
    expect(screen.getByTestId('about-license-summary').textContent).toContain(
      `${licenses.length} pachete`,
    );
    expect(screen.getByTestId('about-back').getAttribute('href')).toBeTruthy();
  });

  it('lista de pachete corespunde fișierului generat și nu conține licențe interzise', () => {
    render(<AboutPage />);
    expect(licenses.length).toBeGreaterThan(20);
    expect(screen.getByTestId('about-packages').querySelectorAll('li')).toHaveLength(
      licenses.length,
    );
    for (const p of licenses) {
      expect(p.name && p.version && p.license).toBeTruthy();
      expect(p.license).not.toMatch(/GPL|AGPL|SSPL|UNLICENSED/i);
    }
  });

  it('textul de confidențialitate nu promite ce nu e adevărat: nicio cerere externă în cod', () => {
    const src = readFileSync('src/app/despre/page.tsx', 'utf8');
    expect(src).not.toMatch(/https?:\/\//);
  });
});
