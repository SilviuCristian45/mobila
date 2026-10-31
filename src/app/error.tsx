'use client';

import { useEffect } from 'react';
import { dashboardHref } from '@/lib/asset';
import { Button, buttonClass } from '@/ui/Button';
import { Alert } from '@/ui/feedback';

/**
 * Graniță de erori a rutelor (dashboard, editor): prinde o excepție de randare care nu a fost izolată mai jos și o
 * explică în loc de ecranul alb. Compatibilă cu exportul static (componentă client). Mesajul și stack trace-ul
 * excepției nu se afișează; ajung doar în consola dezvoltatorului. Datele nu sunt atinse: sesiunea editorului se
 * închide la demontare (salvând ce se poate), iar „Încearcă din nou” redeschide proiectul din stocare.
 */
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[RoomCraft] eroare neprinsă în rută', error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-4 py-10">
      <Alert tone="error" title="A apărut o eroare neașteptată" testId="route-error">
        <p>
          Pagina nu a putut fi afișată. Proiectele tale rămân salvate pe acest dispozitiv; ce era
          deja salvat nu a fost șters. Încearcă din nou sau revino la lista de proiecte.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={reset} data-testid="route-error-retry">
            Încearcă din nou
          </Button>
          <a
            className={buttonClass('secondary')}
            href={dashboardHref()}
            data-testid="route-error-home"
          >
            ← Înapoi la proiecte
          </a>
        </div>
      </Alert>
    </main>
  );
}
