// Integritatea unui document: referințe, geometrie, finisaje, buget. Folosită la import și înainte de calcule.
import { analyzeGeometry, type GeometryModel } from '../geometry';
import { finishConfigProblems } from '../quantities';
import type { ProjectDocument } from '../schema';

export type IssueSeverity = 'error' | 'warning';
export interface IntegrityIssue {
  severity: IssueSeverity;
  code: string;
  path: string;
  message: string;
}
export interface IntegrityReport {
  issues: IntegrityIssue[];
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
  valid: boolean;
  geometry: GeometryModel;
}

export function checkIntegrity(doc: ProjectDocument): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const err = (code: string, path: string, message: string) =>
    issues.push({ severity: 'error', code, path, message });
  const warn = (code: string, path: string, message: string) =>
    issues.push({ severity: 'warning', code, path, message });

  // cheia tabelului = id-ul entității
  const tables: Array<[string, Record<string, { id: string }>]> = [
    ['levels', doc.levels],
    ['nodes', doc.nodes],
    ['walls', doc.walls],
    ['openings', doc.openings],
    ['rooms', doc.rooms],
    ['objects', doc.objects],
    ['finishAssignments', doc.finishAssignments],
    ['budget.manualLines', doc.budget.manualLines],
  ];
  for (const [name, t] of tables)
    for (const [k, v] of Object.entries(t))
      if (v.id !== k) err('id-mismatch', `${name}.${k}`, `cheia „${k}” ≠ id „${v.id}”`);
  for (const [k, item] of Object.entries(doc.catalogSnapshot.items))
    if (item.id !== k) err('id-mismatch', `catalogSnapshot.items.${k}`, 'cheie ≠ id');
  for (const [k, f] of Object.entries(doc.catalogSnapshot.finishes))
    if (f.id !== k) err('id-mismatch', `catalogSnapshot.finishes.${k}`, 'cheie ≠ id');

  // niveluri
  const levelRef = (path: string, levelId: string) => {
    if (!doc.levels[levelId]) err('level-missing', path, `nivel inexistent: ${levelId}`);
  };
  for (const n of Object.values(doc.nodes)) levelRef(`nodes.${n.id}`, n.levelId);
  for (const w of Object.values(doc.walls)) levelRef(`walls.${w.id}`, w.levelId);
  for (const r of Object.values(doc.rooms)) levelRef(`rooms.${r.id}`, r.levelId);
  for (const o of Object.values(doc.objects)) levelRef(`objects.${o.id}`, o.levelId);

  // geometrie (coduri proprii)
  const geometry = analyzeGeometry(doc);
  for (const g of geometry.issues) err(g.code, g.path, g.message);

  // obiecte
  for (const o of Object.values(doc.objects)) {
    const item = doc.catalogSnapshot.items[o.catalogItemId];
    if (!item) {
      err(
        'catalog-item-missing',
        `objects.${o.id}`,
        `itemul „${o.catalogItemId}” lipsește din catalogSnapshot`,
      );
      continue;
    }
    const L = item.sizeLimits;
    const inside = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max;
    if (
      !inside(o.size.widthMm, L.widthMm) ||
      !inside(o.size.depthMm, L.depthMm) ||
      !inside(o.size.heightMm, L.heightMm)
    ) {
      err('object-size-limits', `objects.${o.id}`, 'dimensiuni în afara limitelor itemului');
    }
    if (o.wallId && !doc.walls[o.wallId])
      err('object-wall-missing', `objects.${o.id}`, `perete inexistent: ${o.wallId}`);
    const ref = item.reference;
    if (ref && ref.currency !== doc.settings.currency)
      err(
        'currency-mismatch',
        `objects.${o.id}`,
        `moneda itemului (${ref.currency}) ≠ moneda proiectului (${doc.settings.currency})`,
      );
    if (ref && ref.vatIncluded !== doc.settings.pricesIncludeVat)
      warn(
        'vat-mode-mismatch',
        `catalogSnapshot.items.${item.id}`,
        'modul TVA al prețului de catalog diferă de setarea proiectului (se aplică setarea proiectului)',
      );
  }

  // finisaje și atribuiri
  for (const f of Object.values(doc.catalogSnapshot.finishes)) {
    for (const p of finishConfigProblems(f))
      err('finish-config', `catalogSnapshot.finishes.${f.id}`, p);
  }
  const bandsByTarget = new Map<string, Array<{ id: string; from: number; to: number }>>();
  const floorsSeen = new Map<string, string>();
  for (const a of Object.values(doc.finishAssignments)) {
    if (!doc.catalogSnapshot.finishes[a.finishId])
      err(
        'finish-missing',
        `finishAssignments.${a.id}`,
        `finisajul „${a.finishId}” lipsește din catalogSnapshot`,
      );
    if (a.target.kind === 'roomFloor') {
      if (!doc.rooms[a.target.roomId])
        err('assignment-room-missing', `finishAssignments.${a.id}`, 'cameră inexistentă');
      const prev = floorsSeen.get(a.target.roomId);
      if (prev)
        err(
          'floor-assigned-twice',
          `finishAssignments.${a.id}`,
          `podeaua camerei are deja finisaj (${prev})`,
        );
      else floorsSeen.set(a.target.roomId, a.id);
    } else {
      const wall = doc.walls[a.target.wallId];
      if (!wall) {
        err('assignment-wall-missing', `finishAssignments.${a.id}`, 'perete inexistent');
        continue;
      }
      const from = a.fromHeightMm ?? 0;
      const to = Math.min(from + (a.coveredHeightMm ?? wall.heightMm - from), wall.heightMm);
      if (from >= wall.heightMm || to <= from)
        err(
          'assignment-band-invalid',
          `finishAssignments.${a.id}`,
          'banda de înălțime este în afara peretelui',
        );
      const key = `${a.target.wallId}:${a.target.side}`;
      const list = bandsByTarget.get(key) ?? [];
      for (const other of list)
        if (from < other.to && other.from < to)
          err(
            'assignment-band-overlap',
            `finishAssignments.${a.id}`,
            `banda se suprapune cu ${other.id}`,
          );
      list.push({ id: a.id, from, to });
      bandsByTarget.set(key, list);
    }
  }

  // buget
  const usedFinishes = new Set(Object.values(doc.finishAssignments).map((a) => a.finishId));
  for (const key of Object.keys(doc.budget.overrides)) {
    const i = key.indexOf(':');
    const kind = i < 0 ? '' : key.slice(0, i);
    const ref = i < 0 ? '' : key.slice(i + 1);
    if (kind === 'object' && doc.objects[ref]) continue;
    if (kind === 'finish' && usedFinishes.has(ref)) continue;
    err(
      'override-orphan',
      `budget.overrides.${key}`,
      'suprascriere fără sursă (obiect sau finisaj inexistent/nefolosit)',
    );
  }
  for (const l of Object.values(doc.budget.manualLines)) {
    const p = `budget.manualLines.${l.id}`;
    if (l.roomId && !doc.rooms[l.roomId]) err('manual-room-missing', p, 'cameră inexistentă');
    const b = l.binding;
    if (b && 'roomId' in b && !doc.rooms[b.roomId])
      err('binding-room-missing', p, 'binding: cameră inexistentă');
    if (b?.kind === 'assignmentArea' && !doc.finishAssignments[b.assignmentId])
      err('binding-assignment-missing', p, 'binding: atribuire inexistentă');
  }

  // catalog nefolosit (informativ)
  const usedItems = new Set(Object.values(doc.objects).map((o) => o.catalogItemId));
  for (const id of Object.keys(doc.catalogSnapshot.items))
    if (!usedItems.has(id))
      warn('catalog-unused', `catalogSnapshot.items.${id}`, 'item neutilizat');
  for (const id of Object.keys(doc.catalogSnapshot.finishes))
    if (!usedFinishes.has(id))
      warn('catalog-unused', `catalogSnapshot.finishes.${id}`, 'finisaj neutilizat');

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    issues,
    errors,
    warnings: issues.filter((i) => i.severity === 'warning'),
    valid: errors.length === 0,
    geometry,
  };
}
