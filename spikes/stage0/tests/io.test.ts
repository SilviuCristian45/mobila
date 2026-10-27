import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { computeBudget } from '@/domain/budget';
import { builtinCatalog, setBuiltinCatalog } from '@/domain/catalog';
import { referenceProject } from '@/domain/fixtures';
import { canonicalStringify, checkIntegrity, exportProject, importProject, migrateToLatest, remapIds } from '@/domain/io';
import { buildScene, geometrySignature } from '@/domain/scene';

const saved = builtinCatalog;
afterEach(() => setBuiltinCatalog(saved));
const NOW = '2026-10-27T12:00:00.000Z';
const ok = (r: ReturnType<typeof importProject>) => { if (!r.ok) throw new Error(`${r.stage}: ${r.errors.join('; ')}`); return r; };

describe('round-trip și autonomie (D11)', () => {
  it('referința e validă din start', () => { expect(checkIntegrity(referenceProject())).toEqual([]); });

  it('export → import → export: octeți identici, document egal', () => {
    const doc = referenceProject();
    const t1 = exportProject(doc, NOW);
    const r = ok(importProject(t1));
    expect(r.doc).toEqual(doc);
    expect(exportProject(r.doc, NOW)).toBe(t1);
    expect(exportProject(doc, NOW)).toBe(t1); // determinism
  });

  it('catalog încorporat GOL: aceeași scenă (hash) și același buget', () => {
    const doc = referenceProject();
    const text = exportProject(doc, NOW);
    const sceneBefore = buildScene(doc), budgetBefore = computeBudget(doc);
    setBuiltinCatalog({ items: {}, finishes: {} });
    const r = ok(importProject(text));
    const sceneAfter = buildScene(r.doc), budgetAfter = computeBudget(r.doc);
    expect(sceneAfter.hash).toBe(sceneBefore.hash);
    expect(budgetAfter).toEqual(budgetBefore);
    expect(budgetAfter.total.grossMinor).toBe(456708);
    expect(sceneAfter.boxes.every((b) => b.recipe !== 'fallback-box')).toBe(true);
  });

  it('scene.ts și budget.ts nu importă catalogul încorporat (verificare statică)', () => {
    for (const f of ['scene.ts', 'budget.ts', 'geometry.ts', 'io.ts']) {
      expect(readFileSync(new URL(`../src/domain/${f}`, import.meta.url), 'utf8')).not.toMatch(/from ['"]\.\/catalog['"]/);
    }
  });

  it('ID duplicat → copie nouă: toate ID-urile noi, referințe consistente, geometrie și buget identice, cheile din buget remapate', () => {
    const doc = referenceProject();
    let n = 0; const gen = () => `id${++n}`;
    const r = ok(importProject(exportProject(doc, NOW), { existingIds: new Set([doc.id]), genId: gen }));
    expect(r.remapped).toBe(true);
    expect(r.doc.id).not.toBe(doc.id);
    expect(Object.keys(r.doc.walls).some((k) => k in doc.walls)).toBe(false);
    expect(Object.keys(r.doc.budget.overrides)).toContain(`object:${Object.keys(r.doc.objects).find((k) => r.doc.objects[k]!.catalogItemId === 'light.pendant.shade')}`);
    expect(checkIntegrity(r.doc)).toEqual([]);
    expect(geometrySignature(buildScene(r.doc))).toBe(geometrySignature(buildScene(doc)));
    expect(computeBudget(r.doc).total).toEqual(computeBudget(doc).total);
    expect(computeBudget(r.doc).lines.find((l) => l.key.startsWith('object:') && l.priceSource === 'user')?.unitPriceMinor).toBe(25000);
  });
  it('remapIds direct: nicio referință nu rămâne nemapată', () => {
    let n = 0; const d = remapIds(referenceProject(), () => `x${++n}`);
    expect(checkIntegrity(d)).toEqual([]);
  });
});

describe('validare la import — fiecare caz este respins fără efecte', () => {
  const base = () => JSON.parse(exportProject(referenceProject(), NOW));
  const run = (mut: (j: any) => void) => { const j = base(); mut(j); return importProject(JSON.stringify(j)); };
  const stageOf = (r: ReturnType<typeof importProject>) => (r.ok ? 'OK' : r.stage);

  it('JSON invalid', () => { expect(stageOf(importProject('{nu e json'))).toBe('parse'); });
  it('trunchiat', () => { expect(stageOf(importProject(exportProject(referenceProject(), NOW).slice(0, 500)))).toBe('parse'); });
  it('plic greșit', () => { expect(stageOf(run((j) => { j.format = 'altceva'; }))).toBe('envelope'); });
  it('versiune viitoare', () => { expect(stageOf(run((j) => { j.formatVersion = 99; }))).toBe('version'); });
  it('câmp necunoscut respins (strict)', () => { expect(stageOf(run((j) => { j.project.nou = 1; }))).toBe('schema'); });
  it('câmp lipsă', () => { expect(stageOf(run((j) => { delete j.project.settings; }))).toBe('schema'); });
  it('milimetri ne-întregi', () => { expect(stageOf(run((j) => { j.project.nodes.n1.x = 10.5; }))).toBe('schema'); });
  it('item lipsă din catalogSnapshot', () => { expect(stageOf(run((j) => { delete j.project.catalogSnapshot.items['furn.sofa.3seat']; }))).toBe('integrity'); });
  it('finisaj lipsă din catalogSnapshot', () => { expect(stageOf(run((j) => { delete j.project.catalogSnapshot.finishes['fin.tile.600']; }))).toBe('integrity'); });
  it('suprascriere de buget orfană', () => { expect(stageOf(run((j) => { j.project.budget.overrides['object:fantoma'] = { excluded: true }; }))).toBe('integrity'); });
  it('perete lipsă între nodurile camerei', () => { expect(stageOf(run((j) => { delete j.project.walls.w4; }))).toBe('integrity'); });
  it('nod inexistent', () => { expect(stageOf(run((j) => { j.project.walls.w1.endNodeId = 'zzz'; }))).toBe('integrity'); });
  it('grosime IMPARĂ de perete respinsă (axe la jumătăți de mm)', () => { expect(stageOf(run((j) => { j.project.walls.w1.thicknessMm = 75; }))).toBe('schema'); });
  it('gol în afara peretelui', () => { expect(stageOf(run((j) => { j.project.openings.oDoor.offsetMm = 50; }))).toBe('integrity'); });
  it('dimensiuni obiect în afara limitelor', () => { expect(stageOf(run((j) => { j.project.objects.oSofa.size.widthMm = 9000; }))).toBe('integrity'); });
  it('cameră autointersectată', () => { expect(stageOf(run((j) => { j.project.rooms.rA.nodeLoop = ['n1', 'n3', 'n2', 'n4']; }))).toBe('integrity'); });
  it('prea mare', () => { expect(stageOf(importProject('x'.repeat(51 * 1024 * 1024)))).toBe('size'); });
  it('șiruri periculoase rămân text (nu se evaluează)', () => {
    const r = ok(run((j) => { j.project.name = '<img src=x onerror=alert(1)>=HYPERLINK("http://x")'; }));
    expect(r.doc.name).toContain('<img');
  });
});

describe('migrări', () => {
  it('v0 sintetic → v1 → document identic cu referința', () => {
    const doc = referenceProject();
    const v0 = JSON.parse(exportProject(doc, NOW));
    v0.formatVersion = 0; v0.project.schemaVersion = 0;
    const s = v0.project.settings; s.vat = s.defaultVatBp / 100; delete s.defaultVatBp;
    const r = ok(importProject(JSON.stringify(v0)));
    expect(r.migratedFrom).toBe(0);
    expect(r.doc).toEqual(doc);
  });
  it('lanț v0→v1→v2→v3 cu migrări sintetice (dovedește mecanismul, fără a livra v2)', () => {
    const mig = { 0: (r: any) => ({ ...r, a: 1 }), 1: (r: any) => ({ ...r, b: r.a + 1 }), 2: (r: any) => ({ ...r, c: r.b + 1 }) };
    const out = migrateToLatest({ schemaVersion: 0 }, 0, 3, mig) as any;
    expect(out).toMatchObject({ a: 1, b: 2, c: 3, schemaVersion: 3 });
    expect(() => migrateToLatest({}, 0, 3, { 0: mig[0] })).toThrow(/v1→v2/);
  });
  it('serializarea canonică ignoră ordinea cheilor', () => {
    expect(canonicalStringify({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalStringify({ a: { c: 2, d: 1 }, b: 1 }));
  });
});
