'use client';
// Canvas-ul R3F. Se încarcă exclusiv pe client (lazy, după montare) — vezi Viewer3D.tsx.
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import type { FinishTarget, SceneDescription } from '@/domain';
import {
  type CameraPose,
  EDGE_COLOR,
  GeometryCache,
  WALL_COLOR,
  buildSceneObjects,
  frameCamera,
  surfaceOutline,
} from './sceneObjects';
import { MaterialCache } from './materialCache';

const SELECT_COLOR = '#0f766e';

const FOV = 45;

export interface SceneStats {
  walls: number;
  floors: number;
  objects: number;
}

interface Props {
  scene: SceneDescription;
  resetNonce: number;
  onStats?: (s: SceneStats) => void;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  /** Suprafața selectată (podea sau față de perete), conturată în scenă; clic pe o suprafață o selectează. */
  selectedSurface?: FinishTarget | null;
  onSelectSurface?: (s: FinishTarget | null) => void;
  /** Pentru teste/măsurători: statistici ale cache-ului de materiale. */
  onCache?: (c: MaterialCache) => void;
}

function applyPose(cam: THREE.PerspectiveCamera, p: CameraPose) {
  cam.position.set(...p.position);
  cam.near = p.near;
  cam.far = p.far;
  cam.lookAt(...p.target);
  cam.updateProjectionMatrix();
}

function Scene({
  scene,
  resetNonce,
  onStats,
  selectedObjectId = null,
  onSelectObject,
  selectedSurface = null,
  onSelectSurface,
  onCache,
}: Props) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [cache] = useState(() => new GeometryCache());
  const objects = useMemo(() => buildSceneObjects(scene, cache), [scene, cache]);
  useEffect(() => () => objects.dispose(), [objects]);
  useEffect(() => () => cache.clear(), [cache]);
  // materiale Three partajate; ce nu mai e folosit după reconstruire se eliberează (fără scurgeri la înlocuirea materialelor)
  const [materials] = useState(() => new MaterialCache());
  useEffect(() => () => materials.clear(), [materials]);
  useEffect(() => onCache?.(materials), [materials, onCache]);
  const mats = useMemo(
    () => ({
      walls: new Map(
        objects.walls.map((w) => [
          w.id,
          [
            materials.surface(w.left ? (scene.looks[w.left] ?? null) : null, WALL_COLOR),
            materials.surface(w.right ? (scene.looks[w.right] ?? null) : null, WALL_COLOR),
            materials.surface(null, WALL_COLOR),
          ],
        ]),
      ),
      floors: new Map(
        objects.floors.map((f) => [
          f.id,
          materials.surface(f.look ? (scene.looks[f.look] ?? null) : null, f.colorHex, 0.85),
        ]),
      ),
      objects: new Map(
        objects.objects.map((o) => [
          o.id,
          o.materials.map((m) => materials.object(m.roughness, m.metalness)),
        ]),
      ),
    }),
    [objects, materials, scene.looks],
  );
  useEffect(() => {
    materials.prune();
    invalidate();
  }, [mats, materials, invalidate]);
  const outline = useMemo(() => {
    const seg = surfaceOutline(scene, selectedSurface);
    if (!seg) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seg, 3));
    return g;
  }, [scene, selectedSurface]);
  useEffect(() => () => outline?.dispose(), [outline]);
  const selected = objects.objects.find((o) => o.id === selectedObjectId) ?? null;
  const selectionEdges = useMemo(() => {
    if (!selected) return null;
    const box = new THREE.BoxGeometry(...selected.size);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [selected]);
  useEffect(() => () => selectionEdges?.dispose(), [selectionEdges]);

  // încadrare la prima scenă nevidă și la fiecare „Resetează vederea”; editările ulterioare NU mută camera
  const framed = useRef<{ nonce: number; hadBounds: boolean } | null>(null);
  // canvas-ul se măsoară asincron: încadrarea cu o dimensiune încă 0×0 ar da un aspect greșit
  const measured = size.width > 0 && size.height > 0;
  useEffect(() => {
    if (!measured) return;
    const has = objects.bounds !== null;
    const prev = framed.current;
    if (!prev || prev.nonce !== resetNonce || (has && !prev.hadBounds)) {
      const p = frameCamera(objects.bounds, FOV, size.width / size.height);
      applyPose(camera as THREE.PerspectiveCamera, p);
      const c = controls.current;
      if (c) {
        c.target.set(...p.target);
        c.maxDistance = p.maxDistance;
        c.update();
      }
      framed.current = { nonce: resetNonce, hadBounds: has };
    }
    invalidate();
    // size: citit doar la momentul încadrării; redimensionarea nu trebuie să mute camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, resetNonce, measured]);

  useEffect(() => {
    onStats?.({
      walls: objects.walls.length,
      floors: objects.floors.length,
      objects: objects.objects.length,
    });
  }, [objects, onStats]);

  return (
    <>
      <color attach="background" args={['#f5f5f4']} />
      <hemisphereLight args={['#ffffff', '#a8a29e', 1.1]} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} />
      <directionalLight position={[-5, 6, -6]} intensity={0.6} />
      {objects.floors.map((f) => (
        <mesh
          key={f.id}
          geometry={f.geometry}
          material={mats.floors.get(f.id)}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            onSelectSurface?.({ kind: 'roomFloor', roomId: f.roomId });
          }}
        />
      ))}
      {objects.walls.map((w) => (
        <group key={w.id} position={[0, w.y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh
            geometry={w.geometry}
            material={mats.walls.get(w.id)}
            onClick={(e) => {
              if (e.delta > 4) return;
              // grupele geometriei: 0 = fața stângă, 1 = dreapta; capetele/sus/jos nu sunt suprafețe finisabile
              const g = e.face?.materialIndex;
              if (g !== 0 && g !== 1) return;
              e.stopPropagation();
              onSelectSurface?.({
                kind: 'wallSide',
                wallId: w.wallId,
                side: g === 0 ? 'left' : 'right',
              });
            }}
          />
          <lineSegments geometry={w.edges}>
            <lineBasicMaterial color={EDGE_COLOR} />
          </lineSegments>
        </group>
      ))}
      {objects.objects.map((o) => (
        <mesh
          key={o.id}
          geometry={o.geometry}
          position={o.position}
          rotation={[0, o.rotationY, 0]}
          material={mats.objects.get(o.id)}
          userData={{ objectId: o.id }}
          onClick={(e) => {
            if (e.delta > 4) return; // tragere de cameră, nu clic
            e.stopPropagation();
            onSelectObject?.(o.id);
          }}
        />
      ))}
      {outline ? (
        <lineSegments geometry={outline}>
          <lineBasicMaterial color={SELECT_COLOR} depthTest={false} />
        </lineSegments>
      ) : null}
      {selected && selectionEdges ? (
        <lineSegments
          geometry={selectionEdges}
          position={[
            selected.position[0],
            selected.position[1] + selected.size[1] / 2,
            selected.position[2],
          ]}
          rotation={[0, selected.rotationY, 0]}
        >
          <lineBasicMaterial color={SELECT_COLOR} depthTest={false} />
        </lineSegments>
      ) : null}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={false}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={0.5}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </>
  );
}

export default function ViewerCanvas(props: Props) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [6, 6, 8], fov: FOV }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => {
        props.onSelectObject?.(null);
        props.onSelectSurface?.(null);
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
