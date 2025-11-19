"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Edge, Node, OnNodesChange, ReactFlowInstance, Viewport } from "@xyflow/react";
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
import { GraphContextMenu } from "./GraphContextMenu";
import { LocationSettingsModal } from "./LocationSettingsModal";

const NODE_RADIUS = 80;
const FORCE_LINK_DISTANCE = 400;
const FORCE_NODE_CHARGE = -2500;

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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(
    null,
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const engineRef = useRef<GraphLayoutEngine | null>(null);
  const latestGraphDataRef = useRef<{
    nodes: LayoutNode[];
    links: GraphLink[];
    options: GraphLayoutOptions;
    worldId: string;
  } | null>(null);
  type SavedGraphState = {
    positions: Map<string, { x: number; y: number }>;
    viewport?: Viewport;
  };

  const savedGraphStateRef = useRef<
    Map<string, { entry: SavedGraphState; player: SavedGraphState }>
  >(new Map());

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
  const updateWorld = useGameStore((state) => state.actions.updateWorld);

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

  const ensureSavedState = useCallback(
    () => {
      if (!currentWorldId) {
        return undefined;
      }
      let worldState = savedGraphStateRef.current.get(currentWorldId);
      if (!worldState) {
        worldState = {
          entry: { positions: new Map() },
          player: { positions: new Map() },
        };
        savedGraphStateRef.current.set(currentWorldId, worldState);
      }
      return worldState;
    },
    [currentWorldId],
  );

  const savePositions = useCallback(() => {
    if (!engineRef.current) {
      return;
    }
    const worldState = ensureSavedState();
    if (!worldState) {
      return;
    }
    const positions = engineRef.current.getNodePositions();
    const cloned = new Map(positions);
    worldState[layoutMode].positions = cloned;
  }, [ensureSavedState, layoutMode]);

  const saveViewport = useCallback(
    (viewport?: Viewport) => {
      if (!viewport) {
        return;
      }
      const worldState = ensureSavedState();
      if (!worldState) {
        return;
      }
      worldState[layoutMode].viewport = viewport;
    },
    [ensureSavedState, layoutMode],
  );

  const getSavedState = useCallback(() => {
    const worldState = ensureSavedState();
    if (!worldState) {
      return undefined;
    }
    return worldState[layoutMode];
  }, [ensureSavedState, layoutMode]);

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
      alphaDecay: 0.08, // Faster settling (default ~0.0228)
      velocityDecay: 0.45, // Slightly more friction (default 0.4)
    };

    // Если мир изменился, сбрасываем движок и очищаем состояние
    if (
      latestGraphDataRef.current &&
      latestGraphDataRef.current.worldId !== currentWorld.id
    ) {
      engineRef.current?.stop();
      engineRef.current = null;
      // Очищаем ноды и связи немедленно, чтобы убрать тяжелые DOM элементы
      setFlowNodes([]);
      setFlowEdges([]);
    }

    let engine = engineRef.current;
    if (!engine) {
      engine = new GraphLayoutEngine(options);
      engineRef.current = engine;
    }

    let lastTick = 0;
    const TICK_THROTTLE = 32; // ~30 FPS

    engine.onTick((nodes) => {
      const now = performance.now();
      if (now - lastTick > TICK_THROTTLE) {
        mapLayoutToNodes(nodes);
        lastTick = now;
      }
    });
    engine.onSimulationEnd((nodes) => {
      mapLayoutToNodes(nodes);
      savePositions();
      const viewport = reactFlowInstanceRef.current?.getViewport?.();
      if (viewport) {
        saveViewport(viewport);
      }
    });

    latestGraphDataRef.current = { nodes: layoutNodes, links, options, worldId: currentWorld.id };
    const savedState = getSavedState();
    engine.updateGraph(layoutNodes, links, options, savedState?.positions);
    savePositions();

    // Cleanup function to stop simulation when component unmounts or dependencies change
    return () => {
      engineRef.current?.stop();
    };
  }, [
    currentWorld,
    layoutMode,
    playerLocationId,
    containerSize,
    mapLayoutToNodes,
    savePositions,
    getSavedState,
    saveViewport,
  ]);

  const performFitView = useCallback(
    (allowSavedViewport = true, options?: { padding?: number }) => {
      if (!reactFlowInstanceRef.current || flowNodes.length === 0) {
        return;
      }

      if (allowSavedViewport) {
        const savedState = getSavedState();
        if (savedState?.viewport) {
          reactFlowInstanceRef.current.setViewport(savedState.viewport, { duration: 180 });
          return;
        }
      }

      if (fitViewTimeoutRef.current !== null) {
        cancelAnimationFrame(fitViewTimeoutRef.current);
      }

      fitViewTimeoutRef.current = requestAnimationFrame(() => {
        try {
          reactFlowInstanceRef.current?.fitView({
            padding: options?.padding ?? 0.2,
            duration: 200,
            maxZoom: 1.2,
            minZoom: 0.08,
            includeHiddenNodes: true,
          });
          setTimeout(() => {
            const viewport = reactFlowInstanceRef.current?.getViewport?.();
            if (viewport) {
              saveViewport(viewport);
            }
          }, 140);
        } catch (error) {
          console.warn("fitView failed", error);
        }
        fitViewTimeoutRef.current = null;
      });
    },
    [flowNodes.length, getSavedState, saveViewport],
  );

  // Центровка при смене режима и после обновления графа
  useEffect(() => {
    if (reactFlowInstanceRef.current && hasInitializedRef.current && flowNodes.length > 0) {
      performFitView();
    }
  }, [layoutMode, flowNodes.length, performFitView]);

  // Отслеживаем изменение размера
  useEffect(() => {
    if (hasInitializedRef.current && reactFlowInstanceRef.current && flowNodes.length > 0) {
      performFitView(false);
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
            savePositions();
            const viewport = reactFlowInstanceRef.current?.getViewport?.();
            if (viewport) {
              saveViewport(viewport);
            }
          }
        }
      });
    },
    [savePositions, saveViewport],
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
      const savedState = getSavedState();
      engine.updateGraph(graphData.nodes, graphData.links, graphData.options, savedState?.positions);
      savePositions();
      setTimeout(() => {
        performFitView();
      }, 120);
    }
  }, [performFitView, getSavedState, savePositions]);

  const handleFitAll = useCallback(() => {
    performFitView(false, { padding: 0.18 });
  }, [performFitView]);

  const handleCenterOnActiveNode = useCallback(() => {
    const instance = reactFlowInstanceRef.current;
    if (!instance || flowNodes.length === 0 || !currentWorld) {
      return;
    }

    const activeNodeId = layoutMode === "player"
      ? (playerLocationId && currentWorld.graph[playerLocationId] ? playerLocationId : currentWorld.entryLocationId)
      : currentWorld.entryLocationId;

    if (!activeNodeId) {
      return;
    }

    const nodes = instance.getNodes?.() ?? [];
    const node = nodes.find((n) => n.id === activeNodeId) ?? flowNodes.find((n) => n.id === activeNodeId);
    if (!node) {
      return;
    }

    const viewport = instance.getViewport?.();
    const zoom = viewport?.zoom ?? 1;
    const pos = node.positionAbsolute ?? node.position;
    const width = node.width ?? NODE_RADIUS * 2;
    const height = node.height ?? NODE_RADIUS * 2;

    const centerX = (pos?.x ?? 0) + width / 2;
    const centerY = (pos?.y ?? 0) + height / 2;

    instance.setCenter(centerX, centerY, { zoom, duration: 220, easing: (t) => t });
    setTimeout(() => {
      const updated = instance.getViewport?.();
      if (updated) {
        saveViewport(updated);
      }
    }, 240);
  }, [currentWorld, flowNodes, layoutMode, playerLocationId, saveViewport]);

  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      event.preventDefault();
      const pane = containerRef.current?.getBoundingClientRect();
      const instance = reactFlowInstanceRef.current;

      if (!pane || !instance) return;

      // Используем координаты ноды для позиционирования меню
      // node.positionAbsolute - это координаты внутри ReactFlow
      // Нам нужно перевести их в экранные координаты, а затем в координаты относительно контейнера
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeX = (node as any).positionAbsolute?.x ?? node.position.x;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeY = (node as any).positionAbsolute?.y ?? node.position.y;

      // Центр ноды
      const centerX = nodeX + NODE_RADIUS;
      const centerY = nodeY + NODE_RADIUS;

      const screenPos = instance.flowToScreenPosition({ x: centerX, y: centerY });

      setContextMenu({
        x: screenPos.x - pane.left,
        y: screenPos.y - pane.top,
        nodeId: node.id,
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextAction = useCallback(
    async (action: "edit" | "delete") => {
      const nodeId = contextMenu?.nodeId;
      handleCloseContextMenu();

      if (!nodeId || !currentWorld) return;

      if (action === "edit") {
        setEditingNodeId(nodeId);
      } else if (action === "delete") {
        if (nodeId === currentWorld.entryLocationId) {
          alert("Нельзя удалить стартовую локацию!");
          return;
        }

        if (confirm("Вы уверены, что хотите удалить эту локацию? Это действие необратимо.")) {
          const newGraph = { ...currentWorld.graph };
          delete newGraph[nodeId];

          // Удаляем связи, ведущие к этой ноде
          Object.values(newGraph).forEach((node) => {
            node.connections = node.connections.filter((conn) => conn.targetId !== nodeId);
          });

          await updateWorld(currentWorld.id, { graph: newGraph });
        }
      }
    },
    [contextMenu, currentWorld, handleCloseContextMenu, updateWorld],
  );

  const handleSaveLocation = useCallback(
    async (
      name: string,
      mapDescription: string,
      newConnectionTargetId?: string,
      deletedConnectionIds?: string[],
    ) => {
      if (!editingNodeId || !currentWorld) return;

      const node = currentWorld.graph[editingNodeId];
      if (!node) return;

      let updatedNode: LocationNode = {
        ...node,
        locationName: name,
        mapDescription: mapDescription,
      };

      let newGraph = {
        ...currentWorld.graph,
        [editingNodeId]: updatedNode,
      };

      // Handle deleted connections
      if (deletedConnectionIds && deletedConnectionIds.length > 0) {
        deletedConnectionIds.forEach((connId) => {
          const connection = updatedNode.connections.find((c) => c.id === connId);
          if (!connection) return;

          // Remove from current node
          updatedNode.connections = updatedNode.connections.filter((c) => c.id !== connId);

          // Remove from target node (bidirectional)
          const targetNode = newGraph[connection.targetId];
          if (targetNode) {
            const updatedTargetNode = {
              ...targetNode,
              connections: targetNode.connections.filter((c) => c.targetId !== editingNodeId),
            };
            newGraph[connection.targetId] = updatedTargetNode;
          }
        });
        newGraph[editingNodeId] = updatedNode;
      }

      // Handle new connection if selected
      if (newConnectionTargetId && newConnectionTargetId !== editingNodeId) {
        const targetNode = newGraph[newConnectionTargetId];
        if (targetNode) {
          // Check if connection already exists
          const connectionExists = updatedNode.connections.some(
            (c) => c.targetId === newConnectionTargetId,
          );

          if (!connectionExists) {
            // Add connection to current node
            const newConnectionId = crypto.randomUUID();
            updatedNode = {
              ...updatedNode,
              connections: [
                ...updatedNode.connections,
                {
                  id: newConnectionId,
                  targetId: newConnectionTargetId,
                  label: "перейти в",
                  bidirectional: true,
                },
              ],
            };

            // Add connection to target node (bidirectional)
            const targetConnectionId = crypto.randomUUID();
            const updatedTargetNode = {
              ...targetNode,
              connections: [
                ...targetNode.connections,
                {
                  id: targetConnectionId,
                  targetId: editingNodeId,
                  label: "перейти в",
                  bidirectional: true,
                },
              ],
            };

            newGraph = {
              ...newGraph,
              [editingNodeId]: updatedNode,
              [newConnectionTargetId]: updatedTargetNode,
            };
          }
        }
      }

      await updateWorld(currentWorld.id, { graph: newGraph });
      setEditingNodeId(null);
    },
    [editingNodeId, currentWorld, updateWorld],
  );

  const editingNode = editingNodeId && currentWorld ? currentWorld.graph[editingNodeId] : null;

  const availableLocations = useMemo(() => {
    if (!currentWorld || !editingNodeId) return [];
    return Object.values(currentWorld.graph)
      .filter((node) => node.id !== editingNodeId)
      .map((node) => ({ id: node.id, name: node.locationName }));
  }, [currentWorld, editingNodeId]);

  const existingConnections = useMemo(() => {
    if (!currentWorld || !editingNode) return [];
    return editingNode.connections.map((conn) => ({
      id: conn.id,
      targetName: currentWorld.graph[conn.targetId]?.locationName ?? "Неизвестно",
      label: conn.label,
    }));
  }, [currentWorld, editingNode]);

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
          <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2 py-1">
            <ActionIconButton
              onClick={handleFitAll}
              icon={FitAllIcon}
              ariaLabel="Уместить граф целиком"
            />
            <ActionIconButton
              onClick={handleCenterOnActiveNode}
              icon={CenterIcon}
              ariaLabel="Центрировать на текущей ноде"
            />
          </div>
          <LayoutSwitcher
            value={layoutMode}
            onChange={setLayoutMode}
            playerModeDisabled={!canUsePlayerCenter}
          />
          {layoutMode === "entry" && (
            <button
              type="button"
              onClick={handleRelayout}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 transition hover:border-emerald-400/60 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              aria-label="Разровнять граф"
            >
              <LayoutIcon className="h-3.5 w-3.5" />
              Разровнять
            </button>
          )}
        </div>
      </header>
      <div ref={containerRef} className="relative flex-1 min-h-0">
        {currentWorld && flowNodes.length > 0 ? (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={handleCloseContextMenu}
            onInit={onInit}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onMoveEnd={(_, viewport) => saveViewport(viewport)}
            minZoom={0.08}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={true}
            nodesConnectable={false}
            panOnScroll={false}
            zoomOnScroll={true}
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

        {contextMenu && (
          <GraphContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={handleCloseContextMenu}
            onAction={handleContextAction}
          />
        )}
      </div>

      {editingNode && (
        <LocationSettingsModal
          open={Boolean(editingNode)}
          onClose={() => setEditingNodeId(null)}
          locationName={editingNode.locationName}
          mapDescription={editingNode.mapDescription ?? ""}
          availableLocations={availableLocations}
          existingConnections={existingConnections}
          onSave={handleSaveLocation}
        />
      )}
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
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-slate-300 transition ${value === "entry"
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
        className={`relative h-6 w-12 rounded-full bg-slate-800 transition ${playerModeDisabled && value === "entry" ? "opacity-50" : "hover:bg-slate-700"
          }`}
        aria-label="Переключить режим раскладки"
        disabled={playerModeDisabled && value === "entry"}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-emerald-400 transition-all ${value === "entry" ? "left-1" : "left-7"
            }`}
        />
      </button>
      <button
        type="button"
        onClick={() => onChange("player")}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-slate-300 transition ${value === "player"
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

interface ActionIconButtonProps {
  onClick: () => void;
  icon: (props: IconProps) => JSX.Element;
  ariaLabel: string;
}

function ActionIconButton({ onClick, icon: Icon, ariaLabel }: ActionIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-emerald-400/60 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
      aria-label={ariaLabel}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function FitAllIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4.5 2h-2v2.5M15.5 2h2v2.5M4.5 18h-2v-2.5M15.5 18h2v-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M5 5h3M12 5h3M5 15h3M12 15h3M5 8v4M15 8v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="7" y="7" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CenterIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
      <path
        d="M10 3v2M10 15v2M3 10h2M15 10h2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

