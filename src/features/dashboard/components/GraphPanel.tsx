"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Edge, Node, OnNodesChange, ReactFlowInstance } from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";
import { useGameStore } from "@/store/gameStore";
import type { LocationNode } from "@/types/game";
import {
  GraphLayoutEngine,
  type GraphNode as LayoutNode,
  type GraphLink,
  type GraphLayoutOptions,
} from "../utils/graphLayout";

import { CircleEdge } from "./CircleEdge";
import { CircleNode } from "./CircleNode";

const NODE_RADIUS = 80;
const FORCE_LINK_DISTANCE = 260;
const FORCE_NODE_CHARGE = -1400;

const NODE_TYPES = {
  circle: CircleNode,
};

const EDGE_TYPES = {
  circle: CircleEdge,
};

export function GraphPanel() {
  const [layoutMode, setLayoutMode] = useState<"entry" | "player">("entry");
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 1024, height: 768 });

  const engineRef = useRef<GraphLayoutEngine | null>(null);
  const latestGraphDataRef = useRef<{
    nodes: LayoutNode[];
    links: GraphLink[];
    options: GraphLayoutOptions;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const hasInitializedRef = useRef(false);
  const lastWorldIdForInitRef = useRef<string | null>(null);
  const fitViewTimeoutRef = useRef<number | null>(null);
  const isInitializingRef = useRef(false);

  const worlds = useGameStore((state) => state.worlds);
  const currentWorldId = useGameStore((state) => state.currentWorldId);
  const characters = useGameStore((state) => state.characters);
  const currentCharacterId = useGameStore((state) => state.currentCharacterId);

  const currentWorld = useMemo(
    () => worlds.find((world) => world.id === currentWorldId) ?? null,
    [currentWorldId, worlds],
  );

  const currentCharacter = useMemo(
    () => characters.find((character) => character.id === currentCharacterId) ?? null,
    [characters, currentCharacterId],
  );

  const playerLocationId = currentCharacter?.currentLocationId ?? null;
  const canUsePlayerCenter = Boolean(
    currentWorld && playerLocationId && currentWorld.graph[playerLocationId],
  );

  // Следим за размерами контейнера
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({
        width: Math.max(rect.width, 640),
        height: Math.max(rect.height, 480),
      });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const mapLayoutToNodes = useCallback(
    (layoutNodes: LayoutNode[]) => {
      setFlowNodes(
        layoutNodes.map((node) => ({
          id: node.id,
          type: "circle",
          position: {
            x: (node.x ?? containerSize.width / 2) - NODE_RADIUS,
            y: (node.y ?? containerSize.height / 2) - NODE_RADIUS,
          },
          width: NODE_RADIUS * 2,
          height: NODE_RADIUS * 2,
          data: {
            label: node.label,
            radius: NODE_RADIUS,
            mapDescription: node.mapDescription ?? "Описание ещё не задано.",
            isEntry: Boolean(node.isEntry),
            isPlayerHere: Boolean(node.isPlayerHere),
          },
          draggable: true,
          selectable: true,
          className: "draggable-node",
        })),
      );
    },
    [containerSize.height, containerSize.width],
  );

  // Основной пересчёт графа при изменении данных/режима
  useEffect(() => {
    if (!currentWorld) {
      setFlowNodes([]);
      setFlowEdges([]);
      engineRef.current?.stop();
      engineRef.current = null;
      latestGraphDataRef.current = null;
      return;
    }

    const graph = currentWorld.graph ?? {};
    const locations = Object.values(graph);

    if (locations.length === 0) {
      setFlowNodes([]);
      setFlowEdges([]);
      return;
    }

    const fallbackCenterId = locations[0]?.id ?? null;
    const entryCenterId = graph[currentWorld.entryLocationId]
      ? currentWorld.entryLocationId
      : fallbackCenterId;

    const playerCenterId = playerLocationId && graph[playerLocationId]
      ? playerLocationId
      : entryCenterId;

    const centerId = layoutMode === "player" ? playerCenterId : entryCenterId;

    const { flowEdges: nextEdges, links } = buildEdges(locations, layoutMode);
    setFlowEdges(nextEdges);

    const layoutNodes: LayoutNode[] = locations.map((location) => ({
      id: location.id,
      label: location.locationName,
      mapDescription: location.mapDescription ?? "Описание ещё не задано.",
      isEntry: location.id === currentWorld.entryLocationId,
      isPlayerHere:
        playerLocationId === location.id ||
        (!playerLocationId && location.id === entryCenterId),
    }));

    const options: GraphLayoutOptions = {
      width: containerSize.width,
      height: containerSize.height,
      centerNodeId: centerId ?? undefined,
      nodeRadius: NODE_RADIUS,
      linkDistance: FORCE_LINK_DISTANCE,
      chargeStrength: FORCE_NODE_CHARGE,
      radialStrength: layoutMode === "player" ? 0.65 : 0.55,
      centerStrength: 0.15,
    };

    let engine = engineRef.current;
    if (!engine) {
      engine = new GraphLayoutEngine(options);
      engineRef.current = engine;
    }

    engine.onTick(mapLayoutToNodes);
    engine.onSimulationEnd(mapLayoutToNodes);

    latestGraphDataRef.current = { nodes: layoutNodes, links, options };
    engine.updateGraph(layoutNodes, links, options);
  }, [
    currentWorld,
    layoutMode,
    playerLocationId,
    containerSize,
    mapLayoutToNodes,
  ]);

  const performFitView = useCallback(() => {
    if (!reactFlowInstanceRef.current || flowNodes.length === 0) {
      return;
    }

    if (fitViewTimeoutRef.current !== null) {
      cancelAnimationFrame(fitViewTimeoutRef.current);
    }

    fitViewTimeoutRef.current = requestAnimationFrame(() => {
      try {
        reactFlowInstanceRef.current?.fitView({
          padding: 0.16,
          duration: 200,
          maxZoom: 1.0,
          minZoom: 0.25,
        });
      } catch (error) {
        console.warn("fitView failed", error);
      }
      fitViewTimeoutRef.current = null;
    });
  }, [flowNodes.length]);

  // Центровка при смене режима и после обновления графа
  useEffect(() => {
    if (reactFlowInstanceRef.current && hasInitializedRef.current && flowNodes.length > 0) {
      performFitView();
    }
  }, [layoutMode, flowNodes.length, performFitView]);

  // Отслеживаем изменение размера
  useEffect(() => {
    if (hasInitializedRef.current && reactFlowInstanceRef.current && flowNodes.length > 0) {
      performFitView();
    }
  }, [containerSize, flowNodes.length, performFitView]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setFlowNodes((prev) => applyNodeChanges(changes, prev));

      if (!engineRef.current) {
        return;
      }

      changes.forEach((change) => {
        if (change.type === "position" && change.position) {
          const cx = change.position.x + NODE_RADIUS;
          const cy = change.position.y + NODE_RADIUS;

          if (change.dragging) {
            engineRef.current?.setNodePosition(change.id, cx, cy, true);
          } else {
            engineRef.current?.setNodePosition(change.id, cx, cy, false);
            engineRef.current?.releaseNode(change.id);
          }
        }
      });
    },
    [],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = instance;
    isInitializingRef.current = true;
    hasInitializedRef.current = true;

    setTimeout(() => {
      isInitializingRef.current = false;
      performFitView();
    }, 80);
  }, [performFitView]);

  const handleRelayout = useCallback(() => {
    const engine = engineRef.current;
    const graphData = latestGraphDataRef.current;
    if (engine && graphData) {
      engine.updateGraph(graphData.nodes, graphData.links, graphData.options);
      setTimeout(() => {
        performFitView();
      }, 120);
    }
  }, [performFitView]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-slate-950/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Граф мира
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Визуализация локаций и переходов. Новые ноды появятся по мере исследования.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LayoutSwitcher
            value={layoutMode}
            onChange={setLayoutMode}
            playerModeDisabled={!canUsePlayerCenter}
          />
          {layoutMode === "entry" && (
            <button
              type="button"
              onClick={handleRelayout}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 transition hover:border-emerald-400/60 hover:text-emerald-200"
              aria-label="Разровнять граф"
            >
              <LayoutIcon className="h-3.5 w-3.5" />
              Разровнять
            </button>
          )}
        </div>
      </header>
      <div ref={containerRef} className="flex-1 min-h-0">
        {currentWorld && flowNodes.length > 0 ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onInit={onInit}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={true}
            nodesConnectable={false}
            panOnScroll={true}
            selectionOnDrag={false}
            panOnDrag={[2]}
            panActivationKeyCode="Space"
            className="graph-flow h-full w-full bg-slate-950/30"
          >
            <Background color="rgba(148, 163, 184, 0.2)" gap={24} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(node) => {
                if (node.data?.isPlayerHere) return "#10b981";
                if (node.data?.isEntry) return "#3b82f6";
                return "#64748b";
              }}
              nodeStrokeColor={(node) => {
                if (node.data?.isPlayerHere) return "#34d399";
                if (node.data?.isEntry) return "#60a5fa";
                return "#94a3b8";
              }}
              nodeStrokeWidth={2}
              className="minimap-custom"
            />
          </ReactFlow>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-sm text-slate-400">
            <span>Пока нет данных для отображения.</span>
            <span className="text-xs text-slate-500">
              Создайте или выберите мир, чтобы увидеть его структуру.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

type EdgeBuildResult = {
  flowEdges: Edge[];
  links: GraphLink[];
};

function buildEdges(locations: LocationNode[], layoutMode: "entry" | "player"): EdgeBuildResult {
  const edgeSet = new Set<string>();
  const flowEdges: Edge[] = [];
  const links: GraphLink[] = [];

  const locationIds = new Set(locations.map((loc) => loc.id));

  locations.forEach((location) => {
    location.connections?.forEach((connection) => {
      if (!locationIds.has(connection.targetId)) {
        return;
      }

      const key = connection.bidirectional
        ? [location.id, connection.targetId].sort().join(":")
        : `${location.id}:${connection.targetId}`;

      if (edgeSet.has(key)) {
        return;
      }

      edgeSet.add(key);

      flowEdges.push({
        id: key,
        source: location.id,
        target: connection.targetId,
        type: "circle",
        label: connection.label,
        data: {
          bidirectional: connection.bidirectional,
          radius: NODE_RADIUS,
        },
        style: {
          stroke: "rgba(148, 163, 184, 0.58)",
          strokeWidth: 2,
        },
        animated: layoutMode === "player" && !connection.bidirectional,
      });

      links.push({
        source: location.id,
        target: connection.targetId,
        bidirectional: connection.bidirectional,
      });
    });
  });

  return { flowEdges, links };
}

interface LayoutSwitcherProps {
  value: "entry" | "player";
  onChange: (value: "entry" | "player") => void;
  playerModeDisabled: boolean;
}

function LayoutSwitcher({ value, onChange, playerModeDisabled }: LayoutSwitcherProps) {
  const toggle = () => {
    if (value === "entry" && playerModeDisabled) {
      return;
    }

    onChange(value === "entry" ? "player" : "entry");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("entry")}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-slate-300 transition ${
          value === "entry"
            ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-200"
            : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:text-white"
        }`}
        aria-label="Центрировать по входной локации"
      >
        <GlobeIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={toggle}
        className={`relative h-6 w-12 rounded-full bg-slate-800 transition ${
          playerModeDisabled && value === "entry" ? "opacity-50" : "hover:bg-slate-700"
        }`}
        aria-label="Переключить режим раскладки"
        disabled={playerModeDisabled && value === "entry"}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-emerald-400 transition-all ${
            value === "entry" ? "left-1" : "left-7"
          }`}
        />
      </button>
      <button
        type="button"
        onClick={() => onChange("player")}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-slate-300 transition ${
          value === "player"
            ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-200"
            : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:text-white"
        } ${playerModeDisabled ? "opacity-40" : ""}`}
        aria-label="Центрировать по позиции персонажа"
        disabled={playerModeDisabled}
      >
        <PlayerIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

interface IconProps {
  className?: string;
}

function GlobeIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3c2 2.5 3.2 5.2 3.2 7s-1.2 4.5-3.2 7c-2-2.5-3.2-5.2-3.2-7s1.2-4.5 3.2-7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 10h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlayerIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M10 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3137 0-6 2.0147-6 4.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5c0-2.4853-2.6863-4.5-6-4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LayoutIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3 3h4v4H3V3ZM9 3h4v4H9V3ZM3 9h4v4H3V9ZM9 9h4v4H9V9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

