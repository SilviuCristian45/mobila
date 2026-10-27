// Export/import `.roomcraft.json` (ARCHITECTURE §7.5–7.7): format versionat, autonom, validat, cu migrări în lanț.
// Fără API-uri de platformă: lungimea în octeți și clonarea sunt implementate local; ID-urile noi vin din exterior.
import { checkIntegrity, type IntegrityIssue } from '../integrity';
import {
  CURRENT_VERSION,
  ProjectDocumentSchema,
  RoomcraftFileSchema,
  type ProjectDocument,
} from '../schema';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const FORMAT_ID = 'roomcraft';

/** Lungimea UTF-8 în octeți, fără `TextEncoder`. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Serializare deterministă: chei sortate recursiv; aceleași date ⇒ aceiași octeți. */
export function canonicalStringify(value: unknown, indent = 2): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sort(v)]),
          )
        : x;
  return JSON.stringify(sort(value), null, indent);
}

export function exportProject(
  doc: ProjectDocument,
  meta: { exportedAt: string; appVersion: string },
): string {
  return canonicalStringify({
    format: FORMAT_ID,
    formatVersion: doc.schemaVersion,
    exportedAt: meta.exportedAt,
    generator: { app: 'RoomCraft', version: meta.appVersion },
    project: doc,
    assets: [],
  });
}

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
/** `migrations[n]` migrează de la versiunea n la n+1. Nu există încă nicio versiune anterioară publicată. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function migrateToLatest(
  raw: Record<string, unknown>,
  from: number,
  target = CURRENT_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  let current = raw;
  for (let v = from; v < target; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`Lipsește migrarea v${v}→v${v + 1}`);
    current = { ...migrate(current), schemaVersion: v + 1 };
  }
  return current;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_JSON_DEPTH = 40;

/** Caută chei periculoase (`__proto__` etc.) sau adâncime excesivă în datele brute, înainte de validarea cu schema. */
export function findUnsafeStructure(value: unknown, path = '', depth = 0): string | null {
  if (depth > MAX_JSON_DEPTH) return `${path || '(rădăcină)'}: structură prea adâncă`;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = findUnsafeStructure(value[i], `${path}[${i}]`, depth + 1);
      if (r) return r;
    }
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path ? `${path}.` : ''}${key}: cheie interzisă`;
      const r = findUnsafeStructure(
        (value as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        depth + 1,
      );
      if (r) return r;
    }
  }
  return null;
}

export type ImportStage =
  'size' | 'parse' | 'envelope' | 'version' | 'migrate' | 'schema' | 'integrity' | 'remap';
export type ImportResult =
  | {
      ok: true;
      doc: ProjectDocument;
      warnings: IntegrityIssue[];
      migratedFrom?: number;
      remapped: boolean;
    }
  | { ok: false; stage: ImportStage; errors: string[] };

export interface ParseOptions {
  migrations?: Readonly<Record<number, Migration>>;
  currentVersion?: number;
}
export type ParseResult =
  | { ok: true; doc: ProjectDocument; warnings: IntegrityIssue[]; migratedFrom?: number }
  | {
      ok: false;
      stage: Exclude<ImportStage, 'size' | 'parse' | 'envelope' | 'remap'>;
      errors: string[];
    };

/**
 * Validează un document brut (din fișier sau din stocarea locală): structură sigură → versiune → migrare → schemă
 * strictă → integritate. Aceeași conductă pentru import și pentru încărcarea din IndexedDB.
 */
export function parseProjectDocument(project: unknown, options: ParseOptions = {}): ParseResult {
  const fail = (
    stage: Exclude<ImportStage, 'size' | 'parse' | 'envelope' | 'remap'>,
    ...errors: string[]
  ): ParseResult => ({ ok: false, stage, errors });
  const currentVersion = options.currentVersion ?? CURRENT_VERSION;
  if (project === null || typeof project !== 'object' || Array.isArray(project))
    return fail('schema', 'documentul nu e un obiect');
  const unsafe = findUnsafeStructure(project);
  if (unsafe) return fail('schema', unsafe);
  let raw = project as Record<string, unknown>;
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
    return fail('schema', 'schemaVersion lipsește sau e invalid');
  if (version > currentVersion)
    return fail(
      'version',
      `document creat cu o versiune mai nouă (v${version} > v${currentVersion})`,
    );
  let migratedFrom: number | undefined;
  if (version < currentVersion) {
    try {
      raw = migrateToLatest(raw, version, currentVersion, options.migrations);
      migratedFrom = version;
    } catch (e) {
      return fail('migrate', (e as Error).message);
    }
  }
  const parsed = ProjectDocumentSchema.safeParse(raw);
  if (!parsed.success)
    return fail(
      'schema',
      ...parsed.error.issues
        .slice(0, 25)
        .map((i) => `${i.path.join('.') || '(rădăcină)'}: ${i.message}`),
    );
  const report = checkIntegrity(parsed.data);
  if (!report.valid)
    return fail('integrity', ...report.errors.map((i) => `${i.path}: ${i.message} [${i.code}]`));
  return {
    ok: true,
    doc: parsed.data,
    warnings: report.warnings,
    ...(migratedFrom !== undefined ? { migratedFrom } : {}),
  };
}

export interface ImportOptions extends ParseOptions {
  /** ID-urile proiectelor existente; la conflict, importul devine copie nouă cu ID-uri regenerate. */
  existingIds?: ReadonlySet<string>;
  /** Generator de ID-uri valide (obligatoriu dacă poate apărea conflict). */
  genId?: () => string;
}

/**
 * Importul trată fișierul ca date nesigure: mărime → parse → plic → versiune → (structură → migrare → schemă → integritate).
 * Oprește la prima etapă eșuată, cu mesaje explicite; nu produce niciun efect.
 */
export function importProject(text: string, options: ImportOptions = {}): ImportResult {
  const fail = (stage: ImportStage, ...errors: string[]): ImportResult => ({
    ok: false,
    stage,
    errors,
  });
  const currentVersion = options.currentVersion ?? CURRENT_VERSION;
  if (utf8Length(text) > MAX_IMPORT_BYTES)
    return fail('size', 'fișierul depășește limita de mărime');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return fail('parse', `JSON invalid: ${(e as Error).message}`);
  }
  const envelope = RoomcraftFileSchema.safeParse(json);
  if (!envelope.success)
    return fail(
      'envelope',
      ...envelope.error.issues.map((i) => `${i.path.join('.') || '(rădăcină)'}: ${i.message}`),
    );
  const { formatVersion, project } = envelope.data;
  if (formatVersion > currentVersion)
    return fail(
      'version',
      `fișier creat cu o versiune mai nouă (v${formatVersion} > v${currentVersion})`,
    );
  if (
    formatVersion < 0 ||
    project === null ||
    typeof project !== 'object' ||
    Array.isArray(project)
  )
    return fail('envelope', '`project` lipsește sau nu e obiect');
  const r = parseProjectDocument(project, options);
  if (!r.ok) return r;
  let doc = r.doc;
  let remapped = false;
  if (options.existingIds?.has(doc.id)) {
    if (!options.genId)
      return fail('remap', 'ID de proiect existent și nu s-a furnizat generator de ID-uri');
    try {
      doc = remapIds(doc, options.genId);
    } catch (e) {
      return fail('remap', (e as Error).message);
    }
    const check = ProjectDocumentSchema.safeParse(doc);
    if (!check.success || !checkIntegrity(doc).valid)
      return fail(
        'remap',
        'documentul remapat este invalid (generatorul de ID-uri a produs valori nevalide sau duplicate)',
      );
    remapped = true;
  }
  return {
    ok: true,
    doc,
    warnings: r.warnings,
    ...(r.migratedFrom !== undefined ? { migratedFrom: r.migratedFrom } : {}),
    remapped,
  };
}

/**
 * Copie cu toate ID-urile regenerate și toate referințele rescrise, inclusiv cheile `object:<id>` din buget.
 * Cheile de catalog (`catalogSnapshot`, `finish:<finishId>`) NU se remapează: sunt identificatori de catalog, nu de proiect.
 */
export function remapIds(doc: ProjectDocument, genId: () => string): ProjectDocument {
  const map = new Map<string, string>();
  const used = new Set<string>();
  const m = (old: string): string => {
    let v = map.get(old);
    if (v === undefined) {
      v = genId();
      if (used.has(v)) throw new Error(`Generatorul de ID-uri a produs un duplicat: ${v}`);
      used.add(v);
      map.set(old, v);
    }
    return v;
  };
  const remapTable = <T extends { id: string }>(
    t: Record<string, T>,
    fix: (x: T) => T,
  ): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const key of Object.keys(t).sort()) {
      const x = t[key]!;
      const y = fix({ ...x, id: m(x.id) });
      out[y.id] = y;
    }
    return out;
  };
  const out: ProjectDocument = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
  out.id = m(doc.id);
  out.levels = remapTable(doc.levels, (x) => x);
  out.nodes = remapTable(doc.nodes, (x) => ({ ...x, levelId: m(x.levelId) }));
  out.walls = remapTable(doc.walls, (x) => ({
    ...x,
    levelId: m(x.levelId),
    startNodeId: m(x.startNodeId),
    endNodeId: m(x.endNodeId),
  }));
  out.openings = remapTable(doc.openings, (x) => ({ ...x, wallId: m(x.wallId) }));
  out.rooms = remapTable(doc.rooms, (x) => ({
    ...x,
    levelId: m(x.levelId),
    nodeLoop: x.nodeLoop.map(m),
  }));
  out.objects = remapTable(doc.objects, (x) => ({
    ...x,
    levelId: m(x.levelId),
    ...(x.wallId ? { wallId: m(x.wallId) } : {}),
  }));
  out.finishAssignments = remapTable(doc.finishAssignments, (x) => ({
    ...x,
    target:
      x.target.kind === 'roomFloor'
        ? { ...x.target, roomId: m(x.target.roomId) }
        : { ...x.target, wallId: m(x.target.wallId) },
  }));
  out.budget.overrides = {};
  for (const key of Object.keys(doc.budget.overrides).sort()) {
    const i = key.indexOf(':');
    const kind = key.slice(0, i);
    const ref = key.slice(i + 1);
    out.budget.overrides[kind === 'object' ? `object:${m(ref)}` : key] = doc.budget.overrides[key]!;
  }
  out.budget.manualLines = remapTable(doc.budget.manualLines, (x) => {
    const { binding, roomId, ...rest } = x;
    return {
      ...rest,
      ...(roomId !== undefined ? { roomId: roomId === null ? null : m(roomId) } : {}),
      ...(binding
        ? {
            binding:
              binding.kind === 'assignmentArea'
                ? { ...binding, assignmentId: m(binding.assignmentId) }
                : { ...binding, roomId: m(binding.roomId) },
          }
        : {}),
    };
  });
  return out;
}
