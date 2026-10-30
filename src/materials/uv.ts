// Coordonate de textură în spațiul lumii: scara (0,25–4) și rotația aplicării se rezolvă AICI (în UV), nu în textură,
// deci o singură textură de bază servește toate scările/rotațiile aceluiași material.
import type { ResolvedTexture } from '@/domain';
import { textureLayout } from './texture';

/** (x, y în mm pe suprafață) → (u, v). Pe podea: x, y din plan; pe perete: poziția de-a lungul peretelui și înălțimea. */
export function uvTransform(t: ResolvedTexture): (xMm: number, yMm: number) => [number, number] {
  const { worldW, worldH } = textureLayout(t);
  const rad = (t.rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad),
    s = Math.sin(rad);
  const sw = worldW * t.scale;
  const sh = worldH * t.scale;
  return (x, y) => [(x * c - y * s) / sw, (x * s + y * c) / sh];
}
