// Suprafețe și cantități de materiale (ARCHITECTURE §8.1–8.2). Arii în mm² din geometrie; conversie în m² doar aici.
import { faceBandAreaMm2, type GeometryModel } from '../geometry';
import { ceilEps, roundQty } from '../money';
import type { Finish, FinishAssignment, ProjectDocument, Unit } from '../schema';
import { step, type Traced, type TraceStep } from '../trace';

export const MM2_PER_M2 = 1_000_000;
/** mm² → m², rotunjit la 1e-6 m² (zgomot de virgulă mobilă). */
export const m2OfMm2 = (mm2: number): number => Math.round((mm2 / MM2_PER_M2) * 1e6) / 1e6;

/** „Wall side → cameră” (fața interioară a unui perete aparține camerei care o înconjoară). */
export function wallSideRoomIndex(model: GeometryModel): Map<string, string> {
  const index = new Map<string, string>();
  for (const roomId of [...model.rooms.keys()].sort()) {
    for (const e of model.rooms.get(roomId)!.edges) {
      const key = `${e.wallId}:${e.side}`;
      if (!index.has(key)) index.set(key, roomId);
    }
  }
  return index;
}

export interface AssignmentArea {
  areaMm2: number;
  /** Camera căreia îi aparține suprafața, sau 'none'. */
  roomId: string;
}

export function assignmentArea(
  doc: ProjectDocument,
  model: GeometryModel,
  a: FinishAssignment,
  sideIndex = wallSideRoomIndex(model),
): AssignmentArea {
  if (a.target.kind === 'roomFloor') {
    const room = model.rooms.get(a.target.roomId);
    if (!room) throw new Error(`Cameră necunoscută: ${a.target.roomId}`);
    return { areaMm2: room.areaMm2, roomId: a.target.roomId };
  }
  if (a.target.kind === 'objectSlot')
    throw new Error('Zona unui obiect nu are arie: se contorizează pe bucată.');
  const { wallId, side } = a.target;
  const fp = model.footprints.get(wallId);
  if (!fp) throw new Error(`Perete necunoscut: ${wallId}`);
  const openings = Object.values(doc.openings).filter((o) => o.wallId === wallId);
  return {
    areaMm2: faceBandAreaMm2(fp, side, openings, a.fromHeightMm ?? 0, a.coveredHeightMm),
    roomId: sideIndex.get(`${wallId}:${side}`) ?? 'none',
  };
}

export function roomWallAreaMm2(
  doc: ProjectDocument,
  model: GeometryModel,
  roomId: string,
): number {
  const room = model.rooms.get(roomId);
  if (!room) throw new Error(`Cameră necunoscută: ${roomId}`);
  return room.edges.reduce((sum, e) => {
    const fp = model.footprints.get(e.wallId)!;
    const openings = Object.values(doc.openings).filter((o) => o.wallId === e.wallId);
    return sum + faceBandAreaMm2(fp, e.side, openings);
  }, 0);
}

/** Verifică dacă finisajul are parametrii necesari unității de preț. Întoarce mesaje (gol = valid). */
export function finishConfigProblems(f: Finish): string[] {
  const out: string[] = [];
  if (f.kind === 'paint') {
    if (!['can', 'liter', 'm2'].includes(f.priceUnit))
      out.push(`vopseaua nu poate avea unitatea de preț „${f.priceUnit}”`);
  } else if (f.tile) {
    if (f.priceUnit === 'liter' || f.priceUnit === 'can')
      out.push(`„${f.kind}” nu poate avea unitatea de preț „${f.priceUnit}”`);
    if (f.priceUnit === 'box' && !f.tile.piecesPerBox && !f.tile.boxCoverageM2) {
      out.push('preț pe cutie cere `piecesPerBox` sau `boxCoverageM2`');
    }
  }
  return out;
}

export interface PurchaseQuantity {
  /** Cantitatea de achiziție (rotunjită la ambalaj). */
  purchase: number;
  /** Cantitatea fracționară, în aceeași unitate. */
  computed: number;
  unit: Unit;
}

/** Cantitatea de achiziție pentru un finisaj, dintr-o arie netă (cu rebut) în m². */
export function purchaseQuantity(f: Finish, netM2: number): Traced<PurchaseQuantity> {
  const problems = finishConfigProblems(f);
  if (problems.length > 0) throw new Error(`Finisaj ${f.id} invalid: ${problems.join('; ')}`);
  const trace: TraceStep[] = [];
  if (f.kind === 'furniture') {
    // finisajele de mobilier se numără pe bucată: `netM2` poartă numărul de zone finisate
    trace.push(
      step('Bucăți', 'o bucată per zonă de obiect finisată', { 'zone finisate': netM2 }, netM2),
    );
    return { value: { purchase: netM2, computed: netM2, unit: 'buc' }, trace };
  }
  if (f.kind === 'paint' && f.paint) {
    const litres = (netM2 * f.paint.coats) / f.paint.coverageM2PerLiter;
    trace.push(
      step(
        'Litri necesari',
        'arie netă × straturi / randament',
        {
          'arie netă (m²)': netM2,
          straturi: f.paint.coats,
          'randament (m²/L)': f.paint.coverageM2PerLiter,
        },
        roundQty(litres),
      ),
    );
    if (f.priceUnit === 'can') {
      const cans = ceilEps(litres / f.paint.canVolumeLiters);
      trace.push(
        step(
          'Doze',
          'ceil(litri / volum doză)',
          { litri: roundQty(litres), 'volum doză (L)': f.paint.canVolumeLiters },
          cans,
          'ceil',
        ),
      );
      return {
        value: { purchase: cans, computed: litres / f.paint.canVolumeLiters, unit: 'doza' },
        trace,
      };
    }
    if (f.priceUnit === 'liter') {
      const l = ceilEps(litres * 10) / 10;
      trace.push(
        step('Litri de cumpărat', 'ceil(litri × 10) / 10', { litri: roundQty(litres) }, l, 'ceil'),
      );
      return { value: { purchase: l, computed: litres, unit: 'l' }, trace };
    }
  } else if (f.tile) {
    const pitchM2 =
      ((f.tile.pieceWidthMm + f.tile.groutMm) * (f.tile.pieceHeightMm + f.tile.groutMm)) /
      MM2_PER_M2;
    const pieces = ceilEps(netM2 / pitchM2);
    trace.push(
      step(
        'Bucăți necesare',
        'ceil(arie netă / aria pasului)',
        {
          'arie netă (m²)': netM2,
          'pas (mm)': `${f.tile.pieceWidthMm}+${f.tile.groutMm} × ${f.tile.pieceHeightMm}+${f.tile.groutMm}`,
          'aria pasului (m²)': Math.round(pitchM2 * 1e6) / 1e6,
        },
        pieces,
        'ceil',
      ),
    );
    if (f.priceUnit === 'box') {
      if (f.tile.piecesPerBox) {
        const boxes = ceilEps(pieces / f.tile.piecesPerBox);
        trace.push(
          step(
            'Cutii',
            'ceil(bucăți / bucăți per cutie)',
            { bucăți: pieces, 'bucăți/cutie': f.tile.piecesPerBox },
            boxes,
            'ceil',
          ),
        );
        return {
          value: {
            purchase: boxes,
            computed: netM2 / pitchM2 / f.tile.piecesPerBox,
            unit: 'cutie',
          },
          trace,
        };
      }
      const cover = f.tile.boxCoverageM2!;
      const boxes = ceilEps(netM2 / cover);
      trace.push(
        step(
          'Cutii',
          'ceil(arie netă / m² per cutie)',
          { 'arie netă (m²)': netM2, 'm²/cutie': cover },
          boxes,
          'ceil',
        ),
      );
      return { value: { purchase: boxes, computed: netM2 / cover, unit: 'cutie' }, trace };
    }
    if (f.priceUnit === 'piece')
      return { value: { purchase: pieces, computed: netM2 / pitchM2, unit: 'buc' }, trace };
  }
  const m2 = ceilEps(netM2 * 100) / 100;
  trace.push(
    step(
      'Arie de cumpărat',
      'ceil(arie netă × 100) / 100',
      { 'arie netă (m²)': netM2 },
      m2,
      'ceil',
    ),
  );
  return { value: { purchase: m2, computed: netM2, unit: 'm2' }, trace };
}
