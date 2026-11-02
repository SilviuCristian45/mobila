// Memento periodic pentru copia de siguranță (ROADMAP, Etapa 8): proiectele trăiesc doar în browser, deci un export din când în
// când e singura protecție la ștergerea datelor site-ului. Starea (când s-a exportat ultima oară, „mai târziu”, „nu mai
// întreba”) e per proiect, în `localStorage`, și nu intră în documentul proiectului. Logica de decizie e pură.

export const REMIND_AFTER_DAYS = 7;
export const SNOOZE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupRecord {
  /** Ultima descărcare a unei copii de siguranță (ISO). */
  lastExportAt?: string;
  /** „Mai târziu”: nu se mai întreabă până la această dată (ISO). */
  snoozedUntil?: string;
  /** „Nu mai întreba pentru acest proiect”. */
  never?: boolean;
}

export interface ReminderInput {
  /** Momentul curent (ms). */
  now: number;
  createdAt: string;
  updatedAt: string;
  /** Proiectul are conținut (camere, pereți sau obiecte)? Un proiect gol nu merită o copie. */
  hasContent: boolean;
  record: BackupRecord | null;
}

const time = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Zile întregi de la ultima copie de siguranță (sau de la crearea proiectului, dacă nu s-a exportat niciodată). */
export function daysSinceBackup(input: ReminderInput): number {
  const baseline = time(input.record?.lastExportAt) ?? time(input.createdAt) ?? input.now;
  return Math.max(0, Math.floor((input.now - baseline) / DAY_MS));
}

/**
 * Se afișează mementoul? Da, dacă proiectul are conținut, a fost modificat de la ultima copie (sau de la creare), au trecut
 * cel puțin `REMIND_AFTER_DAYS` zile și utilizatorul nu a amânat sau refuzat.
 */
export function shouldRemind(input: ReminderInput): boolean {
  const { record } = input;
  if (!input.hasContent || record?.never) return false;
  const baseline = time(record?.lastExportAt) ?? time(input.createdAt);
  if (baseline === null) return false;
  const updated = time(input.updatedAt);
  if (updated === null || updated <= baseline) return false; // nimic nou de salvat
  if (input.now - baseline < REMIND_AFTER_DAYS * DAY_MS) return false;
  const snoozed = time(record?.snoozedUntil);
  return !(snoozed !== null && input.now < snoozed);
}

// ───────────── stocare locală (tolerantă la lipsa ei) ─────────────
const keyOf = (projectId: string): string => `rc:backup:${projectId}`;
const EVENT = 'rc:backup-changed';
const HOUR_MS = 60 * 60 * 1000;

export function readRecord(projectId: string): BackupRecord | null {
  try {
    const raw = localStorage.getItem(keyOf(projectId));
    return raw ? (JSON.parse(raw) as BackupRecord) : null;
  } catch {
    return null;
  }
}

/** Îmbină `patch` în înregistrarea proiectului și anunță abonații (același tab). */
export function writeRecord(projectId: string, patch: BackupRecord): void {
  try {
    localStorage.setItem(keyOf(projectId), JSON.stringify({ ...readRecord(projectId), ...patch }));
  } catch {
    /* fără stocare: mementoul rămâne valabil doar în această sesiune (se va reafișa) */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export const recordExport = (projectId: string, now: Date = new Date()): void =>
  writeRecord(projectId, { lastExportAt: now.toISOString(), snoozedUntil: undefined });
export const snoozeReminder = (projectId: string, now: Date = new Date()): void =>
  writeRecord(projectId, {
    snoozedUntil: new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString(),
  });
export const neverRemind = (projectId: string): void => writeRecord(projectId, { never: true });

export function subscribeBackup(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Instantaneu pentru `useSyncExternalStore`: înregistrarea (text) + ora curentă (rotunjită la oră, ca să nu se schimbe la
 * fiecare citire). Începe cu ora, apoi înregistrarea.
 */
export function backupSnapshot(projectId: string): string {
  let raw = '';
  try {
    raw = localStorage.getItem(keyOf(projectId)) ?? '';
  } catch {
    raw = '';
  }
  return `${Math.floor(Date.now() / HOUR_MS) * HOUR_MS}|${raw}`;
}

/** Descompune instantaneul în (momentul curent, înregistrare). */
export function parseSnapshot(snapshot: string): { now: number; record: BackupRecord | null } {
  const i = snapshot.indexOf('|');
  const now = Number(snapshot.slice(0, i));
  const raw = snapshot.slice(i + 1);
  let record: BackupRecord | null = null;
  try {
    record = raw ? (JSON.parse(raw) as BackupRecord) : null;
  } catch {
    record = null;
  }
  return { now, record };
}
