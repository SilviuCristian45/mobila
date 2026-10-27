// SPIKE — cantități + buget cu urmă de calcul (DATA_MODEL §6, ARCHITECTURE §8).
import { computeJoins, faceBandAreaMm2, interiorPolygon, pointInPolygon, polygonArea, roomWallSides } from './geometry';
import type { Finish, ProjectDocument } from './schema';

export interface TraceStep { label: string; formula: string; result: number | string; rounding?: 'ceil' | 'round' | 'none' }
export interface BudgetLine {
  key: string; origin: 'derived' | 'manual'; category: string; description: string;
  roomShares: Record<string, number>; // roomId|'none' → part din cantitatea de achiziție (fracție 0..1 ca raport de arie/1)
  unit: string; computedQuantity: number; purchaseQuantity: number; unitPriceMinor: number; priceSource: 'demo' | 'user'; vatBp: number;
  netMinor: number; vatMinor: number; grossMinor: number; excluded: boolean; trace: TraceStep[];
  byRoom: Record<string, { netMinor: number; vatMinor: number; grossMinor: number }>;
}
export interface Totals { netMinor: number; vatMinor: number; grossMinor: number }
export interface BudgetSummary { lines: BudgetLine[]; perRoom: Record<string, Totals>; subtotal: Totals; contingency: Totals; total: Totals }

/** Rotunjire „half away from zero” pe valori nenegative/negative. */
export const roundHalfAway = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));
export const ceilEps = (x: number): number => Math.ceil(x - 1e-9);
const MM2_PER_M2 = 1_000_000;
const m2 = (mm2: number): number => Math.round((mm2 / MM2_PER_M2) * 1e6) / 1e6;

function moneyOf(doc: ProjectDocument, qty: number, unitPrice: number, vatBp: number): Totals {
  if (doc.settings.pricesIncludeVat) {
    const gross = roundHalfAway(qty * unitPrice);
    const net = roundHalfAway((gross * 10000) / (10000 + vatBp));
    return { netMinor: net, vatMinor: gross - net, grossMinor: gross };
  }
  const net = roundHalfAway(qty * unitPrice);
  const vat = roundHalfAway((net * vatBp) / 10000);
  return { netMinor: net, vatMinor: vat, grossMinor: net + vat };
}

/** Alocare proporțională cu cea mai mare rămășiță: suma părților = totalul exact. */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights);
  const sumW = keys.reduce((a, k) => a + weights[k]!, 0);
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  if (sumW <= 0) { keys.forEach((k, i) => { out[k] = i === 0 ? total : 0; }); return out; }
  const raw = keys.map((k) => ({ k, v: (total * weights[k]!) / sumW }));
  let used = 0;
  raw.forEach((r) => { out[r.k] = Math.floor(r.v); used += out[r.k]!; });
  raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || a.k.localeCompare(b.k));
  for (let i = 0; i < total - used; i++) out[raw[i % raw.length]!.k]! += 1;
  return out;
}

function roomOfPoint(polys: Array<[string, ReturnType<typeof interiorPolygon>]>, p: { x: number; y: number }): string {
  for (const [id, poly] of polys) if (pointInPolygon(p, poly)) return id;
  return 'none';
}

export function roomFloorAreaMm2(doc: ProjectDocument, roomId: string): number { return polygonArea(interiorPolygon(doc, roomId)); }
export function roomWallAreaMm2(doc: ProjectDocument, roomId: string): number {
  const joins = computeJoins(doc);
  return roomWallSides(doc, roomId).reduce((a, s) => a + faceBandAreaMm2(doc, joins, s.wallId, s.side), 0);
}

export function assignmentAreaMm2(doc: ProjectDocument, id: string, joins = computeJoins(doc)): { area: number; room: string } {
  const a = doc.finishAssignments[id]!;
  if (a.target.kind === 'roomFloor') return { area: roomFloorAreaMm2(doc, a.target.roomId), room: a.target.roomId };
  const t = a.target;
  const area = faceBandAreaMm2(doc, joins, t.wallId, t.side, a.fromHeightMm ?? 0, a.coveredHeightMm);
  let room = 'none';
  for (const r of Object.values(doc.rooms)) if (roomWallSides(doc, r.id).some((s) => s.wallId === t.wallId && s.side === t.side)) room = r.id;
  return { area, room };
}

function finishQuantity(f: Finish, netM2: number): { computed: number; purchase: number; unit: string; steps: TraceStep[] } {
  const steps: TraceStep[] = [];
  if (f.tile) {
    const pieceM2 = ((f.tile.pieceWidthMm + f.tile.groutMm) * (f.tile.pieceHeightMm + f.tile.groutMm)) / MM2_PER_M2; // pasul = piesă + rost
    const pieces = ceilEps(netM2 / pieceM2);
    steps.push({ label: 'Plăci necesare', formula: `ceil(${netM2.toFixed(4)} m² / ${pieceM2.toFixed(6)} m²/placă (pas ${f.tile.pieceWidthMm}+${f.tile.groutMm} × ${f.tile.pieceHeightMm}+${f.tile.groutMm} mm))`, result: pieces, rounding: 'ceil' });
    if (f.tile.piecesPerBox) {
      const boxes = ceilEps(pieces / f.tile.piecesPerBox);
      steps.push({ label: 'Cutii', formula: `ceil(${pieces} / ${f.tile.piecesPerBox} plăci/cutie)`, result: boxes, rounding: 'ceil' });
      return { computed: netM2 / pieceM2 / f.tile.piecesPerBox, purchase: boxes, unit: 'cutie', steps };
    }
    return { computed: netM2 / pieceM2, purchase: pieces, unit: 'buc', steps };
  }
  if (f.paint) {
    const liters = (netM2 * f.paint.coats) / f.paint.coverageM2PerLiter;
    steps.push({ label: 'Litri', formula: `${netM2.toFixed(4)} m² × ${f.paint.coats} straturi / ${f.paint.coverageM2PerLiter} m²/L`, result: Math.round(liters * 1e6) / 1e6, rounding: 'none' });
    const cans = ceilEps(liters / f.paint.canVolumeLiters);
    steps.push({ label: 'Doze', formula: `ceil(${liters.toFixed(4)} L / ${f.paint.canVolumeLiters} L/doză)`, result: cans, rounding: 'ceil' });
    return { computed: liters / f.paint.canVolumeLiters, purchase: cans, unit: 'doză', steps };
  }
  return { computed: netM2, purchase: ceilEps(netM2), unit: 'm2', steps };
}

export function computeBudget(doc: ProjectDocument): BudgetSummary {
  const lines: BudgetLine[] = [];
  const joins = computeJoins(doc);
  const ov = doc.budget.overrides;
  const roomPolys = Object.keys(doc.rooms).map((id) => [id, interiorPolygon(doc, id)] as [string, ReturnType<typeof interiorPolygon>]); // o singură dată, nu per obiect

  // 1) obiecte (câte o linie)
  for (const o of Object.values(doc.objects)) {
    const item = doc.catalogSnapshot.items[o.catalogItemId];
    const key = `object:${o.id}`;
    const o2 = ov[key] ?? {};
    const basePrice = item?.reference?.priceMinor ?? 0;
    const price = o2.unitPriceMinor ?? basePrice;
    const vat = o2.vatBp ?? doc.settings.defaultVatBp;
    const qty = o2.quantity ?? 1;
    const m = moneyOf(doc, qty, price, vat);
    const room = roomOfPoint(roomPolys, o.position);
    lines.push({
      key, origin: 'derived', category: item?.kind ?? 'other', description: item?.name.ro ?? o.catalogItemId, roomShares: { [room]: 1 },
      unit: 'buc', computedQuantity: 1, purchaseQuantity: qty, unitPriceMinor: price,
      priceSource: o2.unitPriceMinor !== undefined ? 'user' : item?.reference?.origin ?? 'user', vatBp: vat, ...m, excluded: !!o2.excluded,
      trace: [{ label: 'Total linie', formula: `round(${qty} × ${price} bani)`, result: m.grossMinor, rounding: 'round' }],
      byRoom: { [room]: m },
    });
  }

  // 2) finisaje: agregare pe finishId ÎNAINTE de rotunjirea la ambalaj
  const byFinish = new Map<string, { net: number; perRoomNet: Record<string, number>; steps: TraceStep[] }>();
  for (const a of Object.values(doc.finishAssignments)) {
    const { area, room } = assignmentAreaMm2(doc, a.id, joins);
    const net = m2(area) * (1 + a.wastePct / 100);
    const g = byFinish.get(a.finishId) ?? { net: 0, perRoomNet: {}, steps: [] };
    g.net += net; g.perRoomNet[room] = (g.perRoomNet[room] ?? 0) + net;
    g.steps.push({ label: `Arie ${a.id}`, formula: `${m2(area)} m² × (1 + ${a.wastePct}%)`, result: Math.round(net * 1e6) / 1e6, rounding: 'none' });
    byFinish.set(a.finishId, g);
  }
  for (const [finishId, g] of byFinish) {
    const f = doc.catalogSnapshot.finishes[finishId];
    if (!f) continue;
    const key = `finish:${finishId}`;
    const o2 = ov[key] ?? {};
    const q = finishQuantity(f, g.net);
    const qty = o2.quantity ?? q.purchase;
    const price = o2.unitPriceMinor ?? f.unitPriceMinor;
    const vat = o2.vatBp ?? f.vatBp ?? doc.settings.defaultVatBp;
    const m = moneyOf(doc, qty, price, vat);
    const net = allocate(m.netMinor, g.perRoomNet), vatA = allocate(m.vatMinor, g.perRoomNet);
    const byRoom: BudgetLine['byRoom'] = {};
    for (const r of Object.keys(g.perRoomNet)) byRoom[r] = { netMinor: net[r]!, vatMinor: vatA[r]!, grossMinor: net[r]! + vatA[r]! };
    lines.push({
      key, origin: 'derived', category: f.kind === 'paint' ? 'paint' : 'flooring', description: f.name.ro, roomShares: g.perRoomNet,
      unit: q.unit, computedQuantity: q.computed, purchaseQuantity: qty, unitPriceMinor: price,
      priceSource: o2.unitPriceMinor !== undefined ? 'user' : f.priceOrigin, vatBp: vat, ...m, excluded: !!o2.excluded,
      trace: [...g.steps, ...q.steps, { label: 'Total linie', formula: `round(${qty} × ${price} bani)`, result: m.grossMinor, rounding: 'round' }], byRoom,
    });
  }

  // 3) linii manuale (cu legare la arie)
  for (const l of Object.values(doc.budget.manualLines)) {
    let qty = l.quantity; const steps: TraceStep[] = [];
    if (l.binding?.kind === 'roomFloorArea') { qty = m2(roomFloorAreaMm2(doc, l.binding.roomId)); steps.push({ label: 'Arie podea', formula: `aria interioară ${l.binding.roomId}`, result: qty }); }
    else if (l.binding?.kind === 'roomWallArea') { qty = m2(roomWallAreaMm2(doc, l.binding.roomId)); steps.push({ label: 'Arie pereți', formula: `Σ fețe interioare ${l.binding.roomId}`, result: qty }); }
    else if (l.binding?.kind === 'assignmentArea') { qty = m2(assignmentAreaMm2(doc, l.binding.assignmentId, joins).area); steps.push({ label: 'Arie atribuire', formula: l.binding.assignmentId, result: qty }); }
    const m = moneyOf(doc, qty, l.unitPriceMinor, l.vatBp);
    const room = l.roomId ?? 'none';
    lines.push({
      key: `manual:${l.id}`, origin: 'manual', category: l.category, description: l.description, roomShares: { [room]: 1 }, unit: l.unit,
      computedQuantity: qty, purchaseQuantity: qty, unitPriceMinor: l.unitPriceMinor, priceSource: 'user', vatBp: l.vatBp, ...m, excluded: !!l.excluded,
      trace: [...steps, { label: 'Total linie', formula: `round(${qty} × ${l.unitPriceMinor} bani)`, result: m.grossMinor, rounding: 'round' }], byRoom: { [room]: m },
    });
  }

  lines.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); // determinism: independent de ordinea cheilor din JSON
  const zero = (): Totals => ({ netMinor: 0, vatMinor: 0, grossMinor: 0 });
  const addT = (a: Totals, b: Totals): Totals => ({ netMinor: a.netMinor + b.netMinor, vatMinor: a.vatMinor + b.vatMinor, grossMinor: a.grossMinor + b.grossMinor });
  const subtotal = zero(); const perRoom: Record<string, Totals> = {};
  for (const l of lines) {
    if (l.excluded) continue;
    Object.assign(subtotal, addT(subtotal, l));
    for (const [r, t] of Object.entries(l.byRoom)) perRoom[r] = addT(perRoom[r] ?? zero(), t);
  }
  const bp = doc.settings.contingencyBp;
  const cn = roundHalfAway((subtotal.netMinor * bp) / 10000), cv = roundHalfAway((subtotal.vatMinor * bp) / 10000);
  const contingency = { netMinor: cn, vatMinor: cv, grossMinor: cn + cv };
  return { lines, perRoom, subtotal, contingency, total: addT(subtotal, contingency) };
}
