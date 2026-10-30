// Bugetul = linii DERIVATE din model (obiecte, finisaje) + SUPRASCRIERI ale utilizatorului + linii MANUALE.
// Suprascrierile se păstrează separat de cantitățile recalculate automat; fiecare valoare are urmă de calcul.
import { InvalidDocumentError } from '../errors';
import { analyzeGeometry, pointInPolygon, type GeometryModel } from '../geometry';
import {
  addTotals,
  allocate,
  lineMoney,
  roundHalfAway,
  roundQty,
  zeroTotals,
  type Totals,
} from '../money';
import {
  assignmentArea,
  m2OfMm2,
  purchaseQuantity,
  roomWallAreaMm2,
  wallSideRoomIndex,
} from '../quantities';
import type { BudgetCategory, ProjectDocument, Unit } from '../schema';
import { step, type TraceStep } from '../trace';

export interface LineValues {
  quantity: number;
  unitPriceMinor: number;
  vatBp: number;
}

export interface BudgetLine {
  /** `object:<objectId>` | `finish:<finishId>` | `manual:<lineId>`. */
  key: string;
  origin: 'derived' | 'manual';
  category: BudgetCategory;
  description: string;
  unit: Unit;
  /** Valorile produse de model/catalog (se recalculează la fiecare modificare a modelului). */
  computed: LineValues;
  /** Valorile folosite efectiv (după suprascrierile utilizatorului). */
  effective: LineValues;
  overridden: { quantity: boolean; unitPriceMinor: boolean; vatBp: boolean };
  /** `demo` = preț demonstrativ din catalog, needitat; `user` = introdus/editat de utilizator. */
  priceSource: 'demo' | 'user';
  excluded: boolean;
  note?: string;
  totals: Totals;
  /** Alocarea totalului pe camere ('none' = fără cameră); suma = `totals` exact. */
  byRoom: Record<string, Totals>;
  trace: TraceStep[];
}

export interface BudgetSummary {
  lines: BudgetLine[];
  perRoom: Record<string, Totals>;
  perCategory: Partial<Record<BudgetCategory, Totals>>;
  subtotal: Totals;
  contingency: Totals;
  total: Totals;
  /** Urma sumelor agregate (subtotal, rezervă, total). */
  trace: TraceStep[];
}

/**
 * Categoria liniei unui finisaj: vopseaua → `paint`, finisajul de mobilier → `furniture`; restul după suprafețele pe care e
 * aplicat (numai pereți → `wall_finish`, altfel `flooring`). O linie e per finisaj, deci o singură categorie.
 */
function finishCategory(kind: string, surfaces: ReadonlySet<string>): BudgetCategory {
  if (kind === 'paint') return 'paint';
  if (kind === 'furniture') return 'furniture';
  if (kind === 'wall_tile') return 'wall_finish';
  return surfaces.size > 0 && [...surfaces].every((x) => x === 'wall') ? 'wall_finish' : 'flooring';
}

function requireValid(model: GeometryModel): GeometryModel {
  if (model.issues.length > 0) {
    throw new InvalidDocumentError(
      `Geometrie invalidă (${model.issues.length} probleme): bugetul nu se poate calcula.`,
      model.issues,
    );
  }
  return model;
}

export function computeBudget(doc: ProjectDocument, geometry?: GeometryModel): BudgetSummary {
  const model = requireValid(geometry ?? analyzeGeometry(doc)); // și un model primit din exterior trebuie să fie valid
  const overrides = doc.budget.overrides;
  const includeVat = doc.settings.pricesIncludeVat;
  const sideIndex = wallSideRoomIndex(model);
  const roomPolys = [...model.rooms.keys()]
    .sort()
    .map((id) => [id, model.rooms.get(id)!.polygon] as const);
  const roomOf = (p: { x: number; y: number }): string =>
    roomPolys.find(([, poly]) => pointInPolygon(p, poly))?.[0] ?? 'none';
  const lines: BudgetLine[] = [];

  // 1) obiecte: o linie per obiect
  for (const o of Object.values(doc.objects)) {
    const item = doc.catalogSnapshot.items[o.catalogItemId];
    const key = `object:${o.id}`;
    const ov = overrides[key] ?? {};
    const computed: LineValues = {
      quantity: 1,
      unitPriceMinor: item?.reference?.priceMinor ?? 0,
      vatBp: doc.settings.defaultVatBp,
    };
    const effective: LineValues = {
      quantity: ov.quantity ?? computed.quantity,
      unitPriceMinor: ov.unitPriceMinor ?? computed.unitPriceMinor,
      vatBp: ov.vatBp ?? computed.vatBp,
    };
    const money = lineMoney(
      effective.quantity,
      effective.unitPriceMinor,
      effective.vatBp,
      includeVat,
    );
    const room = roomOf(o.position);
    const category: BudgetCategory = item?.kind ?? 'other';
    lines.push({
      key,
      origin: 'derived',
      category,
      description: o.name ?? item?.name.ro ?? o.catalogItemId,
      unit: 'buc',
      computed,
      effective,
      overridden: {
        quantity: ov.quantity !== undefined,
        unitPriceMinor: ov.unitPriceMinor !== undefined,
        vatBp: ov.vatBp !== undefined,
      },
      priceSource: ov.unitPriceMinor !== undefined ? 'user' : (item?.reference?.origin ?? 'user'),
      excluded: ov.excluded ?? false,
      ...(ov.note !== undefined ? { note: ov.note } : {}),
      totals: money.value,
      byRoom: { [room]: money.value },
      trace: [
        step('Cantitate', 'un obiect plasat', { obiect: o.id }, computed.quantity),
        step(
          'Cameră',
          'camera care conține centrul obiectului',
          { x: o.position.x, y: o.position.y },
          room,
        ),
        ...(item?.reference
          ? []
          : [step('Preț', 'catalogul nu conține preț de referință', { item: o.catalogItemId }, 0)]),
        ...money.trace,
      ],
    });
  }

  // 2) finisaje: aria netă se însumează pe finisaj ÎNAINTE de rotunjirea la ambalaj
  interface Group {
    /** m² nete (cu rebut) pentru suprafețe; număr de zone finisate pentru finisajele de mobilier. */
    netM2: number;
    surfaces: Set<string>;
    perRoom: Record<string, number>;
    trace: TraceStep[];
  }
  const groups = new Map<string, Group>();
  for (const a of Object.values(doc.finishAssignments).sort((x, y) => x.id.localeCompare(y.id))) {
    if (a.target.kind === 'objectSlot') {
      // finisaj de mobilier: o bucată per zonă; camera = cea a obiectului; fără arie (nu se taxează suprafețe)
      const obj = doc.objects[a.target.objectId];
      if (!obj)
        throw new InvalidDocumentError(`Obiect inexistent: ${a.target.objectId}`, [
          {
            code: 'assignment-object-missing',
            path: `finishAssignments.${a.id}`,
            message: 'obiect inexistent',
          },
        ]);
      const roomId = roomOf(obj.position);
      const g = groups.get(a.finishId) ?? {
        netM2: 0,
        surfaces: new Set<string>(),
        perRoom: {},
        trace: [],
      };
      g.netM2 += 1;
      g.surfaces.add('object');
      g.perRoom[roomId] = (g.perRoom[roomId] ?? 0) + 1;
      g.trace.push(
        step(
          `Zonă ${a.id}`,
          'o bucată per zonă de obiect finisată',
          { obiect: obj.id, zonă: a.target.slot, cameră: roomId },
          1,
        ),
      );
      groups.set(a.finishId, g);
      continue;
    }
    const { areaMm2, roomId } = assignmentArea(doc, model, a, sideIndex);
    const areaM2 = m2OfMm2(areaMm2);
    const net = areaM2 * (1 + a.wastePct / 100);
    const g = groups.get(a.finishId) ?? {
      netM2: 0,
      surfaces: new Set<string>(),
      perRoom: {},
      trace: [],
    };
    g.surfaces.add(a.target.kind === 'roomFloor' ? 'floor' : 'wall');
    g.netM2 += net;
    g.perRoom[roomId] = (g.perRoom[roomId] ?? 0) + net;
    g.trace.push(
      step(
        `Arie ${a.id}`,
        a.target.kind === 'roomFloor'
          ? 'aria interioară a camerei'
          : 'lungime față × înălțime bandă − goluri',
        { 'arie (m²)': areaM2, 'rebut (%)': a.wastePct, cameră: roomId },
        Math.round(net * 1e6) / 1e6,
      ),
    );
    groups.set(a.finishId, g);
  }
  for (const [finishId, g] of [...groups].sort(([x], [y]) => x.localeCompare(y))) {
    const finish = doc.catalogSnapshot.finishes[finishId];
    if (!finish)
      throw new InvalidDocumentError(`Finisaj lipsă din catalogSnapshot: ${finishId}`, [
        {
          code: 'finish-missing',
          path: `catalogSnapshot.finishes.${finishId}`,
          message: 'lipsește',
        },
      ]);
    const key = `finish:${finishId}`;
    const ov = overrides[key] ?? {};
    const pq = purchaseQuantity(finish, Math.round(g.netM2 * 1e6) / 1e6);
    const computed: LineValues = {
      quantity: pq.value.purchase,
      unitPriceMinor: finish.unitPriceMinor,
      vatBp: finish.vatBp ?? doc.settings.defaultVatBp,
    };
    const effective: LineValues = {
      quantity: ov.quantity ?? computed.quantity,
      unitPriceMinor: ov.unitPriceMinor ?? computed.unitPriceMinor,
      vatBp: ov.vatBp ?? computed.vatBp,
    };
    const money = lineMoney(
      effective.quantity,
      effective.unitPriceMinor,
      effective.vatBp,
      includeVat,
    );
    const netByRoom = allocate(money.value.netMinor, g.perRoom);
    const vatByRoom = allocate(money.value.vatMinor, g.perRoom);
    const byRoom: Record<string, Totals> = {};
    for (const r of Object.keys(g.perRoom).sort()) {
      byRoom[r] = {
        netMinor: netByRoom[r]!,
        vatMinor: vatByRoom[r]!,
        grossMinor: netByRoom[r]! + vatByRoom[r]!,
      };
    }
    lines.push({
      key,
      origin: 'derived',
      category: finishCategory(finish.kind, g.surfaces),
      description:
        finish.kind === 'furniture'
          ? `${finish.name.ro} (finisaj mobilier, supliment)`
          : finish.name.ro,
      unit: pq.value.unit,
      computed,
      effective,
      overridden: {
        quantity: ov.quantity !== undefined,
        unitPriceMinor: ov.unitPriceMinor !== undefined,
        vatBp: ov.vatBp !== undefined,
      },
      priceSource: ov.unitPriceMinor !== undefined ? 'user' : finish.priceOrigin,
      excluded: ov.excluded ?? false,
      ...(ov.note !== undefined ? { note: ov.note } : {}),
      totals: money.value,
      byRoom,
      trace: [
        ...g.trace,
        step(
          finish.kind === 'furniture' ? 'Zone finisate' : 'Arie netă totală',
          finish.kind === 'furniture'
            ? 'Σ zonele finisate cu același finisaj'
            : 'Σ ariile nete ale atribuirilor aceluiași finisaj',
          { finisaj: finishId },
          Math.round(g.netM2 * 1e6) / 1e6,
        ),
        ...pq.trace,
        ...(ov.quantity !== undefined
          ? [
              step(
                'Cantitate suprascrisă de utilizator',
                'valoarea manuală înlocuiește cantitatea calculată',
                { calculată: computed.quantity },
                ov.quantity,
              ),
            ]
          : []),
        ...money.trace,
        step(
          'Alocare pe camere',
          'cea mai mare rămășiță, proporțional cu aria netă',
          Object.fromEntries(
            Object.entries(g.perRoom).map(([r, v]) => [r, Math.round(v * 1e4) / 1e4]),
          ),
          Object.keys(byRoom).join(', '),
        ),
      ],
    });
  }

  // 3) linii manuale (opțional legate de arii din model)
  for (const l of Object.values(doc.budget.manualLines)) {
    const bindTrace: TraceStep[] = [];
    let quantity = l.quantity;
    let roomId = l.roomId ?? 'none';
    const b = l.binding;
    if (b?.kind === 'roomFloorArea') {
      quantity = roundQty(m2OfMm2(model.rooms.get(b.roomId)?.areaMm2 ?? 0));
      roomId = b.roomId;
      bindTrace.push(
        step(
          'Cantitate legată: aria podelei',
          'aria interioară a camerei',
          { cameră: b.roomId },
          quantity,
          'round',
        ),
      );
    } else if (b?.kind === 'roomWallArea') {
      quantity = roundQty(m2OfMm2(roomWallAreaMm2(doc, model, b.roomId)));
      roomId = b.roomId;
      bindTrace.push(
        step(
          'Cantitate legată: aria pereților',
          'Σ fețele interioare minus goluri',
          { cameră: b.roomId },
          quantity,
          'round',
        ),
      );
    } else if (b?.kind === 'assignmentArea') {
      const a = doc.finishAssignments[b.assignmentId];
      if (!a)
        throw new InvalidDocumentError(`Atribuire inexistentă: ${b.assignmentId}`, [
          {
            code: 'binding-missing',
            path: `budget.manualLines.${l.id}`,
            message: 'atribuire inexistentă',
          },
        ]);
      const area = assignmentArea(doc, model, a, sideIndex);
      quantity = roundQty(m2OfMm2(area.areaMm2));
      roomId = area.roomId;
      bindTrace.push(
        step(
          'Cantitate legată: aria atribuirii',
          'aria țintei finisajului',
          { atribuire: b.assignmentId },
          quantity,
          'round',
        ),
      );
    } else
      bindTrace.push(step('Cantitate introdusă manual', 'valoare a utilizatorului', {}, quantity));
    const values: LineValues = { quantity, unitPriceMinor: l.unitPriceMinor, vatBp: l.vatBp };
    const money = lineMoney(quantity, l.unitPriceMinor, l.vatBp, includeVat);
    lines.push({
      key: `manual:${l.id}`,
      origin: 'manual',
      category: l.category,
      description: l.description,
      unit: l.unit,
      computed: values,
      effective: values,
      overridden: { quantity: false, unitPriceMinor: false, vatBp: false },
      priceSource: 'user',
      excluded: l.excluded ?? false,
      ...(l.note !== undefined ? { note: l.note } : {}),
      totals: money.value,
      byRoom: { [roomId]: money.value },
      trace: [...bindTrace, ...money.trace],
    });
  }

  lines.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // 4) totaluri (doar liniile incluse); suma liniilor rotunjite, fără altă rotunjire
  let subtotal = zeroTotals();
  const perRoom: Record<string, Totals> = {};
  const perCategory: Partial<Record<BudgetCategory, Totals>> = {};
  const included = lines.filter((l) => !l.excluded);
  for (const l of included) {
    subtotal = addTotals(subtotal, l.totals);
    perCategory[l.category] = addTotals(perCategory[l.category] ?? zeroTotals(), l.totals);
    for (const [r, t] of Object.entries(l.byRoom))
      perRoom[r] = addTotals(perRoom[r] ?? zeroTotals(), t);
  }
  const bp = doc.settings.contingencyBp;
  const cNet = roundHalfAway((subtotal.netMinor * bp) / 10000);
  const cVat = roundHalfAway((subtotal.vatMinor * bp) / 10000);
  const contingency: Totals = { netMinor: cNet, vatMinor: cVat, grossMinor: cNet + cVat };
  const total = addTotals(subtotal, contingency);
  const trace: TraceStep[] = [
    step(
      'Subtotal',
      'Σ liniile incluse (fiecare deja rotunjită)',
      {
        linii: included.length,
        excluse: lines.length - included.length,
        'net (bani)': subtotal.netMinor,
        'TVA (bani)': subtotal.vatMinor,
      },
      subtotal.grossMinor,
    ),
    step(
      'Rezervă',
      'round(net × rezervă bp / 10000) + round(TVA × rezervă bp / 10000)',
      { 'rezervă (bp)': bp, 'net (bani)': cNet, 'TVA (bani)': cVat },
      contingency.grossMinor,
      'round',
    ),
    step(
      'Total',
      'subtotal + rezervă',
      { subtotal: subtotal.grossMinor, rezervă: contingency.grossMinor },
      total.grossMinor,
    ),
  ];
  return { lines, perRoom, perCategory, subtotal, contingency, total, trace };
}
