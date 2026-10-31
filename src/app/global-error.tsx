'use client';

import { useEffect } from 'react';
import { dashboardHref } from '@/lib/asset';
import { Button, buttonClass } from '@/ui/Button';
import { Alert } from '@/ui/feedback';
import './globals.css';

/**
 * Ultima plasă: înlocuiește layout-ul rădăcină când acesta însuși eșuează. Trebuie să-și definească `<html>` și
 * `<body>`. La fel ca `error.tsx`, nu afișează mesajul sau stack trace-ul excepției.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[RoomCraft] eroare neprinsă în layout', error);
  }, [error]);
  return (
    <html lang="ro">
      <body className="bg-stone-50 text-stone-900 antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-4 py-10">
          <Alert tone="error" title="Aplicația a întâmpinat o eroare gravă" testId="global-error">
            <p>
              Interfața nu a putut fi afișată. Datele salvate pe acest dispozitiv nu au fost șterse.
              Reîncarcă aplicația sau încearcă din nou.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={reset} data-testid="global-error-retry">
                Încearcă din nou
              </Button>
              <a
                className={buttonClass('secondary')}
                href={dashboardHref()}
                data-testid="global-error-home"
              >
                ← Înapoi la proiecte
              </a>
            </div>
          </Alert>
        </main>
      </body>
    </html>
  );
}
