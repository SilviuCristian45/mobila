import type { StorageInfo } from './types';

export type { StorageInfo };

// Informații despre spațiul de stocare și cererea de persistență (ARCHITECTURE §7.3). Primește `navigator.storage` din exterior.
export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

/**
 * Cere stocare persistentă; nu aruncă și nu blochează: în Firefox, `persist()` poate rămâne în așteptare (cerere de
 * permisiune către utilizator) — constatat în teste —, deci rezultatul se limitează în timp (implicit 3 s → `false`).
 */
export async function requestPersistentStorage(
  storage: StorageManagerLike | undefined,
  timeoutMs = 3000,
): Promise<boolean> {
  if (!storage?.persist) return false;
  const attempt = (async () => {
    try {
      if (storage.persisted && (await storage.persisted())) return true;
      return await storage.persist!();
    } catch {
      return false;
    }
  })();
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([attempt, timeout]);
}

export async function getStorageInfo(
  storage: StorageManagerLike | undefined,
  timeoutMs = 3000,
): Promise<StorageInfo> {
  const info: StorageInfo = { persisted: null, usageBytes: null, quotaBytes: null };
  const limited = <T>(p: Promise<T>): Promise<T | undefined> =>
    Promise.race([
      p,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
  try {
    if (storage?.persisted) info.persisted = (await limited(storage.persisted())) ?? null;
    const est = storage?.estimate ? await limited(storage.estimate()) : undefined;
    info.usageBytes = est?.usage ?? null;
    info.quotaBytes = est?.quota ?? null;
  } catch {
    /* informativ: ignorăm */
  }
  return info;
}
