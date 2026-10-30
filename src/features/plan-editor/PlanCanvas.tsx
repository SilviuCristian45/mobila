'use client';

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  resolveLook,
  type GeometryModel,
  type Opening,
  type Pt,
  type ProjectDocument,
} from '@/domain';
import { formatAreaM2, formatLength } from '@/lib/format';
import type { Drag, Selection, SelectionKind, Tool, WallDraft } from './types';
import { polygonCentroid, readableAngleDeg, type Size, type View } from './view';

export interface CanvasHandlers {
  onBackgroundDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onCancel: () => void;
  onElementDown: (
    kind: SelectionKind | 'object',
    id: string,
    e: ReactPointerEvent<SVGElement>,
  ) => void;
}

interface Props {
  svgRef: RefObject<SVGSVGElement | null>;
  doc: ProjectDocument;
  geometry: GeometryModel;
  view: View;
  size: Size;
  selection: Selection;
  selectedObjectId: string | null;
  tool: Tool;
  editable: boolean;
  drag: Drag | null;
  draft: WallDraft | null;
  handlers: CanvasHandlers;
}

/** Culoarea de bază a finisajului aplicat (sau `null`): doar o reprezentare simplă, fără texturi, ca planul să rămână curat. */
function finishColor(doc: ProjectDocument, assignmentId: string | undefined): string | null {
  const a = assignmentId ? doc.finishAssignments[assignmentId] : undefined;
  const f = a ? doc.catalogSnapshot.finishes[a.finishId] : undefined;
  return f && a ? resolveLook(f, a.look).baseColorHex : null;
}

const P = (fp: { frame: { start: Pt; d: Pt; nL: Pt } }, s: number, k: number): Pt => ({
  x: fp.frame.start.x + fp.frame.d.x * s + fp.frame.nL.x * k,
  y: fp.frame.start.y + fp.frame.d.y * s + fp.frame.nL.y * k,
});
const pts = (list: readonly Pt[]): string => list.map((p) => `${p.x},${p.y}`).join(' ');
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Textul unei cote: halo alb, mărime constantă pe ecran, rotit de-a lungul laturii. */
function Label({
  at,
  text,
  zoom,
  angle = 0,
  testId,
  tone = 'dim',
}: {
  at: Pt;
  text: string;
  zoom: number;
  angle?: number;
  testId?: string;
  tone?: 'dim' | 'strong';
}) {
  const fs = (tone === 'strong' ? 13 : 11) / zoom;
  return (
    <text
      x={at.x}
      y={at.y}
      fontSize={fs}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${angle} ${at.x} ${at.y})`}
      className={tone === 'strong' ? 'fill-stone-900' : 'fill-stone-600'}
      stroke="white"
      strokeWidth={3 / zoom}
      strokeLinejoin="round"
      style={{ paintOrder: 'stroke', pointerEvents: 'none', userSelect: 'none' }}
      data-testid={testId}
    >
      {text}
    </text>
  );
}

function OpeningShape({
  o,
  fp,
  selected,
  bad,
  zoom,
  down,
}: {
  o: Opening;
  fp: NonNullable<ReturnType<GeometryModel['footprints']['get']>>;
  selected: boolean;
  bad: boolean;
  zoom: number;
  down: (e: ReactPointerEvent<SVGElement>) => void;
}) {
  const t = fp.frame.wall.thicknessMm / 2;
  const a = o.offsetMm - o.widthMm / 2;
  const b = o.offsetMm + o.widthMm / 2;
  const gap = [P(fp, a, -t), P(fp, b, -t), P(fp, b, t), P(fp, a, t)];
  const stroke = bad ? 'stroke-red-600' : selected ? 'stroke-teal-700' : 'stroke-stone-500';
  let detail: React.ReactNode = null;
  if (o.type === 'door') {
    const hingeAtStart = (o.swing?.hinge ?? 'start') === 'start';
    const hinge = P(fp, hingeAtStart ? a : b, 0);
    const jamb = P(fp, hingeAtStart ? b : a, 0);
    const side = (o.swing?.side ?? 'left') === 'left' ? 1 : -1;
    const tip = {
      x: hinge.x + fp.frame.nL.x * side * o.widthMm,
      y: hinge.y + fp.frame.nL.y * side * o.widthMm,
    };
    const cross = (tip.x - hinge.x) * (jamb.y - hinge.y) - (tip.y - hinge.y) * (jamb.x - hinge.x);
    detail = (
      <g fill="none" className={stroke} vectorEffect="non-scaling-stroke">
        <line
          x1={hinge.x}
          y1={hinge.y}
          x2={tip.x}
          y2={tip.y}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M ${tip.x} ${tip.y} A ${o.widthMm} ${o.widthMm} 0 0 ${cross > 0 ? 1 : 0} ${jamb.x} ${jamb.y}`}
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  } else {
    const l1 = [P(fp, a, -t / 3), P(fp, b, -t / 3)] as const;
    const l2 = [P(fp, a, t / 3), P(fp, b, t / 3)] as const;
    detail = (
      <g className={stroke}>
        {[l1, l2].map(([p, q], i) => (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    );
  }
  return (
    <g
      data-testid={`opening-${o.id}`}
      data-type={o.type}
      data-selected={selected}
      data-invalid={bad}
      onPointerDown={down}
      style={{ cursor: 'ew-resize' }}
    >
      <polygon
        points={pts(gap)}
        className={`fill-white ${stroke}`}
        strokeWidth={selected ? 3 : 1.5}
        vectorEffect="non-scaling-stroke"
      />
      {detail}
      {selected ? (
        <circle
          cx={P(fp, o.offsetMm, 0).x}
          cy={P(fp, o.offsetMm, 0).y}
          r={5 / zoom}
          className="fill-teal-700"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

/** Amprenta unui obiect: dreptunghi rotit (rotația e orară pe ecran), cu o linie pe latura din față și eticheta. */
function ObjectShape({
  doc,
  o,
  zoom,
  selected,
  editable,
  down,
}: {
  doc: ProjectDocument;
  o: ProjectDocument['objects'][string];
  zoom: number;
  selected: boolean;
  editable: boolean;
  down: (e: ReactPointerEvent<SVGElement>) => void;
}) {
  const item = doc.catalogSnapshot.items[o.catalogItemId];
  const label = o.name ?? item?.name.ro ?? 'Obiect';
  const w = o.size.widthMm;
  const d = o.size.depthMm;
  const suspended = item ? item.mounting !== 'floor' : false;
  const showLabel = Math.min(w, d) * zoom >= 34;
  return (
    <g
      transform={`translate(${o.position.x} ${o.position.y}) rotate(${o.rotationDeg})`}
      data-testid={`object-${o.id}`}
      data-selected={selected}
      data-item={o.catalogItemId}
      onPointerDown={down}
      style={{ cursor: editable ? 'grab' : 'pointer' }}
    >
      <rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        className={selected ? 'fill-teal-100 stroke-teal-700' : 'fill-amber-50 stroke-stone-600'}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={suspended ? `${6 / zoom} ${4 / zoom}` : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={-w / 2}
        y1={d / 2}
        x2={w / 2}
        y2={d / 2}
        className={selected ? 'stroke-teal-700' : 'stroke-stone-800'}
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
      />
      {showLabel ? (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11 / zoom}
          className="fill-stone-800"
          style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3 / zoom }}
          pointerEvents="none"
          transform={`rotate(${-o.rotationDeg})`}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Suprafața SVG a planului. Doar desenează: starea și gesturile vin de sus. Toate coordonatele sunt în mm (spațiul lume). */
export function PlanCanvas({
  svgRef,
  doc,
  geometry,
  view,
  size,
  selection,
  selectedObjectId,
  tool,
  editable,
  drag,
  draft,
  handlers,
}: Props) {
  const { zoom } = view;
  const unit = doc.settings.displayUnit;
  const valid = geometry.issues.length === 0;
  /** Amprentele pereților există (chiar dacă un gol sau o cameră are probleme): se poate desena planul complet. */
  const drawable = geometry.footprints.size === Object.keys(doc.walls).length;
  const isSel = (kind: SelectionKind, id: string) =>
    selection?.kind === kind && selection.id === id;
  const badOpenings = new Set(
    geometry.issues
      .filter((i) => i.code.startsWith('opening-'))
      .map((i) => i.path.replace('openings.', '')),
  );
  const gridMm = doc.settings.gridMm;
  const showGrid = gridMm * zoom >= 8;
  const world = {
    x: -view.panX / zoom,
    y: -view.panY / zoom,
    w: size.w / zoom,
    h: size.h / zoom,
  };
  const nodes = Object.values(doc.nodes);
  // finisaje: podeaua colorează camera; fața peretelui cu material primește o bandă colorată pe latura ei
  const floorFinish = new Map<string, string>();
  const faceFinish: Array<{ key: string; wallId: string; side: 'left' | 'right'; color: string }> =
    [];
  for (const a of Object.values(doc.finishAssignments)) {
    const c = finishColor(doc, a.id);
    if (!c) continue;
    if (a.target.kind === 'roomFloor') floorFinish.set(a.target.roomId, c);
    else if (a.target.kind === 'wallSide')
      faceFinish.push({ key: a.id, wallId: a.target.wallId, side: a.target.side, color: c });
  }
  const showEdgeDims = zoom >= 0.04;

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Planul camerelor și al pereților"
      width="100%"
      height="100%"
      viewBox={`0 0 ${size.w} ${size.h}`}
      className="block h-full w-full touch-none select-none bg-stone-50"
      style={{ cursor: tool === 'wall' ? 'crosshair' : 'default' }}
      data-testid="plan-svg"
      data-zoom={zoom}
      data-pan-x={view.panX}
      data-pan-y={view.panY}
      data-valid={valid}
      onPointerDown={handlers.onBackgroundDown}
      onPointerMove={handlers.onMove}
      onPointerUp={handlers.onUp}
      onPointerCancel={handlers.onCancel}
    >
      <defs>
        <pattern id="plan-grid" width={gridMm} height={gridMm} patternUnits="userSpaceOnUse">
          <path
            d={`M ${gridMm} 0 L 0 0 0 ${gridMm}`}
            fill="none"
            className="stroke-stone-200"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
      </defs>
      <g transform={`translate(${view.panX} ${view.panY}) scale(${zoom})`}>
        {showGrid ? (
          <rect
            x={world.x}
            y={world.y}
            width={world.w}
            height={world.h}
            fill="url(#plan-grid)"
            pointerEvents="none"
          />
        ) : null}

        {/* camere */}
        {drawable
          ? [...geometry.rooms.values()].map((r) => {
              const room = doc.rooms[r.roomId]!;
              const c = polygonCentroid(r.polygon);
              const sel = isSel('room', r.roomId);
              return (
                <g
                  key={r.roomId}
                  data-testid={`room-${r.roomId}`}
                  data-selected={sel}
                  data-floor={floorFinish.get(r.roomId) ?? ''}
                >
                  <polygon
                    points={pts(r.polygon)}
                    className={sel ? 'fill-teal-200/70' : 'fill-teal-50'}
                    onPointerDown={(e) => handlers.onElementDown('room', r.roomId, e)}
                    style={{
                      cursor: 'pointer',
                      ...(floorFinish.has(r.roomId)
                        ? { fill: floorFinish.get(r.roomId), fillOpacity: sel ? 0.8 : 0.6 }
                        : {}),
                    }}
                  />
                  <Label
                    at={{ x: c.x, y: c.y - 10 / zoom }}
                    text={room.name}
                    zoom={zoom}
                    tone="strong"
                    testId={`room-name-${r.roomId}`}
                  />
                  <Label
                    at={{ x: c.x, y: c.y + 10 / zoom }}
                    text={formatAreaM2(r.areaMm2)}
                    zoom={zoom}
                    testId={`room-area-${r.roomId}`}
                  />
                </g>
              );
            })
          : null}

        {/* pereți */}
        {drawable
          ? Object.values(doc.walls).map((w) => {
              const fp = geometry.footprints.get(w.id);
              if (!fp) return null;
              const sel = isSel('wall', w.id);
              return (
                <polygon
                  key={w.id}
                  points={pts(fp.polygon)}
                  data-testid={`wall-${w.id}`}
                  data-selected={sel}
                  className={
                    sel ? 'fill-teal-700 stroke-teal-900' : 'fill-stone-600 stroke-stone-800'
                  }
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  onPointerDown={(e) => handlers.onElementDown('wall', w.id, e)}
                  style={{ cursor: 'pointer' }}
                />
              );
            })
          : Object.values(doc.walls).map((w) => {
              // plan invalid: doar axele, în roșu, ca să se vadă UNDE e problema
              const a = doc.nodes[w.startNodeId];
              const b = doc.nodes[w.endNodeId];
              if (!a || !b) return null;
              return (
                <line
                  key={w.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  data-testid={`wall-${w.id}`}
                  data-selected={isSel('wall', w.id)}
                  className="stroke-red-600"
                  strokeWidth={isSel('wall', w.id) ? 5 : 3}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => handlers.onElementDown('wall', w.id, e)}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}

        {/* finisaje pe fețele pereților (bandă subțire pe fața interioară) */}
        {drawable
          ? faceFinish.map((f) => {
              const fp = geometry.footprints.get(f.wallId);
              if (!fp) return null;
              const side = f.side === 'left' ? fp.left : fp.right;
              const t = fp.frame.wall.thicknessMm / 2;
              const k = f.side === 'left' ? t : -t;
              const band = Math.min(40, t * 0.7) * (f.side === 'left' ? 1 : -1);
              return (
                <polygon
                  key={f.key}
                  points={pts([
                    P(fp, side.s0, k),
                    P(fp, side.s1, k),
                    P(fp, side.s1, k - band),
                    P(fp, side.s0, k - band),
                  ])}
                  fill={f.color}
                  stroke="#57534e"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  data-testid={`finish-face-${f.key}`}
                  data-color={f.color}
                />
              );
            })
          : null}

        {/* goluri */}
        {drawable
          ? Object.values(doc.openings).map((o) => {
              const fp = geometry.footprints.get(o.wallId);
              if (!fp) return null;
              return (
                <OpeningShape
                  key={o.id}
                  o={o}
                  fp={fp}
                  zoom={zoom}
                  selected={isSel('opening', o.id)}
                  bad={badOpenings.has(o.id)}
                  down={(e) => handlers.onElementDown('opening', o.id, e)}
                />
              );
            })
          : null}

        {/* obiecte (mobilier etc.): amprenta în plan, cu indicator de orientare (fața) */}
        {Object.values(doc.objects).map((o) => (
          <ObjectShape
            key={o.id}
            doc={doc}
            o={o}
            zoom={zoom}
            selected={o.id === selectedObjectId}
            editable={editable && tool === 'select'}
            down={(e) => handlers.onElementDown('object', o.id, e)}
          />
        ))}

        {/* cote: laturile interioare ale camerelor */}
        {drawable && showEdgeDims
          ? [...geometry.rooms.values()].flatMap((r) => {
              const c = polygonCentroid(r.polygon);
              return r.edges.map((e) => {
                const m = mid(e.start, e.end);
                const toC = { x: c.x - m.x, y: c.y - m.y };
                const l = Math.hypot(toC.x, toC.y) || 1;
                const off = 12 / zoom;
                return (
                  <Label
                    key={`${r.roomId}-${e.wallId}`}
                    at={{ x: m.x + (toC.x / l) * off, y: m.y + (toC.y / l) * off }}
                    text={formatLength(e.lengthMm, unit)}
                    zoom={zoom}
                    angle={readableAngleDeg(e.start, e.end)}
                    testId={`dim-${r.roomId}-${e.wallId}`}
                  />
                );
              });
            })
          : null}

        {/* cota axei peretelui selectat */}
        {drawable && selection?.kind === 'wall'
          ? (() => {
              const fp = geometry.footprints.get(selection.id);
              if (!fp) return null;
              const a = fp.frame.start;
              const b = fp.frame.end;
              const off = 22 / zoom + fp.frame.wall.thicknessMm / 2;
              const m = mid(a, b);
              return (
                <Label
                  at={{ x: m.x + fp.frame.nL.x * off, y: m.y + fp.frame.nL.y * off }}
                  text={`${formatLength(fp.frame.length, unit)} · ${formatLength(fp.frame.wall.thicknessMm, unit)}`}
                  zoom={zoom}
                  angle={readableAngleDeg(a, b)}
                  tone="strong"
                  testId="dim-selected-wall"
                />
              );
            })()
          : null}

        {/* cotele pereților incidenți nodului tras */}
        {drag?.kind === 'node'
          ? Object.values(doc.walls)
              .filter((w) => w.startNodeId === drag.nodeId || w.endNodeId === drag.nodeId)
              .map((w) => {
                const a = doc.nodes[w.startNodeId];
                const b = doc.nodes[w.endNodeId];
                if (!a || !b) return null;
                return (
                  <Label
                    key={w.id}
                    at={mid(a, b)}
                    text={formatLength(Math.hypot(b.x - a.x, b.y - a.y), unit)}
                    zoom={zoom}
                    angle={readableAngleDeg(a, b)}
                    tone="strong"
                    testId={`dim-drag-${w.id}`}
                  />
                );
              })
          : null}

        {/* previzualizarea peretelui nou */}
        {draft ? (
          <g data-testid="wall-preview" pointerEvents="none">
            <line
              x1={draft.from.x}
              y1={draft.from.y}
              x2={draft.to.x}
              y2={draft.to.y}
              className="stroke-teal-700"
              strokeWidth={
                doc.settings.defaultWallThicknessMm * zoom < 2
                  ? 2
                  : doc.settings.defaultWallThicknessMm
              }
              strokeOpacity={0.5}
              vectorEffect={
                doc.settings.defaultWallThicknessMm * zoom < 2 ? 'non-scaling-stroke' : undefined
              }
            />
            <Label
              at={{
                x: (draft.from.x + draft.to.x) / 2,
                y: (draft.from.y + draft.to.y) / 2 - 14 / zoom,
              }}
              text={formatLength(
                Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y),
                unit,
              )}
              zoom={zoom}
              tone="strong"
              testId="dim-preview"
            />
          </g>
        ) : null}

        {/* noduri */}
        {nodes.map((n) => {
          const sel = isSel('node', n.id);
          const at = drag?.kind === 'node' && drag.nodeId === n.id ? drag.to : n;
          const snap = draft?.snapNodeId === n.id;
          return (
            <circle
              key={n.id}
              cx={at.x}
              cy={at.y}
              r={(sel || snap ? 8 : 6) / zoom}
              data-testid={`node-${n.id}`}
              data-selected={sel}
              data-editable={editable}
              className={
                sel || snap
                  ? 'fill-teal-700 stroke-white'
                  : valid
                    ? 'fill-white stroke-teal-800'
                    : 'fill-white stroke-red-600'
              }
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(e) => handlers.onElementDown('node', n.id, e)}
              style={{ cursor: tool === 'select' && editable ? 'grab' : 'pointer' }}
            />
          );
        })}
      </g>
    </svg>
  );
}
