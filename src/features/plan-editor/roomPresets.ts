// Camerele predefinite din paletă (dimensiuni interioare, mm). Doar valori de pornire: după plasare se editează în panou.
import type { Pt } from '@/domain';
import type { RoomPreset } from './types';

export const ROOM_PRESETS: readonly RoomPreset[] = [
  { id: 'living', label: 'Living', type: 'living', widthMm: 5000, depthMm: 4000 },
  { id: 'bedroom', label: 'Dormitor', type: 'bedroom', widthMm: 4000, depthMm: 3500 },
  { id: 'kitchen', label: 'Bucătărie', type: 'kitchen', widthMm: 3000, depthMm: 3000 },
  { id: 'bathroom', label: 'Baie', type: 'bathroom', widthMm: 2000, depthMm: 2500 },
  { id: 'hall', label: 'Hol', type: 'hall', widthMm: 3000, depthMm: 1500 },
  { id: 'office', label: 'Birou', type: 'office', widthMm: 3000, depthMm: 2500 },
  { id: 'other', label: 'Cameră liberă', type: 'other', widthMm: 4000, depthMm: 3000 },
  {
    id: 'living-l',
    label: 'Living în L',
    type: 'living',
    widthMm: 6000,
    depthMm: 5000,
    notch: { widthMm: 2500, depthMm: 2000 },
  },
  {
    id: 'other-l',
    label: 'Cameră în L',
    type: 'other',
    widthMm: 4500,
    depthMm: 4000,
    notch: { widthMm: 1800, depthMm: 1500 },
  },
];

/** Poligonul interior (orar pe ecran) al unui L în orientarea de bază: caseta fără colțul de nord-est. */
function lPolygon(w: number, d: number, cw: number, cd: number): Pt[] {
  return [
    { x: 0, y: 0 },
    { x: w - cw, y: 0 },
    { x: w - cw, y: cd },
    { x: w, y: cd },
    { x: w, y: d },
    { x: 0, y: d },
  ];
}

/** Rotește poligonul cu `turns` sferturi orare și îl readuce cu colțul casetei în (0, 0). */
function turn(points: Pt[], turns: number): Pt[] {
  let pts = points;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) pts = pts.map((p) => ({ x: -p.y, y: p.x }));
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/** Presetul în orientarea cerută (`turns` sferturi orare): la dreptunghi se inversează dimensiunile la rotire impară. */
export function orient(p: RoomPreset, turns: number): RoomPreset {
  const k = ((turns % 4) + 4) % 4;
  if (!p.notch) return k % 2 === 1 ? { ...p, widthMm: p.depthMm, depthMm: p.widthMm } : p;
  const base = p.base ?? { widthMm: p.widthMm, depthMm: p.depthMm };
  const pts = turn(lPolygon(base.widthMm, base.depthMm, p.notch.widthMm, p.notch.depthMm), k);
  return {
    ...p,
    turns: k,
    base,
    widthMm: Math.max(...pts.map((q) => q.x)),
    depthMm: Math.max(...pts.map((q) => q.y)),
  };
}

/** Poligonul interior al presetului orientat, cu colțul casetei în (0, 0). */
export function roomShape(p: RoomPreset): Pt[] {
  if (!p.notch) {
    return [
      { x: 0, y: 0 },
      { x: p.widthMm, y: 0 },
      { x: p.widthMm, y: p.depthMm },
      { x: 0, y: p.depthMm },
    ];
  }
  const base = p.base ?? { widthMm: p.widthMm, depthMm: p.depthMm };
  return turn(lPolygon(base.widthMm, base.depthMm, p.notch.widthMm, p.notch.depthMm), p.turns ?? 0);
}
