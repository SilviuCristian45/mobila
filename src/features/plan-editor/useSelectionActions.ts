// Ștergerea și duplicarea elementului (sau grupului) selectat din plan: confirmări cu impactul ștergerii, un singur pas de undo
// pentru fiecare acțiune. Mutat din `PlanEditor.tsx` fără schimbări de comportament (audit F-16).
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  duplicateObjects,
  removeObjects,
  removeOpening,
  removeRoom,
  removeWall,
  roomDeletionImpact,
  roomOwnWalls,
  wallDeletionImpact,
  type ProjectDocument,
  type Result,
} from '@/domain';
import type { Confirm } from './editorSupport';
import type { RunEdit } from './PropertiesPanel';
import type { Notice, Selection } from './types';

export interface SelectionActionsContext {
  doc: ProjectDocument;
  editable: boolean;
  selection: Selection;
  setSelection: (s: Selection) => void;
  selectedObjectId: string | null;
  groupIds: string[];
  onSelectObject?: (id: string | null) => void;
  setExtraIds: (ids: string[], owner: string | null) => void;
  genId: () => string;
  run: RunEdit;
  runNotice: (label: string, op: (d: ProjectDocument) => Result<ProjectDocument>) => boolean;
  setConfirm: Dispatch<SetStateAction<Confirm | null>>;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
}

export function useSelectionActions(ctx: SelectionActionsContext): {
  deleteSelected: () => void;
  duplicateSelected: () => void;
} {
  const {
    doc,
    editable,
    selection,
    setSelection,
    selectedObjectId,
    groupIds,
    onSelectObject,
    setExtraIds,
    genId,
    run,
    runNotice,
    setConfirm,
    setNotice,
  } = ctx;
  const deleteSelected = useCallback(() => {
    if (!editable) return;
    if (selectedObjectId) {
      const ids = groupIds;
      const label = ids.length > 1 ? `Șterge ${ids.length} obiecte` : 'Șterge obiect';
      if (runNotice(label, (d) => removeObjects(d, ids))) {
        onSelectObject?.(null);
        setExtraIds([], null);
      }
      return;
    }
    if (!selection) return;
    if (selection.kind === 'node') {
      setNotice({
        tone: 'info',
        text: 'Un nod dispare singur când ștergi ultimul perete care îl folosește.',
      });
      return;
    }
    const { id } = selection;
    if (selection.kind === 'opening') {
      if (runNotice('Șterge gol', (d) => removeOpening(d, id))) setSelection(null);
      return;
    }
    if (selection.kind === 'wall') {
      const impact = wallDeletionImpact(doc, id);
      if (impact.rooms.length === 0) {
        if (runNotice('Șterge perete', (d) => removeWall(d, id))) setSelection(null);
        return;
      }
      const parts = [
        `camerele: ${impact.rooms.map((r) => r.name).join(', ')}`,
        impact.openings.length > 0 ? `${impact.openings.length} goluri` : null,
        impact.assignmentIds.length > 0 ? `${impact.assignmentIds.length} finisaje` : null,
      ].filter(Boolean);
      setConfirm({
        title: 'Ștergi peretele și camerele lui?',
        description: `Peretele face parte din ${impact.rooms.length === 1 ? 'o cameră' : 'mai multe camere'}, care nu mai pot exista fără el. Se șterg: ${parts.join('; ')}. Poți anula cu Ctrl+Z.`,
        label: 'Șterge',
        action: () => {
          const err = run('Șterge perete și camere', (d) =>
            removeWall(d, id, { removeRooms: true }),
          );
          if (!err) setSelection(null);
          return err;
        },
      });
      return;
    }
    const impact = roomDeletionImpact(doc, id);
    const own = roomOwnWalls(doc, id);
    const finishes =
      impact.assignmentIds.length > 0
        ? ` Se șterg și ${impact.assignmentIds.length} finisaje atribuite camerei.`
        : '';
    const finish = (withWalls: boolean) => () => {
      const err = run(withWalls ? 'Șterge camera și pereții' : 'Șterge cameră', (d) =>
        removeRoom(d, id, { withWalls }),
      );
      if (!err) setSelection(null);
      return err;
    };
    if (own.length === 0) {
      // toți pereții camerei sunt comuni cu alte camere: rămân vecinilor
      setConfirm({
        title: 'Ștergi camera?',
        description: `Pereții rămân în plan (sunt folosiți de camerele vecine).${finishes} Poți anula cu Ctrl+Z.`,
        label: 'Șterge camera',
        action: finish(false),
      });
      return;
    }
    const shared = (doc.rooms[id]?.nodeLoop.length ?? 0) - own.length;
    setConfirm({
      title: 'Ștergi camera?',
      description: `Se șterg camera și ${own.length} ${own.length === 1 ? 'perete al ei' : 'pereți ai ei'} (cu golurile lor)${shared > 0 ? `; ${shared} ${shared === 1 ? 'perete comun cu o cameră vecină rămâne' : 'pereți comuni cu camere vecine rămân'}` : ''}.${finishes} Poți alege să ștergi doar camera. Poți anula cu Ctrl+Z.`,
      label: 'Șterge camera și pereții',
      action: finish(true),
      secondary: { label: 'Doar camera', action: finish(false) },
    });
  }, [
    setConfirm,
    setNotice,
    setSelection,
    selection,
    selectedObjectId,
    groupIds,
    onSelectObject,
    setExtraIds,
    editable,
    doc,
    run,
    runNotice,
  ]);

  const duplicateSelected = useCallback(() => {
    if (!editable || !selectedObjectId) return;
    const src = groupIds;
    let created: string[] = [];
    const ok = runNotice(
      src.length > 1 ? `Duplică ${src.length} obiecte` : 'Duplică obiect',
      (d) => {
        const r = duplicateObjects(d, src, genId);
        if (!r.ok) return r;
        created = r.value.objectIds;
        return { ok: true, value: r.value.doc };
      },
    );
    if (ok && created.length > 0) {
      onSelectObject?.(created[0]!);
      setExtraIds(created.slice(1), created[0]!);
    }
  }, [editable, selectedObjectId, groupIds, runNotice, genId, onSelectObject, setExtraIds]);

  return { deleteSelected, duplicateSelected };
}
