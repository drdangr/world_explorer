"use client";

import type { CSSProperties } from "react";

import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  type EdgeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 88;

export function FloatingEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    markerEnd,
    label,
    labelStyle,
    labelBgStyle,
    labelShowBg,
    labelBgPadding,
    labelBgBorderRadius,
    interactionWidth,
    style,
    animated,
  } = props;

  const { getNode } = useReactFlow();

  const sourceNode = getNode(source);
  const targetNode = getNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePosition, targetPosition } = getEdgeParams(sourceNode, targetNode);

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition,
  });

  const edgeClassName = animated
    ? "react-flow__edge-path react-flow__edge-path-animated"
    : "react-flow__edge-path";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
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
  labelBgPadding: [number, number] = [4, 4],
  labelBgBorderRadius = 4,
) {
  const base: CSSProperties = {
    position: "absolute",
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    pointerEvents: "all",
    padding: `${labelBgPadding[1]}px ${labelBgPadding[0]}px`,
    borderRadius: labelBgBorderRadius,
  };

  if (labelShowBg) {
    Object.assign(
      base,
      { background: "rgba(15,23,42,0.85)", border: "1px solid rgba(148,163,184,0.4)" },
      labelBgStyle,
    );
  }

  return { ...base, ...labelStyle } satisfies CSSProperties;
}

function getEdgeParams(source: Node, target: Node) {
  const sourceRect = getNodeRect(source);
  const targetRect = getNodeRect(target);

  const sourceCenter = getRectCenter(sourceRect);
  const targetCenter = getRectCenter(targetRect);

  const sourceIntersectionPoint = getEdgeIntersection(sourceRect, sourceCenter, targetCenter);
  const targetIntersectionPoint = getEdgeIntersection(targetRect, targetCenter, sourceCenter);

  const diffX = targetCenter.x - sourceCenter.x;
  const diffY = targetCenter.y - sourceCenter.y;

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePosition: getClosestPosition(diffX, diffY),
    targetPosition: getClosestPosition(-diffX, -diffY),
  };
}

function getNodeRect(node: Node) {
  const width = node.width ?? node.measured?.width ?? DEFAULT_NODE_WIDTH;
  const height = node.height ?? node.measured?.height ?? DEFAULT_NODE_HEIGHT;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const position = (node as any).computed?.positionAbsolute ?? (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };

  return {
    x: position.x,
    y: position.y,
    width,
    height,
  };
}

function getRectCenter(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function getEdgeIntersection(
  rect: { x: number; y: number; width: number; height: number },
  rectCenter: { x: number; y: number },
  targetPoint: { x: number; y: number },
) {
  const dx = targetPoint.x - rectCenter.x;
  const dy = targetPoint.y - rectCenter.y;

  if (dx === 0 && dy === 0) {
    return { x: rectCenter.x, y: rectCenter.y };
  }

  const w = rect.width / 2;
  const h = rect.height / 2;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let x = rectCenter.x;
  let y = rectCenter.y;

  if (absDx > absDy) {
    const sign = dx > 0 ? 1 : -1;
    x = rectCenter.x + sign * w;
    y = rectCenter.y + (dy / absDx) * w * sign;
  } else {
    const sign = dy > 0 ? 1 : -1;
    y = rectCenter.y + sign * h;
    x = rectCenter.x + (dx / absDy) * h * sign;
  }

  return { x, y };
}

function getClosestPosition(diffX: number, diffY: number): Position {
  const absDx = Math.abs(diffX);
  const absDy = Math.abs(diffY);

  if (absDx > absDy) {
    return diffX > 0 ? Position.Right : Position.Left;
  }

  return diffY > 0 ? Position.Bottom : Position.Top;
}
