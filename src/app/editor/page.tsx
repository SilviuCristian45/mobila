import { Suspense } from 'react';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { ProjectProvider } from '@/lib/project-runtime/ProjectProvider';
import { Spinner } from '@/ui/feedback';

// `useSearchParams` într-o pagină statică cere o graniță Suspense (ARCHITECTURE §13, I3).
export default function EditorPage() {
  return (
    <ProjectProvider>
      <Suspense
        fallback={
          <main className="mx-auto max-w-xl px-4 py-10" data-testid="suspense-fallback">
            <Spinner label="Se încarcă editorul…" />
          </main>
        }
      >
        <EditorShell />
      </Suspense>
    </ProjectProvider>
  );
}
