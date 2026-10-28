import { describe, expect, it } from 'vitest';
import {
  addOpening,
  addRectRoom,
  addWall,
  analyzeGeometry,
  checkIntegrity,
  moveNode,
  openingCenterRange,
  removeOpening,
  removeRoom,
  removeWall,
  rectInteriorSize,
  roomsUsingWall,
  updateOpening,
  updateRoom,
  updateWall,
  wallDeletionImpact,
  type ProjectDocument,
} from '@/domain';
import { createEmptyProject } from '@/domain/factory';
import { NOW, mk } from '../reference/builders';
import { studioProject } from '../reference/projects';

const counter = () => {
  let n = 0;
  return () => `g${++n}`;
};
const valid = (d: ProjectDocument) => checkIntegrity(d).valid;
function ok<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('moveNode', () => {
  it('mută nodul fără să modifice documentul inițial', () => {
    const doc = studioProject();
    const next = ok(moveNode(doc, 'n5', { x: 7200, y: 0 }));
    expect(next.nodes.n5).toMatchObject({ x: 7200, y: 0 });
    expect(doc.nodes.n5).toMatchObject({ x: 7000, y: 0 });
    expect(valid(next)).toBe(true);
  });
  it('respinge coordonate neîntregi și noduri inexistente; mutarea pe loc nu schimbă documentul', () => {
    const doc = studioProject();
    expect(moveNode(doc, 'n5', { x: 1.5, y: 0 }).ok).toBe(false);
    expect(moveNode(doc, 'zz', { x: 0, y: 0 }).ok).toBe(false);
    expect(ok(moveNode(doc, 'n5', { x: 7000, y: 0 }))).toBe(doc);
  });
  it('o mutare care ar încrucișa pereții este invalidă (o prinde integritatea)', () => {
    const next = ok(moveNode(studioProject(), 'n5', { x: 3000, y: 0 }));
    expect(valid(next)).toBe(false);
  });
});

describe('addWall', () => {
  it('creează două noduri noi și un perete cu valorile implicite ale proiectului', () => {
    const doc = createEmptyProject('p', 'p', NOW);
    const { doc: next, wallId } = ok(addWall(doc, { x: 0, y: 0 }, { x: 3000, y: 0 }, counter()));
    expect(Object.keys(next.nodes)).toHaveLength(2);
    expect(next.walls[wallId]).toMatchObject({ thicknessMm: 100, heightMm: 2600 });
    expect(valid(next)).toBe(true);
  });
  it('refolosește un nod existent din aceeași poziție sau indicat explicit', () => {
    const doc = studioProject();
    const r = ok(addWall(doc, { nodeId: 'n4' }, { x: 7000, y: 3000 }, counter()));
    // n6 există deja în (7000, 3000): nu se creează nod nou
    expect(Object.keys(r.doc.nodes)).toHaveLength(Object.keys(doc.nodes).length);
    expect(r.doc.walls[r.wallId]!.endNodeId).toBe('n6');
  });
  it('refuză perete de lungime zero, dublură, grosime impară și coordonate neîntregi', () => {
    const doc = studioProject();
    const gen = counter();
    expect(addWall(doc, { nodeId: 'n1' }, { nodeId: 'n1' }, gen).ok).toBe(false);
    expect(addWall(doc, { nodeId: 'n1' }, { nodeId: 'n2' }, gen).ok).toBe(false);
    expect(addWall(doc, { nodeId: 'n1' }, { nodeId: 'n3' }, gen, { thicknessMm: 101 }).ok).toBe(
      false,
    );
    expect(addWall(doc, { x: 0.5, y: 0 }, { x: 10, y: 10 }, gen).ok).toBe(false);
  });
  it('sare peste ID-urile deja folosite', () => {
    const doc = mk([['g1', 0, 0]], []);
    const ids = ['g1', 'g1', 'g2', 'g3', 'g4'];
    const r = ok(addWall(doc, { x: 0, y: 1000 }, { x: 1000, y: 1000 }, () => ids.shift()!));
    expect(Object.keys(r.doc.nodes).sort()).toEqual(['g1', 'g2', 'g3']);
    expect(r.wallId).toBe('g4');
  });
  it('un perete care taie alt perete produce un document invalid', () => {
    const r = ok(addWall(studioProject(), { x: 2000, y: -500 }, { x: 2000, y: 3500 }, counter()));
    expect(valid(r.doc)).toBe(false);
  });
});

describe('updateWall', () => {
  it('schimbă grosimea și înălțimea; refuză valori impare', () => {
    const doc = studioProject();
    const next = ok(updateWall(doc, 'w1', { thicknessMm: 200, heightMm: 2700 }));
    expect(next.walls.w1).toMatchObject({ thicknessMm: 200, heightMm: 2700 });
    expect(valid(next)).toBe(true);
    expect(updateWall(doc, 'w1', { thicknessMm: 151 }).ok).toBe(false);
    expect(updateWall(doc, 'w1', { heightMm: 0 }).ok).toBe(false);
    expect(updateWall(doc, 'nu', { heightMm: 2600 }).ok).toBe(false);
  });
  it('un perete prea subțiat în înălțime față de golurile lui devine invalid', () => {
    expect(valid(ok(updateWall(studioProject(), 'w2', { heightMm: 1800 })))).toBe(false);
  });
});

describe('removeWall', () => {
  it('perete liber: dispar peretele, golurile lui și nodurile rămase orfane', () => {
    const base = ok(addWall(studioProject(), { nodeId: 'n5' }, { x: 10000, y: 0 }, counter()));
    const withOpening = ok(addOpening(base.doc, base.wallId, 'window', counter()));
    expect(Object.keys(withOpening.doc.openings)).toHaveLength(3);
    const next = ok(removeWall(withOpening.doc, base.wallId));
    expect(next.walls[base.wallId]).toBeUndefined();
    expect(Object.keys(next.openings).sort()).toEqual(['oDoor', 'oWin']);
    expect(Object.keys(next.nodes)).toHaveLength(6); // nodul (10000, 0) a dispărut, n5 rămâne (îl folosesc alți pereți)
    expect(valid(next)).toBe(true);
  });
  it('perete de cameră: refuzat fără confirmare, cu confirmare dispare camera și finisajele ei', () => {
    const doc = studioProject();
    expect(roomsUsingWall(doc, 'w6').map((r) => r.id)).toEqual(['rB']);
    const refused = removeWall(doc, 'w6');
    expect(refused.ok).toBe(false);
    expect(wallDeletionImpact(doc, 'w6').rooms.map((r) => r.id)).toEqual(['rB']);
    const next = ok(removeWall(doc, 'w6', { removeRooms: true }));
    expect(next.rooms.rB).toBeUndefined();
    expect(next.rooms.rA).toBeDefined();
    expect(valid(next)).toBe(true);
  });
  it('peretele comun a două camere le scoate pe amândouă; golul lui dispare', () => {
    const doc = studioProject();
    expect(
      roomsUsingWall(doc, 'w2')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['rA', 'rB']);
    // w2 are ușa și o vopsea (fPaint1); camera rA are linie manuală legată → ștergerea este blocată explicit
    const r = removeWall(doc, 'w2', { removeRooms: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/linii manuale/);
  });
  it('refuză dacă obiecte sunt atașate de perete', () => {
    const doc = studioProject();
    doc.objects.oSofa!.wallId = 'w7';
    const r = removeWall(doc, 'w7', { removeRooms: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/atașate/);
  });
  it('perete inexistent', () => {
    expect(removeWall(studioProject(), 'nu').ok).toBe(false);
  });
});

describe('camere', () => {
  it('updateRoom: nume, tip, înălțime; `null` șterge înălțimea proprie', () => {
    const doc = studioProject();
    const a = ok(
      updateRoom(doc, 'rA', { name: 'Sufragerie', type: 'living', ceilingHeightMm: 2500 }),
    );
    expect(a.rooms.rA).toMatchObject({ name: 'Sufragerie', ceilingHeightMm: 2500 });
    const b = ok(updateRoom(a, 'rA', { ceilingHeightMm: null }));
    expect('ceilingHeightMm' in b.rooms.rA!).toBe(false);
    expect(updateRoom(doc, 'rA', { name: '   ' }).ok).toBe(false);
    expect(updateRoom(doc, 'rA', { ceilingHeightMm: -1 }).ok).toBe(false);
    expect(updateRoom(doc, 'nu', { name: 'x' }).ok).toBe(false);
  });
  it('removeRoom lasă pereții, șterge finisajul podelei; refuză când o linie manuală e legată', () => {
    const doc = studioProject();
    expect(removeRoom(doc, 'rA').ok).toBe(false); // mLabor e legată de rA
    const free = ok(removeRoom(doc, 'rB'));
    expect(free.rooms.rB).toBeUndefined();
    expect(Object.keys(free.walls)).toHaveLength(7);
    expect(valid(free)).toBe(true);
  });
  it('addRectRoom: dimensiunile interioare cerute apar exact în geometrie', () => {
    const doc = createEmptyProject('p', 'p', NOW);
    const { doc: next, roomId } = ok(
      addRectRoom(doc, { widthMm: 3000, depthMm: 4000, anchor: { x: 1000, y: 500 } }, counter()),
    );
    expect(Object.keys(next.walls)).toHaveLength(4);
    expect(next.rooms[roomId]!.name).toBe('Cameră 1');
    expect(valid(next)).toBe(true);
    const size = ok(rectInteriorSize(next, roomId));
    expect(size).toEqual({ widthMm: 3000, depthMm: 4000 });
    expect(analyzeGeometry(next).rooms.get(roomId)!.areaMm2).toBe(12_000_000);
  });
  it('addRectRoom refuză dimensiuni nevalide; o cameră care taie pereții altei camere e invalidă', () => {
    const doc = studioProject();
    expect(
      addRectRoom(doc, { widthMm: 0, depthMm: 2000, anchor: { x: 0, y: 0 } }, counter()).ok,
    ).toBe(false);
    expect(
      addRectRoom(
        doc,
        { widthMm: 2000, depthMm: 2000, anchor: { x: 0, y: 0 }, thicknessMm: 99 },
        counter(),
      ).ok,
    ).toBe(false);
    const over = ok(
      addRectRoom(doc, { widthMm: 1000, depthMm: 1000, anchor: { x: 3000, y: 500 } }, counter()),
    );
    expect(valid(over.doc)).toBe(false);
  });
});

describe('goluri', () => {
  it('addOpening pune golul la mijlocul peretelui liber, cu valorile implicite ale tipului', () => {
    const doc = studioProject();
    const { doc: next, openingId } = ok(addOpening(doc, 'w3', 'door', counter()));
    expect(next.openings[openingId]).toMatchObject({
      type: 'door',
      widthMm: 900,
      heightMm: 2100,
      sillHeightMm: 0,
      swing: { hinge: 'start', side: 'left' },
    });
    expect(next.openings[openingId]!.offsetMm).toBe(2000); // w3: axă 4000 mm, mijloc
    expect(valid(next)).toBe(true);
  });
  it('al doilea gol pe același perete nu se suprapune cu primul', () => {
    const gen = counter();
    const a = ok(addOpening(studioProject(), 'w3', 'window', gen));
    const b = ok(addOpening(a.doc, 'w3', 'window', gen));
    expect(valid(b.doc)).toBe(true);
    expect(b.doc.openings[b.openingId]!.offsetMm).not.toBe(a.doc.openings[a.openingId]!.offsetMm);
  });
  it('când nu mai încape nimic, întoarce o eroare clară; la fel pentru perete prea scurt', () => {
    const gen = counter();
    let doc = studioProject();
    let last: ReturnType<typeof addOpening> | null = null;
    for (let i = 0; i < 10; i++) {
      last = addOpening(doc, 'w3', 'door', gen);
      if (!last.ok) break;
      doc = last.value.doc;
    }
    expect(last && !last.ok && last.error).toMatch(/loc liber/);
    const tiny = mk(
      [
        ['a', 0, 0],
        ['b', 600, 0],
      ],
      [['w', 'a', 'b']],
    );
    const r = addOpening(tiny, 'w', 'door', gen);
    expect(!r.ok && r.error).toMatch(/prea scurt/);
  });
  it('openingCenterRange respectă marginea și jumătatea lățimii', () => {
    const doc = studioProject();
    const r = openingCenterRange(doc, 'w1', 1200)!;
    const fp = analyzeGeometry(doc).footprints.get('w1')!;
    expect(r.min).toBeGreaterThanOrEqual(Math.max(fp.left.s0, fp.right.s0) + 50 + 600);
    expect(r.max).toBeLessThanOrEqual(Math.min(fp.left.s1, fp.right.s1) - 50 - 600);
    expect(openingCenterRange(doc, 'nu', 900)).toBeNull();
  });
  it('updateOpening: repoziționare, redimensionare, sens; validarea poziției o face integritatea', () => {
    const doc = studioProject();
    const moved = ok(updateOpening(doc, 'oWin', { offsetMm: 1500 }));
    expect(moved.openings.oWin!.offsetMm).toBe(1500);
    expect(valid(moved)).toBe(true);
    expect(valid(ok(updateOpening(doc, 'oWin', { offsetMm: 100 })))).toBe(false); // în zona îmbinării
    const swung = ok(updateOpening(doc, 'oDoor', { swing: { hinge: 'end', side: 'right' } }));
    expect(swung.openings.oDoor!.swing).toEqual({ hinge: 'end', side: 'right' });
    expect(updateOpening(doc, 'oWin', { swing: { hinge: 'end', side: 'right' } }).ok).toBe(false);
    expect(updateOpening(doc, 'oWin', { offsetMm: 10.5 }).ok).toBe(false);
    expect(updateOpening(doc, 'oWin', { widthMm: 0 }).ok).toBe(false);
    expect(updateOpening(doc, 'oWin', { sillHeightMm: -5 }).ok).toBe(false);
    expect(updateOpening(doc, 'nu', { offsetMm: 5 }).ok).toBe(false);
  });
  it('removeOpening', () => {
    const next = ok(removeOpening(studioProject(), 'oDoor'));
    expect(next.openings.oDoor).toBeUndefined();
    expect(removeOpening(next, 'oDoor').ok).toBe(false);
  });
});
