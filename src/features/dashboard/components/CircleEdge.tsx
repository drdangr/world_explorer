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

  const endMarkerId = `edge-end-${id}`;
  const startMarkerId = `edge-start-${id}`;
  const arrowColor = "rgba(148, 163, 184, 0.6)";

  return (
    <>
      <defs>
        <marker
          id={endMarkerId}
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 0 L 12 6 L 0 12 z" fill={arrowColor} />
        </marker>
        {bidirectional && (
          <marker
            id={startMarkerId}
            viewBox="0 0 12 12"
            refX="2"
            refY="6"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 12 0 L 0 6 L 12 12 z" fill={arrowColor} />
          </marker>
        )}
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerStart={bidirectional ? `url(#${startMarkerId})` : undefined}
        markerEnd={`url(#${endMarkerId})`}
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
  // Используем positionAbsolute если доступно, иначе position
  const position = node.positionAbsolute || node.position || { x: 0, y: 0 };
  // Для кастомных нод ширина/высота может быть в node.width/height или в style
  const nodeWidth = node.width || radius * 2;
  const nodeHeight = node.height || radius * 2;
  
  return {
    x: position.x + nodeWidth / 2,
    y: position.y + nodeHeight / 2,
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

