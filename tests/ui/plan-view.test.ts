import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitView,
  nearestNode,
  polygonCentroid,
  readableAngleDeg,
  snapToGrid,
  toScreen,
  toWorld,
  zoomAt,
} from '@/features/plan-editor/view';
import { formatAreaM2, formatLength } from '@/lib/format';
import { describeCommitFailure } from '@/lib/messages';

describe('view: lume ↔ ecran', () => {
  it('toWorld este inversa lui toScreen', () => {
    const v = { zoom: 0.25, panX: 120, panY: -40 };
    const p = { x: 3300, y: -1250 };
    const back = toWorld(v, toScreen(v, p).x, toScreen(v, p).y);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
  it('zoomAt păstrează punctul de sub cursor pe loc și respectă limitele', () => {
    const v = { zoom: 0.1, panX: 50, panY: 80 };
    const before = toWorld(v, 400, 300);
    const z = zoomAt(v, 2, 400, 300);
    const after = toWorld(z, 400, 300);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAt(v, 1e6, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v, 1e-9, 0, 0).zoom).toBe(MIN_ZOOM);
  });
  it('fitView cuprinde punctele și le centrează; plan gol → origine lângă colțul stânga-sus', () => {
    const size = { w: 800, h: 600 };
    const pts = [
      { x: 0, y: 0 },
      { x: 7000, y: 3000 },
    ];
    const v = fitView(pts, size);
    for (const p of pts) {
      const s = toScreen(v, p);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(size.w);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(size.h);
    }
    const c = toScreen(v, { x: 3500, y: 1500 });
    expect(c.x).toBeCloseTo(400, 6);
    expect(c.y).toBeCloseTo(300, 6);
    expect(toScreen(fitView([], size), { x: 0, y: 0 })).toEqual({ x: 56, y: 56 });
  });
});

describe('view: snap și etichete', () => {
  it('snapToGrid rotunjește la grilă', () => {
    expect(snapToGrid({ x: 149, y: 151 }, 100)).toEqual({ x: 100, y: 200 });
  });
  it('nearestNode alege cel mai apropiat în rază, altfel null', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
    ];
    expect(nearestNode(nodes, { x: 80, y: 0 }, 50)?.id).toBe('b');
    expect(nearestNode(nodes, { x: 500, y: 0 }, 50)).toBeNull();
  });
  it('unghiul etichetelor nu lasă textul cu capul în jos', () => {
    expect(readableAngleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(readableAngleDeg({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(readableAngleDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(readableAngleDeg({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(90);
  });
  it('centroidul unui dreptunghi e centrul lui', () => {
    expect(
      polygonCentroid([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 0, y: 2 },
      ]),
    ).toEqual({ x: 2, y: 1 });
  });
});

describe('formatare și mesaje', () => {
  it('lungimi în unitatea proiectului și suprafețe în m²', () => {
    expect(formatLength(3900, 'mm')).toBe('3.900 mm');
    expect(formatLength(3900, 'cm')).toBe('390 cm');
    expect(formatLength(3900, 'm')).toBe('3,9 m');
    expect(formatAreaM2(11_310_000)).toBe('11,31 m²');
  });
  it('describeCommitFailure traduce codurile de integritate; fără coduri știute păstrează mesajul', () => {
    expect(
      describeCommitFailure({
        message: 'generic',
        errors: ['walls.w1: se încrucișează [wall-crossing]', 'openings.o: x [opening-overlap]'],
      }),
    ).toBe(
      'Modificare respinsă. Un perete s-ar încrucișa cu altul fără un nod comun. Un gol s-ar suprapune cu alt gol sau ar fi prea aproape de el.',
    );
    expect(describeCommitFailure({ message: 'generic', errors: ['ceva [necunoscut]'] })).toBe(
      'generic',
    );
    expect(describeCommitFailure({ message: 'doar mesaj' })).toBe('doar mesaj');
  });
});
