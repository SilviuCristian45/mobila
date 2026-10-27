'use client';
// SPIKE — editor 2D minimal cu React Konva: camere, pereți (amprente cu îmbinări), goluri, obiecte, noduri trase.
import Konva from 'konva';
import { useMemo, useRef } from 'react';
import { Circle, Layer, Line, Rect, Stage } from 'react-konva';
import { computeJoins, interiorPolygon, wallFootprint } from '@/domain/geometry';
import type { ProjectDocument } from '@/domain/schema';

export interface Editor2DApi { stats: () => { shapes: number; paintedRatio: number; scale: number }; setViewport: (scale: number, x: number, y: number) => void }

export default function Editor2D({ doc, width, height, onMoveNode, onReady }: {
  doc: ProjectDocument; width: number; height: number; onMoveNode: (id: string, x: number, y: number) => void; onReady: (api: Editor2DApi) => void;
}) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const geo = useMemo(() => {
    const joins = computeJoins(doc);
    return {
      floors: Object.keys(doc.rooms).map((id) => ({ id, pts: interiorPolygon(doc, id).flatMap((p) => [p.x, p.y]) })),
      walls: Object.values(doc.walls).map((w) => ({ id: w.id, pts: wallFootprint(doc, joins, w).polygon.flatMap((p) => [p.x, p.y]) })),
    };
  }, [doc]);
  const xs = Object.values(doc.nodes).map((n) => n.x), ys = Object.values(doc.nodes).map((n) => n.y);
  const minX = Math.min(...xs) - 500, minY = Math.min(...ys) - 500;
  const fit = Math.min(width / (Math.max(...xs) + 500 - minX), height / (Math.max(...ys) + 500 - minY)); // px per mm
  const initial = useRef({ scale: fit, x: -minX * fit, y: -minY * fit });

  return (
    <Stage
      width={width} height={height} scaleX={initial.current.scale} scaleY={initial.current.scale} x={initial.current.x} y={initial.current.y}
      ref={(s) => {
        stageRef.current = s;
        if (s) onReady({
          stats: () => {
            const c = s.toCanvas(); const ctx = c.getContext('2d')!; const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let painted = 0; for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) painted++;
            return { shapes: s.find('Line, Rect, Circle').length, paintedRatio: painted / (c.width * c.height), scale: s.scaleX() };
          },
          setViewport: (scale, x, y) => { s.scale({ x: scale, y: scale }); s.position({ x, y }); s.batchDraw(); },
        });
      }}
    >
      <Layer listening={false}>
        {geo.floors.map((f) => <Line key={f.id} points={f.pts} closed fill="#e6dfd2" />)}
        {geo.walls.map((w) => <Line key={w.id} points={w.pts} closed fill="#444" />)}
        {Object.values(doc.openings).map((o) => {
          const w = doc.walls[o.wallId]!; const a = doc.nodes[w.startNodeId]!, b = doc.nodes[w.endNodeId]!;
          const L = Math.hypot(b.x - a.x, b.y - a.y); const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
          const p0 = { x: a.x + dx * (o.offsetMm - o.widthMm / 2), y: a.y + dy * (o.offsetMm - o.widthMm / 2) };
          const p1 = { x: a.x + dx * (o.offsetMm + o.widthMm / 2), y: a.y + dy * (o.offsetMm + o.widthMm / 2) };
          return <Line key={o.id} points={[p0.x, p0.y, p1.x, p1.y]} stroke={o.type === 'door' ? '#d97706' : '#38bdf8'} strokeWidth={w.thicknessMm * 0.6} />;
        })}
        {Object.values(doc.objects).map((o) => (
          <Rect key={o.id} x={o.position.x} y={o.position.y} offsetX={o.size.widthMm / 2} offsetY={o.size.depthMm / 2} width={o.size.widthMm} height={o.size.depthMm}
            rotation={o.rotationDeg} fill={doc.catalogSnapshot.items[o.catalogItemId]?.defaultColorHex ?? '#bbbbbb'} opacity={0.9} />
        ))}
      </Layer>
      <Layer>
        {Object.values(doc.nodes).map((n) => (
          <Circle key={n.id} id={`node-${n.id}`} x={n.x} y={n.y} radius={80} fill="#0d9488" draggable
            onDragEnd={(e) => { const x = Math.round(e.target.x() / 10) * 10, y = Math.round(e.target.y() / 10) * 10; onMoveNode(n.id, x, y); }} />
        ))}
      </Layer>
    </Stage>
  );
}
