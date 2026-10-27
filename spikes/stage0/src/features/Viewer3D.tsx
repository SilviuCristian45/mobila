'use client';
// SPIKE — vizualizare 3D cu R3F din SceneDescription (nu din document).
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SceneDescription } from '@/domain/scene';

export interface Viewer3DApi {
  stats: () => { meshes: number; geometries: number; paintedRatio: number };
  topView: () => void;
  sampleAt: (world: [number, number, number]) => { r: number; g: number; b: number } | null;
}

function shapeFrom(poly: Array<{ x: number; y: number }>): THREE.Shape {
  // plan (x, y) → shape (x, −y) apoi rotație −90° pe X: (x, y_s, z) → (x, z, −y_s) = (x, z, planY)
  return new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x / 1000, -p.y / 1000)));
}

function Scene({ scene, flat, onReady }: { scene: SceneDescription; flat: boolean; onReady: (a: Viewer3DApi) => void }) {
  const { gl, camera, scene: three, invalidate, size } = useThree();
  const prisms = useMemo(() => scene.prisms.map((p) => ({ id: p.id, geo: new THREE.ExtrudeGeometry(shapeFrom(p.polygon), { depth: (p.y1 - p.y0) / 1000, bevelEnabled: false }), y: p.y0 / 1000 })), [scene]);
  const floors = useMemo(() => scene.floors.map((f) => ({ id: f.id, geo: new THREE.ShapeGeometry(shapeFrom(f.polygon)), color: f.colorHex })), [scene]);
  useEffect(() => () => { prisms.forEach((p) => p.geo.dispose()); floors.forEach((f) => f.geo.dispose()); }, [prisms, floors]);
  useEffect(() => { invalidate(); }, [flat, scene, invalidate]);
  useEffect(() => {
    onReady({
      stats: () => {
        let meshes = 0; three.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
        const c = document.createElement('canvas'); c.width = gl.domElement.width; c.height = gl.domElement.height;
        const ctx = c.getContext('2d')!; ctx.drawImage(gl.domElement, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data; let painted = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0 && (d[i]! + d[i + 1]! + d[i + 2]!) > 0) painted++;
        return { meshes, geometries: gl.info.memory.geometries, paintedRatio: painted / (c.width * c.height) };
      },
      topView: () => {
        const cam = camera as THREE.PerspectiveCamera;
        cam.position.set(3.5, 14, 1.5); cam.up.set(0, 0, -1); cam.lookAt(3.5, 0, 1.5); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); gl.render(three, camera);
      },
      sampleAt: (w) => {
        gl.render(three, camera);
        const v = new THREE.Vector3(...w).project(camera);
        const px = Math.round(((v.x + 1) / 2) * gl.domElement.width), py = Math.round(((1 - v.y) / 2) * gl.domElement.height);
        const c = document.createElement('canvas'); c.width = gl.domElement.width; c.height = gl.domElement.height;
        const ctx = c.getContext('2d')!; ctx.drawImage(gl.domElement, 0, 0);
        const d = ctx.getImageData(px, py, 1, 1).data; return { r: d[0]!, g: d[1]!, b: d[2]! };
      },
    });
  }, [gl, camera, three, onReady, size]);
  const Mat = flat ? 'meshBasicMaterial' : 'meshStandardMaterial';
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      {prisms.map((p) => <mesh key={p.id} geometry={p.geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, p.y, 0]}><Mat color="#d6d3d1" toneMapped={!flat} /></mesh>)}
      {floors.map((f) => <mesh key={f.id} geometry={f.geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}><Mat color={f.color} side={THREE.DoubleSide} toneMapped={!flat} /></mesh>)}
      {scene.boxes.map((b) => (
        <mesh key={b.id} position={b.center} rotation={[0, b.rotationY, 0]}><boxGeometry args={b.size} /><Mat color={b.colorHex} toneMapped={!flat} /></mesh>
      ))}
      <OrbitControls makeDefault target={[3.5, 0, 1.5]} />
    </>
  );
}

export default function Viewer3D({ scene, width, height, flat, onReady }: { scene: SceneDescription; width: number; height: number; flat: boolean; onReady: (a: Viewer3DApi) => void }) {
  return (
    <div style={{ width, height }} data-testid="viewer3d">
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3.5, 8, 9], fov: 45 }} gl={{ preserveDrawingBuffer: true, antialias: false }}>
        <Scene scene={scene} flat={flat} onReady={onReady} />
      </Canvas>
    </div>
  );
}
