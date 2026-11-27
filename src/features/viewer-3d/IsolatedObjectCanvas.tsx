'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import { buildMesh, buildParts, type Params, type SlotLooks } from '@/catalog';
import { useResolvedTheme, type ResolvedTheme } from '@/lib/theme';

export type IsolatedViewPreset = 'perspective' | 'front' | 'side' | 'top';

export interface IsolatedCanvasProps {
  recipe: { id: string; version: number };
  /** Dimensiuni în mm. */
  sizeMm: { widthMm: number; depthMm: number; heightMm: number };
  params: Params;
  colorHex: string;
  slotLooks: SlotLooks;
  hideFronts: boolean;
  viewPreset: IsolatedViewPreset;
  viewNonce: number;
}

function PieceScene({
  recipe,
  sizeMm,
  params,
  colorHex,
  slotLooks,
  hideFronts,
  viewPreset,
  viewNonce,
  theme,
}: IsolatedCanvasProps & { theme: ResolvedTheme }) {
  const { camera, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);

  const dims = useMemo<[number, number, number]>(
    () => [sizeMm.widthMm / 1000, sizeMm.heightMm / 1000, sizeMm.depthMm / 1000],
    [sizeMm.widthMm, sizeMm.heightMm, sizeMm.depthMm],
  );

  const { geometry, materials, edges } = useMemo(() => {
    const effectiveParams: Params = hideFronts ? { ...params, _hideFronts: true } : params;
    const { parts } = buildParts(recipe, dims, effectiveParams);
    const mesh = buildMesh(parts, colorHex, slotLooks);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
    mesh.groups.forEach((grp, i) => g.addGroup(grp.start, grp.count, i));
    g.computeBoundingSphere();

    const mats = mesh.groups.map(
      (grp) =>
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: grp.roughness,
          metalness: grp.metalness,
        }),
    );
    const edgeGeo = new THREE.EdgesGeometry(g, 28);
    return { geometry: g, materials: mats, edges: edgeGeo };
  }, [recipe, dims, params, colorHex, slotLooks, hideFronts]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edges.dispose();
      for (const m of materials) m.dispose();
    };
  }, [geometry, edges, materials]);

  useEffect(() => {
    invalidate();
  }, [geometry, theme, invalidate]);

  // poziționare cameră la schimbarea presetului de vedere sau reset
  useEffect(() => {
    const [w, h, d] = dims;
    const radius = Math.max(0.6, Math.hypot(w, h, d) / 2);
    const dist = radius * 2.55;
    const cy = h / 2;
    const cam = camera as THREE.PerspectiveCamera;
    if (viewPreset === 'front') {
      cam.position.set(0, cy, dist);
    } else if (viewPreset === 'side') {
      cam.position.set(dist, cy, 0);
    } else if (viewPreset === 'top') {
      cam.position.set(0, cy + dist, dist * 0.01);
    } else {
      cam.position.set(dist * 0.65, cy + dist * 0.42, dist * 0.82);
    }
    cam.lookAt(0, cy, 0);
    cam.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.set(0, cy, 0);
      controls.current.update();
    }
    invalidate();
  }, [viewPreset, viewNonce, dims, camera, invalidate]);

  const floorSize = Math.max(4, Math.max(dims[0], dims[2]) * 2.5);

  return (
    <>
      <color attach="background" args={[theme === 'dark' ? '#171614' : '#f4f3ef']} />
      <hemisphereLight args={['#ffffff', theme === 'dark' ? '#3a3734' : '#c9c4bc', 1.1]} />
      <directionalLight position={[4, 7, 5]} intensity={1.5} />
      <directionalLight position={[-4, 4, -3]} intensity={0.6} />

      {/* Placă de studio subtilă cu grilă */}
      <mesh position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color={theme === 'dark' ? '#1e1c1a' : '#eae7e1'} roughness={0.95} />
      </mesh>
      <gridHelper
        args={[
          floorSize,
          Math.round(floorSize * 2),
          theme === 'dark' ? '#3a3733' : '#d6d2c9',
          theme === 'dark' ? '#2a2724' : '#e2dfd7',
        ]}
      />

      <group>
        <mesh geometry={geometry} material={materials} />
        <lineSegments geometry={edges}>
          <lineBasicMaterial
            color={theme === 'dark' ? '#57534e' : '#78716c'}
            transparent
            opacity={0.38}
          />
        </lineSegments>
      </group>

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={false}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={0.4}
        maxDistance={12}
      />
    </>
  );
}

export default function IsolatedObjectCanvas(props: IsolatedCanvasProps) {
  const theme = useResolvedTheme();
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [2.2, 1.8, 2.8], fov: 42 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <PieceScene {...props} theme={theme} />
    </Canvas>
  );
}
