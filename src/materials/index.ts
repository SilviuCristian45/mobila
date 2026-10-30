// Materiale: catalog încorporat, căutare, texturi procedurale, UV și miniaturi. Pur (fără React/Three/DOM).
import { finishSurfaces, type Finish, type FinishSurface } from '@/domain';
import { normalizeText } from '@/catalog';
import { BUILTIN_MATERIALS } from './catalog';

export { BUILTIN_MATERIALS, MATERIAL_CATEGORIES, type MaterialCategory } from './catalog';
export {
  TEXTURE_PX,
  generateTexture,
  textureHash,
  textureKey,
  textureLayout,
  type TextureData,
} from './texture';
export { uvTransform } from './uv';
export { encodeBmpDataUrl } from './bmp';
export { swatchDataUrl, swatchRgba } from './swatch';

const byId = new Map(BUILTIN_MATERIALS.map((m) => [m.id, m]));
export const getBuiltinMaterial = (id: string): Finish | undefined => byId.get(id);

/** Materialele compatibile cu suprafața (și, opțional, dintr-o categorie / care conțin textul), în ordinea catalogului. */
export function searchMaterials(
  query: string,
  opts: { surface?: FinishSurface | null; category?: string | null } = {},
  items: readonly Finish[] = BUILTIN_MATERIALS,
): Finish[] {
  const q = normalizeText(query);
  return items.filter(
    (m) =>
      (!opts.surface || finishSurfaces(m).includes(opts.surface)) &&
      (!opts.category || m.category === opts.category) &&
      (q === '' || normalizeText(m.name.ro).includes(q)),
  );
}

export const SURFACE_NAMES: Record<FinishSurface, string> = {
  floor: 'podea',
  wall: 'perete',
  object: 'mobilier',
};
