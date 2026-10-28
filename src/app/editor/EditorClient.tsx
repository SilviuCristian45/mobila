'use client';

import { EditorShell } from '@/features/editor-shell/EditorShell';
import { PlanEditor } from '@/features/plan-editor/PlanEditor';

/** Compoziția rutei editorului: carcasa sesiunii + editorul 2D (modulele din features/ nu se importă între ele). */
export function EditorClient() {
  return (
    <EditorShell workspace={(session, state) => <PlanEditor session={session} state={state} />} />
  );
}
