// Materiale și texturi Three.js reutilizate: o textură pentru toate aplicările aceluiași material (scara/rotația sunt în UV),
// un material pentru toate suprafețele cu același aspect. `prune` elimină (și eliberează) ce nu mai e folosit după o reconstruire.
import * as THREE from 'three';
import { stableHash, type SurfaceLook } from '@/domain';
import { generateTexture, textureKey } from '@/materials';

export interface CacheStats {
  materials: number;
  textures: number;
  texturesCreated: number;
  materialsCreated: number;
  disposed: number;
}

export class MaterialCache {
  private readonly textures = new Map<string, THREE.DataTexture>();
  private readonly materials = new Map<
    string,
    { material: THREE.MeshStandardMaterial; texture: string | null }
  >();
  private readonly used = new Set<string>();
  private texturesCreated = 0;
  private materialsCreated = 0;
  private disposed = 0;

  private texture(look: SurfaceLook): { key: string; tex: THREE.DataTexture } | null {
    const t = look.texture;
    if (!t) return null;
    const key = textureKey(t, look.baseColorHex);
    let tex = this.textures.get(key);
    if (!tex) {
      const d = generateTexture(t, look.baseColorHex);
      tex = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      this.textures.set(key, tex);
      this.texturesCreated++;
    }
    return { key, tex };
  }

  /** Materialul unei suprafețe finisate (`look`) sau, fără finisaj, culoarea implicită. */
  surface(
    look: SurfaceLook | null,
    fallbackHex: string,
    fallbackRoughness = 0.9,
  ): THREE.MeshStandardMaterial {
    const tx = look ? this.texture(look) : null;
    const body = look
      ? {
          c: look.baseColorHex,
          r: look.roughness,
          m: look.metalness,
          o: look.opacity,
          t: tx?.key ?? null,
        }
      : { c: fallbackHex, r: fallbackRoughness, m: 0, o: 1, t: null };
    const key = `m${stableHash(body)}`;
    this.used.add(key);
    if (tx) this.used.add(tx.key);
    let m = this.materials.get(key);
    if (!m) {
      const glass = body.o < 1;
      m = {
        texture: tx?.key ?? null,
        material: new THREE.MeshStandardMaterial({
          color: tx ? '#ffffff' : body.c,
          map: tx?.tex ?? null,
          roughness: body.r,
          metalness: body.m,
          transparent: glass,
          opacity: body.o,
          depthWrite: !glass,
          side: glass ? THREE.DoubleSide : THREE.FrontSide,
        }),
      };
      this.materials.set(key, m);
      this.materialsCreated++;
    }
    return m.material;
  }

  /** Material pentru o grupă a unui obiect (culorile vin din atributul de culoare pe vârf). */
  object(roughness: number, metalness: number): THREE.MeshStandardMaterial {
    const key = `o${roughness}|${metalness}`;
    this.used.add(key);
    let m = this.materials.get(key);
    if (!m) {
      m = {
        texture: null,
        material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness }),
      };
      this.materials.set(key, m);
      this.materialsCreated++;
    }
    return m.material;
  }

  /** Eliberează materialele și texturile neutilizate de la ultimul `prune`; apelat după fiecare reconstruire a scenei. */
  prune(): void {
    for (const [k, m] of this.materials)
      if (!this.used.has(k)) {
        m.material.dispose();
        this.materials.delete(k);
        this.disposed++;
      }
    for (const [k, t] of this.textures)
      if (!this.used.has(k)) {
        t.dispose();
        this.textures.delete(k);
        this.disposed++;
      }
    this.used.clear();
  }

  clear(): void {
    for (const m of this.materials.values()) m.material.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.disposed += this.materials.size + this.textures.size;
    this.materials.clear();
    this.textures.clear();
    this.used.clear();
  }

  stats(): CacheStats {
    return {
      materials: this.materials.size,
      textures: this.textures.size,
      texturesCreated: this.texturesCreated,
      materialsCreated: this.materialsCreated,
      disposed: this.disposed,
    };
  }
}
