// Miniatura unui material (previzualizare în panou): aceeași textură procedurală ca în scenă, privită pe o fereastră de
// ~60 cm; suprafețele uniforme primesc un gradient discret (metal/lucios) sau un fundal pătrățos (sticlă).
import type { SurfaceLook } from '@/domain';
import { encodeBmpDataUrl } from './bmp';
import { generateTexture, textureKey, type TextureData } from './texture';

const SWATCH_PX = 64;
const WINDOW_MM = 600;
const cache = new Map<string, string>();
const baseTextures = new Map<string, TextureData>();

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

export function swatchRgba(look: SurfaceLook, px = SWATCH_PX): Uint8Array {
  const out = new Uint8Array(px * px * 4);
  const base = hex(look.baseColorHex);
  let tex: TextureData | null = null;
  if (look.texture) {
    const k = textureKey(look.texture, look.baseColorHex);
    tex = baseTextures.get(k) ?? generateTexture(look.texture, look.baseColorHex);
    baseTextures.set(k, tex);
  }
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      let c: number[] = base;
      if (tex) {
        const u = (((x / px) * WINDOW_MM) / tex.worldWidthMm) % 1;
        const v = (((y / px) * WINDOW_MM) / tex.worldHeightMm) % 1;
        const o = (Math.floor(v * tex.height) * tex.width + Math.floor(u * tex.width)) * 4;
        c = [tex.data[o]!, tex.data[o + 1]!, tex.data[o + 2]!];
      } else if (look.metalness > 0.3) {
        // reflexie stilizată: bandă luminoasă diagonală
        const t = (x + y) / (2 * px);
        const k = 1 + 0.35 * Math.exp(-Math.pow((t - 0.35) / 0.12, 2)) - 0.18 * t;
        c = base.map((b) => b * k);
      } else if (look.opacity < 1) {
        const dark = ((x >> 3) + (y >> 3)) % 2 === 0;
        const bg = dark ? 235 : 205;
        c = base.map((b) => bg * (1 - look.opacity) + b * look.opacity);
      } else if (look.roughness < 0.35) {
        const t = (x + y) / (2 * px);
        const k = 1 + 0.22 * Math.exp(-Math.pow((t - 0.3) / 0.1, 2));
        c = base.map((b) => b * k);
      }
      const o = (y * px + x) * 4;
      out[o] = Math.min(255, Math.round(c[0]!));
      out[o + 1] = Math.min(255, Math.round(c[1]!));
      out[o + 2] = Math.min(255, Math.round(c[2]!));
      out[o + 3] = 255;
    }
  return out;
}

/** `data:image/bmp` al miniaturii, memorat după cheia aspectului. */
export function swatchDataUrl(look: SurfaceLook, px = SWATCH_PX): string {
  const k = `${look.key}:${px}`;
  let url = cache.get(k);
  if (!url) {
    url = encodeBmpDataUrl(swatchRgba(look, px), px, px);
    cache.set(k, url);
  }
  return url;
}
