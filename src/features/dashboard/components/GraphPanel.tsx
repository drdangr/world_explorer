"use client";

import { useMemo, useState } from "react";

import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Edge, Node } from "@xyflow/react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
} from "d3-force";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";

import { useGameStore } from "@/store/gameStore";
import type { LocationNode } from "@/types/game";

import { CircleEdge } from "./CircleEdge";

const NODE_RADIUS = 80;
const FORCE_TICKS = 300;
const FORCE_LINK_DISTANCE = 300;
const FORCE_NODE_CHARGE = -1600;
const FORCE_COLLISION_RADIUS = NODE_RADIUS + 50;

interface ForceNode extends SimulationNodeDatum {
  id: string;
  depth: number;
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
  bidirectional?: boolean;
}

const EDGE_TYPES = {
  circle: CircleEdge,
};

export function GraphPanel() {
  const [layoutMode, setLayoutMode] = useState<"entry" | "player">("entry");

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

  const { nodes, edges } = useMemo(() => {
    if (!currentWorld) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const graph = currentWorld.graph ?? {};
    const locations = Object.values(graph);

    if (locations.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const fallbackCenterId = locations[0]?.id ?? null;
    const entryCenterId = graph[currentWorld.entryLocationId]
      ? currentWorld.entryLocationId
      : fallbackCenterId;

    const playerCenterId = playerLocationId && graph[playerLocationId]
      ? playerLocationId
      : entryCenterId;

    const centerId = layoutMode === "player" ? playerCenterId : entryCenterId;

    const { flowEdges, links } = buildEdges(locations, layoutMode);
    const positions = runForceLayout(locations, links, centerId);

    const nodes: Node[] = locations.map((location) => {
      const isEntry = location.id === currentWorld.entryLocationId;
      const isPlayerHere =
        playerLocationId === location.id || (!playerLocationId && isEntry);

      const position = positions.get(location.id) ?? { x: 0, y: 0 };
      const mapDescription = location.mapDescription ?? "Описание ещё не задано.";

      return {
        id: location.id,
        position,
        data: {
          label: location.locationName,
          radius: NODE_RADIUS,
          mapDescription,
          isEntry,
          isPlayerHere,
        },
        style: {
          width: NODE_RADIUS * 2,
          height: NODE_RADIUS * 2,
          borderRadius: "50%",
          border: isPlayerHere 
            ? "3px solid #34d399" 
            : isEntry 
            ? "2px solid rgba(59,130,246,0.6)" 
            : "1.5px solid rgba(148, 163, 184, 0.4)",
          padding: 0,
          background: isEntry 
            ? "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(30,41,59,0.8) 100%)" 
            : "rgba(30,41,59,0.7)",
          color: "rgba(226,232,240,1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 500,
          textAlign: "center" as const,
          overflow: "hidden",
          boxShadow: isPlayerHere 
            ? "0 0 20px rgba(52, 211, 153, 0.4)" 
            : "0 2px 8px rgba(0,0,0,0.3)",
        },
      } satisfies Node;
    });

    return { nodes, edges: flowEdges };
  }, [currentWorld, layoutMode, playerLocationId]);

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
        <LayoutSwitcher
          value={layoutMode}
          onChange={setLayoutMode}
          playerModeDisabled={!canUsePlayerCenter}
        />
      </header>
      <div className="flex-1 min-h-0">
        {currentWorld && nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            className="graph-flow h-full bg-slate-950/30"
          >
            <Background color="rgba(148, 163, 184, 0.2)" gap={24} />
            <Controls showInteractive={false} position="bottom-right" />
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

function runForceLayout(
  locations: LocationNode[],
  links: ForceLink[],
  centerId: string | null,
) {
  const adjacency = new Map<string, Set<string>>();

  for (const location of locations) {
    if (!adjacency.has(location.id)) {
      adjacency.set(location.id, new Set());
    }

    for (const connection of location.connections) {
      adjacency.get(location.id)!.add(connection.targetId);
      if (connection.bidirectional) {
        if (!adjacency.has(connection.targetId)) {
          adjacency.set(connection.targetId, new Set());
        }
        adjacency.get(connection.targetId)!.add(location.id);
      }
    }
  }

  const fallbackId = locations[0]?.id ?? "";
  const rootId = centerId && adjacency.has(centerId) ? centerId : fallbackId;

  const depths = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  visited.add(rootId);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    depths.set(id, depth);

    const neighbors = adjacency.get(id);
    if (!neighbors) {
      continue;
    }

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  for (const location of locations) {
    if (!depths.has(location.id)) {
      depths.set(location.id, 999);
    }
  }

  const simNodes: ForceNode[] = locations.map((location) => ({
    id: location.id,
    depth: depths.get(location.id) ?? 999,
  }));

  const linkForce = forceLink<ForceNode, ForceLink>(links)
    .id((node) => node.id)
    .distance((link) =>
      link.bidirectional ? FORCE_LINK_DISTANCE * 0.85 : FORCE_LINK_DISTANCE,
    )
    .strength(1.0);

  const simulation = forceSimulation<ForceNode>(simNodes)
    .force("charge", forceManyBody().strength(FORCE_NODE_CHARGE))
    .force("link", linkForce)
    .force("collision", forceCollide<ForceNode>().radius(FORCE_COLLISION_RADIUS))
    .force("center", forceCenter(0, 0))
    .force(
      "radial",
      forceRadial<ForceNode>()
        .radius((node) => node.depth * FORCE_LINK_DISTANCE * 0.7)
        .strength(0.5),
    );

  if (centerId) {
    const centerNode = simNodes.find((node) => node.id === centerId);
    if (centerNode) {
      centerNode.fx = 0;
      centerNode.fy = 0;
    }
  }

  for (let index = 0; index < FORCE_TICKS; index += 1) {
    simulation.tick();
  }

  simulation.stop();

  const positions = new Map<string, { x: number; y: number }>();
  simNodes.forEach((node) => {
    positions.set(node.id, {
      x: (node.x ?? 0) - NODE_RADIUS,
      y: (node.y ?? 0) - NODE_RADIUS,
    });
  });

  return positions;
}

function buildEdges(locations: LocationNode[], layoutMode: "entry" | "player") {
  const edgeSet = new Set<string>();
  const flowEdges: Edge[] = [];
  const links: ForceLink[] = [];

  locations.forEach((location) => {
    location.connections.forEach((connection) => {
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
          stroke: "rgba(148, 163, 184, 0.5)",
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

