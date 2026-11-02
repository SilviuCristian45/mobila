// @vitest-environment jsdom
// Memento periodic pentru copia de siguranță (ROADMAP Etapa 8): logica de decizie (pură) și comportamentul în editor.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProject } from '@/domain';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import {
  REMIND_AFTER_DAYS,
  SNOOZE_DAYS,
  backupSnapshot,
  daysSinceBackup,
  parseSnapshot,
  readRecord,
  shouldRemind,
  type ReminderInput,
} from '@/lib/backup-reminder';
import { renderWithRuntime, uiEnv } from '../helpers/ui';
import { studioProject } from '../reference/projects';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
const downloads: Array<{ name: string }> = [];
vi.mock('@/lib/download', async (orig) => ({
  ...(await orig<typeof import('@/lib/download')>()),
  downloadTextFile: (name: string) => downloads.push({ name }),
}));

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };

beforeEach(() => {
  downloads.length = 0;
  localStorage.clear();
  query = '';
});

describe('shouldRemind (pură)', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  const base: ReminderInput = {
    now,
    createdAt: iso(now - 30 * DAY),
    updatedAt: iso(now - 1 * DAY),
    hasContent: true,
    record: null,
  };

  it('nicio copie de la creare, proiect vechi și modificat: se amintește', () => {
    expect(shouldRemind(base)).toBe(true);
    expect(daysSinceBackup(base)).toBe(30);
  });

  it('prea devreme (sub pragul de zile) sau fără modificări de la ultima copie: nu se amintește', () => {
    expect(shouldRemind({ ...base, createdAt: iso(now - (REMIND_AFTER_DAYS - 1) * DAY) })).toBe(
      false,
    );
    expect(
      shouldRemind({
        ...base,
        record: { lastExportAt: iso(now - 20 * DAY) },
        updatedAt: iso(now - 25 * DAY),
      }),
    ).toBe(false);
    // exact la prag
    expect(shouldRemind({ ...base, createdAt: iso(now - REMIND_AFTER_DAYS * DAY) })).toBe(true);
  });

  it('o copie recentă oprește mementoul; una veche, cu modificări ulterioare, îl reporneste', () => {
    expect(shouldRemind({ ...base, record: { lastExportAt: iso(now - 1 * DAY) } })).toBe(false);
    expect(shouldRemind({ ...base, record: { lastExportAt: iso(now - 9 * DAY) } })).toBe(true);
    expect(daysSinceBackup({ ...base, record: { lastExportAt: iso(now - 9 * DAY) } })).toBe(9);
  });

  it('proiect gol, „nu mai întreba” și „mai târziu” nu se amintesc; după amânare, din nou', () => {
    expect(shouldRemind({ ...base, hasContent: false })).toBe(false);
    expect(shouldRemind({ ...base, record: { never: true } })).toBe(false);
    expect(shouldRemind({ ...base, record: { snoozedUntil: iso(now + SNOOZE_DAYS * DAY) } })).toBe(
      false,
    );
    expect(shouldRemind({ ...base, record: { snoozedUntil: iso(now - 1) } })).toBe(true);
  });

  it('date invalide nu strică nimic (fără excepții, fără memento)', () => {
    expect(shouldRemind({ ...base, createdAt: 'nu-e-data' })).toBe(false);
    expect(shouldRemind({ ...base, updatedAt: '???' })).toBe(false);
    expect(parseSnapshot('123|{nu e json')).toEqual({ now: 123, record: null });
    expect(parseSnapshot(`5|${JSON.stringify({ never: true })}`)).toEqual({
      now: 5,
      record: { never: true },
    });
  });
});

describe('memento în editor', () => {
  async function open(record?: object) {
    const e = uiEnv();
    const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
    if (!r.ok) throw new Error('seed');
    if (record) localStorage.setItem(`rc:backup:${r.value.id}`, JSON.stringify(record));
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    return r.value.id;
  }
  // 30 de zile și 2 ore: ora curentă din instantaneu e rotunjită în jos la oră
  const old = () => ({ lastExportAt: iso(Date.now() - 30 * DAY - 2 * 60 * 60 * 1000) });

  it('copie veche și proiect modificat de atunci: apare mementoul cu numărul de zile', async () => {
    await open(old());
    const banner = await screen.findByTestId('backup-reminder');
    expect(banner.textContent).toMatch(/Ultima copie de siguranță are 30 de zile/);
    expect(banner.textContent).toMatch(/doar în acest browser/);
  });

  it('copie recentă: nu apare nimic', async () => {
    await open({ lastExportAt: iso(Date.now() - 1 * DAY) });
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
  });

  it('„Exportă copie acum” descarcă fișierul, notează data și ascunde mementoul', async () => {
    const id = await open(old());
    fireEvent.click(await screen.findByTestId('backup-reminder-export'));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toMatch(/\.roomcraft\.json$/);
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
    const last = readRecord(id)?.lastExportAt;
    expect(last).toBeTruthy();
    expect(Date.now() - Date.parse(last!)).toBeLessThan(60_000);
  });

  it('butonul „Exportă copie” din antet notează și el exportul (mementoul nu mai apare)', async () => {
    const id = await open(old());
    await screen.findByTestId('backup-reminder');
    fireEvent.click(screen.getByTestId('export-backup'));
    expect(readRecord(id)?.lastExportAt).toBeTruthy();
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
  });

  it('„Mai târziu” amână (se notează data), iar „Nu mai întreba” oprește definitiv pentru acest proiect', async () => {
    const id = await open(old());
    fireEvent.click(await screen.findByTestId('backup-reminder-later'));
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
    const snoozed = Date.parse(readRecord(id)!.snoozedUntil!);
    expect(snoozed - Date.now()).toBeGreaterThan((SNOOZE_DAYS - 0.1) * DAY);
    // „nu mai întreba”: pe un proiect cu mementoul activ
    localStorage.setItem(`rc:backup:${id}`, JSON.stringify(old()));
    act(() => {
      window.dispatchEvent(new Event('rc:backup-changed'));
    });
    fireEvent.click(await screen.findByTestId('backup-reminder-never'));
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
    expect(readRecord(id)?.never).toBe(true);
    expect(backupSnapshot(id)).toContain('"never":true');
  });
});
