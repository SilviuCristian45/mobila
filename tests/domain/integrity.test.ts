import { describe, expect, it } from 'vitest';
import { checkIntegrity } from '@/domain/integrity';
import { createEmptyProject, DEFAULT_SETTINGS, cloneDocument } from '@/domain/factory';
import { CURRENT_VERSION, ProjectDocumentSchema } from '@/domain/schema';
import { NOW, finish } from '../reference/builders';
import { studioProject } from '../reference/projects';

const codes = (d: ReturnType<typeof studioProject>) =>
  checkIntegrity(d)
    .errors.map((e) => e.code)
    .sort();

describe('model de bază', () => {
  it('proiectul gol din fabrică este valid și respectă schema', () => {
    const d = createEmptyProject('p1', 'Nou', NOW);
    expect(ProjectDocumentSchema.safeParse(d).success).toBe(true);
    expect(checkIntegrity(d).valid).toBe(true);
    expect(d.schemaVersion).toBe(CURRENT_VERSION);
    expect(Object.keys(d.levels)).toEqual(['L1']);
  });
  it('valorile implicite: RON, preț cu TVA, 21%, perete 100 mm (par), înălțime 2600', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      currency: 'RON',
      pricesIncludeVat: true,
      defaultVatBp: 2100,
      defaultWallThicknessMm: 100,
      defaultWallHeightMm: 2600,
    });
    expect(DEFAULT_SETTINGS.defaultWallThicknessMm % 2).toBe(0);
  });
  it('cloneDocument produce o copie independentă', () => {
    const a = studioProject();
    const b = cloneDocument(a);
    b.nodes.n1!.x = 999;
    expect(a.nodes.n1!.x).toBe(0);
  });
  it('referința are doar avertismente (nimic neutilizat în afara itemilor din snapshot)', () => {
    const r = checkIntegrity(studioProject());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe('verificări de integritate', () => {
  it('cheie ≠ id', () => {
    const d = studioProject();
    d.nodes.n1!.id = 'altul';
    expect(codes(d)).toContain('id-mismatch');
  });
  it('nivel inexistent', () => {
    const d = studioProject();
    d.walls.w1!.levelId = 'L9';
    expect(codes(d)).toContain('level-missing');
  });
  it('obiect: item lipsă, dimensiuni în afara limitelor, perete referit inexistent', () => {
    let d = studioProject();
    d.objects.oSofa!.catalogItemId = 'nu.exista';
    expect(codes(d)).toContain('catalog-item-missing');
    d = studioProject();
    d.objects.oSofa!.size.widthMm = 5000;
    expect(codes(d)).toContain('object-size-limits');
    d = studioProject();
    d.objects.oSofa!.wallId = 'wZ';
    expect(codes(d)).toContain('object-wall-missing');
  });
  it('limitele de dimensiune sunt inclusive', () => {
    const d = studioProject();
    d.objects.oSofa!.size.widthMm = 1000;
    d.objects.oSofa!.size.depthMm = 1200;
    expect(codes(d)).toEqual([]);
    d.objects.oSofa!.size.widthMm = 999;
    expect(codes(d)).toEqual(['object-size-limits']);
  });
  it('monedă diferită = eroare; mod TVA diferit = avertisment', () => {
    const d = studioProject();
    d.settings.currency = 'EUR';
    expect(codes(d)).toContain('currency-mismatch');
    const e = studioProject();
    e.settings.pricesIncludeVat = false;
    const r = checkIntegrity(e);
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('vat-mode-mismatch');
  });
  it('finisaje: configurări incoerente cu unitatea de preț', () => {
    const d = studioProject();
    d.catalogSnapshot.finishes['fin.bad'] = finish({
      id: 'fin.bad',
      kind: 'tile',
      tile: { pieceWidthMm: 600, pieceHeightMm: 600, groutMm: 0 },
    });
    expect(codes(d)).toContain('finish-config');
  });
  it('atribuiri: finisaj lipsă, țintă inexistentă, podea de două ori, benzi suprapuse sau în afara peretelui', () => {
    let d = studioProject();
    d.finishAssignments.fFloorA!.finishId = 'zzz';
    expect(codes(d)).toContain('finish-missing');
    d = studioProject();
    d.finishAssignments.fFloorA!.target = { kind: 'roomFloor', roomId: 'rZ' };
    expect(codes(d)).toContain('assignment-room-missing');
    d = studioProject();
    d.finishAssignments.fPaint0!.target = { kind: 'wallSide', wallId: 'wZ', side: 'right' };
    expect(codes(d)).toContain('assignment-wall-missing');
    d = studioProject();
    d.finishAssignments.fFloor2 = {
      id: 'fFloor2',
      target: { kind: 'roomFloor', roomId: 'rA' },
      finishId: 'fin.tile.600',
      wastePct: 10,
    };
    expect(codes(d)).toContain('floor-assigned-twice');
    d = studioProject();
    d.finishAssignments.fBand = {
      id: 'fBand',
      target: { kind: 'wallSide', wallId: 'w1', side: 'right' },
      finishId: 'fin.paint.white',
      wastePct: 5,
      fromHeightMm: 1000,
      coveredHeightMm: 500,
    };
    expect(codes(d)).toContain('assignment-band-overlap');
    d = studioProject();
    d.finishAssignments.fOut = {
      id: 'fOut',
      target: { kind: 'wallSide', wallId: 'w1', side: 'left' },
      finishId: 'fin.paint.white',
      wastePct: 5,
      fromHeightMm: 3000,
    };
    expect(codes(d)).toContain('assignment-band-invalid');
  });
  it('benzi alăturate (0–1200 și 1200–2600) NU se suprapun', () => {
    const d = studioProject();
    d.finishAssignments.fA = {
      id: 'fA',
      target: { kind: 'wallSide', wallId: 'w1', side: 'left' },
      finishId: 'fin.paint.white',
      wastePct: 5,
      fromHeightMm: 0,
      coveredHeightMm: 1200,
    };
    d.finishAssignments.fB = {
      id: 'fB',
      target: { kind: 'wallSide', wallId: 'w1', side: 'left' },
      finishId: 'fin.paint.white',
      wastePct: 5,
      fromHeightMm: 1200,
    };
    expect(codes(d)).toEqual([]);
  });
  it('buget: suprascriere orfană, linie manuală cu referințe rupte', () => {
    let d = studioProject();
    d.budget.overrides['object:fantoma'] = { excluded: true };
    d.budget.overrides['dubios'] = { excluded: true };
    d.budget.overrides['finish:neutilizat'] = { excluded: true };
    expect(codes(d).filter((c) => c === 'override-orphan')).toHaveLength(3);
    d = studioProject();
    d.budget.manualLines.mLabor!.roomId = 'rZ';
    expect(codes(d)).toContain('manual-room-missing');
    d = studioProject();
    d.budget.manualLines.mLabor!.binding = { kind: 'assignmentArea', assignmentId: 'aZ' };
    expect(codes(d)).toContain('binding-assignment-missing');
  });
  it('catalog neutilizat este doar avertisment', () => {
    const d = studioProject();
    delete d.objects.oLamp;
    delete d.budget.overrides['object:oLamp'];
    const r = checkIntegrity(d);
    expect(r.valid).toBe(true);
    expect(
      r.warnings.some((w) => w.code === 'catalog-unused' && w.path.endsWith('light.pendant.shade')),
    ).toBe(true);
  });
});
