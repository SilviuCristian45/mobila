'use client';

import { useEffect, useState } from 'react';
import type { ProjectRuntime } from '@/lib/project-runtime/browser-runtime';
import type { StorageInfo } from '@/state/types';

const MB = 1024 * 1024;
const fmt = (bytes: number): string =>
  bytes >= 1024 * MB
    ? `${(bytes / (1024 * MB)).toFixed(1)} GB`
    : `${Math.max(0.1, bytes / MB).toFixed(1)} MB`;

/** Informații despre spațiul de stocare, dacă browserul le oferă. */
export function StorageFooter({ runtime }: { runtime: ProjectRuntime }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void runtime.storageInfo().then((i) => {
      if (!cancelled) setInfo(i);
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  if (!info || (info.usageBytes === null && info.persisted === null)) return null;
  return (
    <p className="mt-8 text-xs text-stone-500" data-testid="storage-info">
      {info.usageBytes !== null && info.quotaBytes !== null
        ? `Spațiu folosit: ${fmt(info.usageBytes)} din ${fmt(info.quotaBytes)}. `
        : null}
      {info.persisted === true
        ? 'Stocare persistentă: da.'
        : info.persisted === false
          ? 'Stocare persistentă: nu (browserul poate șterge datele dacă lipsește spațiul). Exportă periodic copii de siguranță.'
          : null}
    </p>
  );
}
