"use client";

import { useMemo, useState } from "react";

import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Edge, Node } from "@xyflow/react";

import { useGameStore } from "@/store/gameStore";
import type { LocationNode } from "@/types/game";

const BASE_RADIUS = 180;
const RADIUS_STEP = 220;

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

    const adjacency = buildAdjacencyMap(locations);
    const positions = computeRadialPositions(locations, adjacency, centerId);

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
          label: (
            <div className="truncate" title={mapDescription}>
              {location.locationName}
            </div>
          ),
        },
        style: {
          borderRadius: 12,
          border: isPlayerHere ? "2px solid #34d399" : "1px solid rgba(148, 163, 184, 0.3)",
          padding: 12,
          background: isEntry ? "rgba(59,130,246,0.12)" : "rgba(30,41,59,0.6)",
          color: "rgba(226,232,240,1)",
          minWidth: 160,
          textAlign: "center" as const,
          fontSize: 12,
        },
      } satisfies Node;
    });

    const edges = buildEdges(locations, layoutMode);

    return { nodes, edges };
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
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            className="h-full bg-slate-950/30"
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

function buildAdjacencyMap(locations: LocationNode[]) {
  const adjacency = new Map<string, Set<string>>();

  for (const location of locations) {
    if (!adjacency.has(location.id)) {
      adjacency.set(location.id, new Set());
    }

    for (const connection of location.connections) {
      if (!adjacency.has(connection.targetId)) {
        adjacency.set(connection.targetId, new Set());
      }

      adjacency.get(location.id)!.add(connection.targetId);
      adjacency.get(connection.targetId)!.add(location.id);
    }
  }

  return adjacency;
}

function computeRadialPositions(
  locations: LocationNode[],
  adjacency: Map<string, Set<string>>,
  centerId: string | null,
) {
  const positions = new Map<string, { x: number; y: number }>();

  if (locations.length === 0) {
    return positions;
  }

  const fallbackId = locations[0].id;
  const rootId = centerId && adjacency.has(centerId) ? centerId : fallbackId;

  const rings: string[][] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  const enqueue = (id: string, depth: number) => {
    queue.push({ id, depth });
    visited.add(id);
  };

  enqueue(rootId, 0);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (!rings[depth]) {
      rings[depth] = [];
    }
    rings[depth]!.push(id);

    const neighbors = adjacency.get(id);
    if (!neighbors) {
      continue;
    }

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        enqueue(neighbor, depth + 1);
      }
    }
  }

  const knownIds = new Set(locations.map((location) => location.id));

  for (const locationId of knownIds) {
    if (!visited.has(locationId)) {
      const startDepth = rings.length === 0 ? 0 : rings.length;
      const componentQueue: Array<{ id: string; depth: number }> = [
        { id: locationId, depth: startDepth },
      ];
      visited.add(locationId);

      while (componentQueue.length > 0) {
        const { id, depth } = componentQueue.shift()!;
        if (!rings[depth]) {
          rings[depth] = [];
        }
        rings[depth]!.push(id);

        const neighbors = adjacency.get(id);
        if (!neighbors) {
          continue;
        }

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            componentQueue.push({ id: neighbor, depth: depth + 1 });
          }
        }
      }
    }
  }

  rings.forEach((ring, depth) => {
    if (ring.length === 0) {
      return;
    }

    if (depth === 0) {
      const center = ring[0];
      positions.set(center, { x: 0, y: 0 });

      if (ring.length > 1) {
        for (let index = 1; index < ring.length; index += 1) {
          const angle = (2 * Math.PI * index) / ring.length - Math.PI / 2;
          positions.set(ring[index], {
            x: Math.cos(angle) * (BASE_RADIUS * 0.5),
            y: Math.sin(angle) * (BASE_RADIUS * 0.5),
          });
        }
      }
      return;
    }

    const nodeCount = ring.length;
    const radius = BASE_RADIUS + (depth - 1) * RADIUS_STEP + Math.max(0, nodeCount - 6) * 20;
    const angleOffset = -Math.PI / 2;

    ring.forEach((id, index) => {
      const angle = (2 * Math.PI * index) / nodeCount + angleOffset;
      positions.set(id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  });

  return positions;
}

function buildEdges(locations: LocationNode[], layoutMode: "entry" | "player"): Edge[] {
  const edgeSet = new Set<string>();
  const edges: Edge[] = [];

  locations.forEach((location) => {
    location.connections.forEach((connection) => {
      const key = connection.bidirectional
        ? [location.id, connection.targetId].sort().join(":")
        : `${location.id}:${connection.targetId}`;

      if (edgeSet.has(key)) {
        return;
      }

      edgeSet.add(key);
      edges.push({
        id: key,
        source: location.id,
        target: connection.targetId,
        label: connection.label,
        style: {
          stroke: "rgba(148, 163, 184, 0.4)",
        },
        markerEnd: connection.bidirectional ? undefined : "arrowclosed",
        animated: layoutMode === "player" && connection.bidirectional === false,
      });
    });
  });

  return edges;
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
            : "border-сlate-700 bg-сlate-900 hover:border-сlate-500 hover:text-white"
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

