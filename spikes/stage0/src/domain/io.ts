// SPIKE — export/import `.roomcraft.json`, migrări în lanț, integritate referențială, remapare ID-uri (ARCHITECTURE §7).
import { CURRENT_VERSION, ProjectDocumentSchema, RoomcraftFileSchema, type ProjectDocument } from './schema';
import { computeJoins, findWall, interiorPolygon, isSimplePolygon, polygonArea, validateOpenings } from './geometry';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const APP_VERSION = '0.0.0-spike';

/** Serializare deterministă: chei sortate recursiv. */
export function canonicalStringify(v: unknown, indent = 2): string {
  const sort = (x: unknown): unknown => Array.isArray(x) ? x.map(sort)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as object).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, sort(val)])) : x;
  return JSON.stringify(sort(v), null, indent);
}

export function exportProject(doc: ProjectDocument, now = new Date().toISOString()): string {
  return canonicalStringify({ format: 'roomcraft', formatVersion: doc.schemaVersion, exportedAt: now, generator: { app: 'RoomCraft', version: APP_VERSION }, project: doc, assets: [] });
}

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
/** migrations[n] migrează de la versiunea n la n+1. v0 este o versiune sintetică de test (cheie `vat` în loc de `defaultVatBp`). */
export const defaultMigrations: Record<number, Migration> = {
  0: (raw) => {
    const s = { ...(raw.settings as Record<string, unknown>) };
    s.defaultVatBp = Math.round(Number(s.vat) * 100); delete s.vat;
    return { ...raw, settings: s, schemaVersion: 1 };
  },
};
export function migrateToLatest(raw: Record<string, unknown>, from: number, target = CURRENT_VERSION, migrations = defaultMigrations): Record<string, unknown> {
  let cur = raw;
  for (let v = from; v < target; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`Lipsește migrarea v${v}→v${v + 1}`);
    cur = m(cur); cur.schemaVersion = v + 1;
  }
  return cur;
}

export interface IntegrityIssue { path: string; message: string }
export function checkIntegrity(doc: ProjectDocument): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  if (Object.keys(doc.levels).length !== 1) add('levels', 'MVP cere exact un nivel');
  for (const [id, n] of Object.entries(doc.nodes)) if (!doc.levels[n.levelId]) add(`nodes.${id}`, 'levelId inexistent');
  const seenPairs = new Set<string>();
  for (const w of Object.values(doc.walls)) {
    if (!doc.nodes[w.startNodeId] || !doc.nodes[w.endNodeId]) { add(`walls.${w.id}`, 'nod inexistent'); continue; }
    if (w.startNodeId === w.endNodeId) add(`walls.${w.id}`, 'start = end');
    const k = [w.startNodeId, w.endNodeId].sort().join('|');
    if (seenPairs.has(k)) add(`walls.${w.id}`, 'perete duplicat'); seenPairs.add(k);
  }
  if (out.length) return out; // geometria cere structura de bază validă
  for (const r of Object.values(doc.rooms)) {
    let ok = true;
    r.nodeLoop.forEach((nid, i) => {
      if (!doc.nodes[nid]) { add(`rooms.${r.id}`, `nod inexistent ${nid}`); ok = false; return; }
      const nx = r.nodeLoop[(i + 1) % r.nodeLoop.length]!;
      if (doc.nodes[nx] && !findWall(doc, nid, nx)) { add(`rooms.${r.id}`, `lipsește peretele ${nid}–${nx}`); ok = false; }
    });
    if (new Set(r.nodeLoop).size !== r.nodeLoop.length) { add(`rooms.${r.id}`, 'noduri repetate'); ok = false; }
    if (ok) {
      const poly = interiorPolygon(doc, r.id);
      if (!isSimplePolygon(poly) || polygonArea(poly) <= 0) add(`rooms.${r.id}`, 'poligon interior invalid');
    }
  }
  const joins = computeJoins(doc);
  for (const o of Object.values(doc.openings)) {
    if (!doc.walls[o.wallId]) { add(`openings.${o.id}`, 'perete inexistent'); continue; }
  }
  for (const wid of Object.keys(doc.walls)) for (const i of validateOpenings(doc, joins, wid)) add(`openings.${i.openingId}`, `gol invalid: ${i.code}`);
  for (const o of Object.values(doc.objects)) {
    const item = doc.catalogSnapshot.items[o.catalogItemId];
    if (!item) { add(`objects.${o.id}`, `catalogItemId lipsă din catalogSnapshot: ${o.catalogItemId}`); continue; }
    const L = item.sizeLimits;
    if (o.size.widthMm < L.widthMm.min || o.size.widthMm > L.widthMm.max || o.size.depthMm < L.depthMm.min || o.size.depthMm > L.depthMm.max || o.size.heightMm < L.heightMm.min || o.size.heightMm > L.heightMm.max) add(`objects.${o.id}`, 'dimensiuni în afara limitelor itemului');
  }
  for (const a of Object.values(doc.finishAssignments)) {
    if (!doc.catalogSnapshot.finishes[a.finishId]) add(`finishAssignments.${a.id}`, `finishId lipsă din catalogSnapshot: ${a.finishId}`);
    if (a.target.kind === 'roomFloor' && !doc.rooms[a.target.roomId]) add(`finishAssignments.${a.id}`, 'cameră inexistentă');
    if (a.target.kind === 'wallSide' && !doc.walls[a.target.wallId]) add(`finishAssignments.${a.id}`, 'perete inexistent');
  }
  const sources = new Set([...Object.keys(doc.objects).map((i) => `object:${i}`), ...new Set(Object.values(doc.finishAssignments).map((a) => `finish:${a.finishId}`))]);
  for (const k of Object.keys(doc.budget.overrides)) if (!sources.has(k)) add(`budget.overrides.${k}`, 'suprascriere orfană (sursa nu există)');
  for (const l of Object.values(doc.budget.manualLines)) {
    if (l.roomId && !doc.rooms[l.roomId]) add(`budget.manualLines.${l.id}`, 'cameră inexistentă');
    const b = l.binding;
    if (b && 'roomId' in b && !doc.rooms[b.roomId]) add(`budget.manualLines.${l.id}`, 'binding: cameră inexistentă');
    if (b && b.kind === 'assignmentArea' && !doc.finishAssignments[b.assignmentId]) add(`budget.manualLines.${l.id}`, 'binding: atribuire inexistentă');
  }
  return out;
}

export type ImportResult = { ok: true; doc: ProjectDocument; warnings: string[]; migratedFrom?: number; remapped: boolean } | { ok: false; stage: string; errors: string[] };

export function importProject(text: string, opts: { existingIds?: Set<string>; genId?: () => string; migrations?: Record<number, Migration> } = {}): ImportResult {
  const fail = (stage: string, ...errors: string[]): ImportResult => ({ ok: false, stage, errors });
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return fail('size', 'Fișierul depășește limita de mărime');
  let json: unknown;
  try { json = JSON.parse(text); } catch (e) { return fail('parse', `JSON invalid: ${(e as Error).message}`); }
  const env = RoomcraftFileSchema.safeParse(json);
  if (!env.success) return fail('envelope', ...env.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const { formatVersion } = env.data;
  if (formatVersion > CURRENT_VERSION) return fail('version', `Fișier creat cu o versiune mai nouă (v${formatVersion} > v${CURRENT_VERSION})`);
  if (formatVersion < 0 || !env.data.project || typeof env.data.project !== 'object') return fail('envelope', 'project lipsește');
  let raw = env.data.project as Record<string, unknown>;
  let migratedFrom: number | undefined;
  try {
    if (formatVersion < CURRENT_VERSION) { raw = migrateToLatest(raw, formatVersion, CURRENT_VERSION, opts.migrations ?? defaultMigrations); migratedFrom = formatVersion; }
  } catch (e) { return fail('migrate', (e as Error).message); }
  const parsed = ProjectDocumentSchema.safeParse(raw);
  if (!parsed.success) return fail('schema', ...parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`));
  let doc = parsed.data;
  let issues: IntegrityIssue[];
  try { issues = checkIntegrity(doc); } catch (e) { return fail('integrity', `Eroare la verificare: ${(e as Error).message}`); }
  if (issues.length) return fail('integrity', ...issues.map((i) => `${i.path}: ${i.message}`));
  let remapped = false;
  if (opts.existingIds?.has(doc.id)) { doc = remapIds(doc, opts.genId ?? (() => crypto.randomUUID())); remapped = true; }
  return { ok: true, doc, warnings: [], migratedFrom, remapped };
}

/** Regenerează toate ID-urile (copie nouă) și rescrie TOATE referințele, inclusiv cheile `object:<id>`/`finish:` din buget. */
export function remapIds(doc: ProjectDocument, genId: () => string): ProjectDocument {
  const map = new Map<string, string>();
  const m = (id: string) => { let v = map.get(id); if (!v) { v = genId(); map.set(id, v); } return v; };
  const rec = <T extends { id: string }>(t: Record<string, T>, f: (x: T) => T): Record<string, T> =>
    Object.fromEntries(Object.values(t).map((x) => { const y = f({ ...x, id: m(x.id) }); return [y.id, y]; }));
  const out: ProjectDocument = structuredClone(doc);
  out.id = genId();
  out.levels = rec(doc.levels, (x) => x);
  out.nodes = rec(doc.nodes, (x) => ({ ...x, levelId: m(x.levelId) }));
  out.walls = rec(doc.walls, (x) => ({ ...x, levelId: m(x.levelId), startNodeId: m(x.startNodeId), endNodeId: m(x.endNodeId) }));
  out.openings = rec(doc.openings, (x) => ({ ...x, wallId: m(x.wallId) }));
  out.rooms = rec(doc.rooms, (x) => ({ ...x, levelId: m(x.levelId), nodeLoop: x.nodeLoop.map(m) }));
  out.objects = rec(doc.objects, (x) => ({ ...x, levelId: m(x.levelId) }));
  out.finishAssignments = rec(doc.finishAssignments, (x) => ({
    ...x, target: x.target.kind === 'roomFloor' ? { ...x.target, roomId: m(x.target.roomId) } : { ...x.target, wallId: m(x.target.wallId) },
  }));
  out.budget.overrides = Object.fromEntries(Object.entries(doc.budget.overrides).map(([k, v]) => {
    const [kind, ref] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    return [kind === 'object' ? `object:${m(ref)}` : k, v]; // finish:<finishId> referă catalogul din snapshot — cheie stabilă, nu se remapează
  }));
  out.budget.manualLines = rec(doc.budget.manualLines, (x) => ({
    ...x, roomId: x.roomId ? m(x.roomId) : x.roomId,
    binding: !x.binding ? undefined : x.binding.kind === 'assignmentArea' ? { ...x.binding, assignmentId: m(x.binding.assignmentId) } : { ...x.binding, roomId: m(x.binding.roomId) },
  }));
  return out;
}
