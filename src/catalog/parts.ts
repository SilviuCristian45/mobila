import type { ObjectFinishSlot } from '@/domain';

// Geometrie procedurală ca DATE: un obiect = listă de primitive (cutie, cilindru, elipsoid). Fără Three, fără DOM:
// aceleași părți alimentează scena 3D (BufferGeometry), previzualizările SVG și testele.
// Cadrul local: metri; X = lățime, Y = în sus de la baza obiectului (0), Z = adâncime; centrul amprentei în X/Z = 0.
// Fața obiectului privește spre +Z (la rotația 0 = spre +Y în planul 2D).

export type V3 = readonly [number, number, number];
export type PartShape = 'box' | 'cylinder' | 'sphere';
/** Rol de culoare: `body` = culoarea obiectului; celelalte sunt tonuri fixe sau derivate din ea. */
export type ColorRole =
  | 'body'
  | 'accent'
  | 'light'
  | 'wood'
  | 'metal'
  | 'glass'
  | 'ceramic'
  | 'dark'
  | 'foliage'
  | 'soil'
  | 'glow';

export interface Part {
  shape: PartShape;
  /** Centrul părții, în cadrul local. */
  center: V3;
  /** Extinderea pe X, Y, Z (pentru cilindru/elipsoid: diametrele/axele elipsei, nu razele). */
  size: V3;
  color: ColorRole;
  /** Doar cilindru: axa de revoluție (implicit Y). */
  axis?: 'x' | 'y' | 'z';
  /** Doar cilindru: raportul rază capăt de sus / rază capăt de jos de-a lungul axei (implicit 1). */
  taper?: number;
}

export type Params = Readonly<Record<string, number | string | boolean>>;
export type Size3 = readonly [number, number, number];

const clampPos = (v: number): number => (v > 1e-6 ? v : 1e-6);

/**
 * Constructor de părți în „coordonate de colț”: (0,0,0) = colțul stânga-spate-jos, (w,h,d) = dreapta-față-sus.
 * Convertește în cadrul local centrat.
 */
export function builder(w: number, h: number, d: number) {
  const parts: Part[] = [];
  const add = (
    shape: PartShape,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    color: ColorRole,
    extra: { axis?: 'x' | 'y' | 'z'; taper?: number } = {},
  ) => {
    const sx = x1 - x0,
      sy = y1 - y0,
      sz = z1 - z0;
    if (sx <= 1e-6 || sy <= 1e-6 || sz <= 1e-6) return; // parte degenerată: se omite
    parts.push({
      shape,
      center: [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2, (z0 + z1) / 2 - d / 2],
      size: [clampPos(sx), clampPos(sy), clampPos(sz)],
      color,
      ...extra,
    });
  };
  return {
    parts,
    box: (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      color: ColorRole = 'body',
    ) => add('box', x0, y0, z0, x1, y1, z1, color),
    cyl: (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      color: ColorRole = 'body',
      extra: { axis?: 'x' | 'y' | 'z'; taper?: number } = {},
    ) => add('cylinder', x0, y0, z0, x1, y1, z1, color, extra),
    sph: (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      color: ColorRole = 'body',
    ) => add('sphere', x0, y0, z0, x1, y1, z1, color),
  };
}
export type Builder = ReturnType<typeof builder>;

// ───────────── culori ─────────────

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const toHex = (c: number[]): string =>
  `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
/** Amestecă `hex` cu alb (t>0) sau negru (t<0). */
export function shade(hex: string, t: number): string {
  const rgb = hexToRgb(hex);
  const target = t >= 0 ? 255 : 0;
  return toHex(rgb.map((v) => v + (target - v) * Math.abs(t)));
}

const FIXED: Record<Exclude<ColorRole, 'body' | 'accent' | 'light'>, string> = {
  wood: '#a67c52',
  metal: '#9aa0a6',
  glass: '#b9d4e3',
  ceramic: '#f3f3f1',
  dark: '#3b3b3f',
  foliage: '#4f8a4b',
  soil: '#5b4636',
  glow: '#fff1c2',
};

/** Culoarea unui rol, derivată din culoarea corpului `bodyHex` (#rrggbb). */
export function roleColor(role: ColorRole, bodyHex: string): string {
  if (role === 'body') return bodyHex;
  if (role === 'accent') return shade(bodyHex, -0.16);
  if (role === 'light') return shade(bodyHex, 0.25);
  return FIXED[role];
}

// ───────────── finisaje pe zone ─────────────

/** Aspectul unei zone finisate (din materialul aplicat): culoare, rugozitate, metalicitate. */
export interface SlotLook {
  hex: string;
  roughness: number;
  metalness: number;
}
export type SlotLooks = Partial<Record<ObjectFinishSlot, SlotLook>>;

/** Zona finisabilă căreia îi aparține un rol de culoare (rolurile fixe — sticlă, ceramică, picioare etc. — nu se finisează). */
export function slotOfRole(role: ColorRole): ObjectFinishSlot | null {
  switch (role) {
    case 'body':
    case 'light':
      return 'body';
    case 'accent':
      return 'front';
    case 'wood':
      return 'top';
    case 'metal':
      return 'metal';
    default:
      return null;
  }
}

/** Zonele finisabile ale unui obiect = cele pe care le folosesc efectiv părțile rețetei (fără duplicarea logicii pe rețete). */
export function slotsOfParts(parts: readonly Part[]): ObjectFinishSlot[] {
  const order: ObjectFinishSlot[] = ['body', 'front', 'top', 'metal'];
  const used = new Set(
    parts.map((p) => slotOfRole(p.color)).filter((s): s is ObjectFinishSlot => s !== null),
  );
  return order.filter((s) => used.has(s));
}

const DEFAULT_MATERIAL: Partial<Record<ColorRole, { roughness: number; metalness: number }>> = {
  metal: { roughness: 0.35, metalness: 0.8 },
  ceramic: { roughness: 0.25, metalness: 0 },
  glass: { roughness: 0.1, metalness: 0.1 },
  glow: { roughness: 0.6, metalness: 0 },
};

/**
 * Materialul unui rol: culoarea, rugozitatea și metalicitatea. O zonă finisată înlocuiește culoarea (și proprietățile)
 * rolurilor ei; `light` și `accent` rămân derivate din corp dacă zona lor nu are finisaj propriu.
 */
export function roleMaterial(role: ColorRole, bodyHex: string, slots: SlotLooks = {}): SlotLook {
  const bodyLook = slots.body;
  const body = bodyLook?.hex ?? bodyHex;
  const bodyMat = { roughness: bodyLook?.roughness ?? 0.8, metalness: bodyLook?.metalness ?? 0 };
  const slot = slotOfRole(role);
  const own = slot ? slots[slot] : undefined;
  if (role === 'body') return { hex: body, ...bodyMat };
  if (role === 'light') return { hex: shade(body, 0.25), ...bodyMat };
  if (own) return { hex: own.hex, roughness: own.roughness, metalness: own.metalness };
  if (role === 'accent') return { hex: shade(body, -0.16), ...bodyMat };
  return {
    hex: roleColor(role, body),
    ...(DEFAULT_MATERIAL[role] ?? { roughness: 0.8, metalness: 0 }),
  };
}

// ───────────── extinderi ─────────────

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}
/** Cutia care cuprinde toate părțile (exactă pentru cutii, cilindri și elipsoizi aliniați la axe). */
export function partsBounds(parts: readonly Part[]): Bounds | null {
  if (parts.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of parts)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p.center[i]! - p.size[i]! / 2);
      max[i] = Math.max(max[i]!, p.center[i]! + p.size[i]! / 2);
    }
  return { min, max };
}
