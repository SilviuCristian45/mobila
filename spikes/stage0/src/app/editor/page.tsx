import { Suspense } from 'react';
import EditorClient from '@/features/EditorClient';

// I3: useSearchParams în pagină statică cere Suspense.
export default function EditorPage() {
  return (
    <Suspense fallback={<p data-testid="suspense-fallback">Se încarcă editorul…</p>}>
      <EditorClient />
    </Suspense>
  );
}
