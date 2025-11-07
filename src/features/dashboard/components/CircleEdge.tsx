"use client";

import type { CSSProperties } from "react";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";

export function CircleEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    label,
    labelStyle,
    labelBgStyle,
    labelShowBg,
    labelBgPadding,
    labelBgBorderRadius,
    interactionWidth,
    style,
    animated,
    data,
  } = props;

  const { getNode } = useReactFlow();

  const sourceNode = getNode(source);
  const targetNode = getNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const radius = (data?.radius as number) ?? 80;
  const bidirectional = (data?.bidirectional as boolean) ?? false;

  const sourceCenter = getNodeCenter(sourceNode, radius);
  const targetCenter = getNodeCenter(targetNode, radius);

  const { sx, sy } = getCircleIntersection(sourceCenter, targetCenter, radius);
  const { sx: tx, sy: ty } = getCircleIntersection(targetCenter, sourceCenter, radius);

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  const edgeClassName = animated
    ? "react-flow__edge-path react-flow__edge-path-animated"
    : "react-flow__edge-path";

  const arrowId = `arrow-${id}`;

  return (
    <>
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148, 163, 184, 0.6)" />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerStart={bidirectional ? `url(#${arrowId})` : undefined}
        markerEnd={`url(#${arrowId})`}
        style={style}
        className={edgeClassName}
        interactionWidth={interactionWidth}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={getLabelStyle(
              labelX,
              labelY,
              labelStyle,
              labelBgStyle,
              labelShowBg,
              labelBgPadding,
              labelBgBorderRadius,
            )}
            className="text-xs text-slate-200"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function getLabelStyle(
  x: number,
  y: number,
  labelStyle?: CSSProperties,
  labelBgStyle?: CSSProperties,
  labelShowBg?: boolean,
  labelBgPadding: [number, number] = [6, 3],
  labelBgBorderRadius = 4,
) {
  const base: CSSProperties = {
    position: "absolute",
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    pointerEvents: "all",
    padding: `${labelBgPadding[1]}px ${labelBgPadding[0]}px`,
    borderRadius: labelBgBorderRadius,
  };

  if (labelShowBg !== false) {
    Object.assign(
      base,
      {
        background: "rgba(15,23,42,0.92)",
        border: "1px solid rgba(148,163,184,0.4)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      },
      labelBgStyle,
    );
  }

  return { ...base, ...labelStyle } satisfies CSSProperties;
}

function getNodeCenter(node: Node, radius: number) {
  const position = node.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  return {
    x: position.x + radius,
    y: position.y + radius,
  };
}

function getCircleIntersection(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) {
    return { sx: from.x, sy: from.y };
  }

  const ratio = radius / distance;

  return {
    sx: from.x + dx * ratio,
    sy: from.y + dy * ratio,
  };
}

