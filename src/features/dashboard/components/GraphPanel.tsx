"use client";

import { useMemo } from "react";

import { Background, Controls, ReactFlow } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGameStore } from "@/store/gameStore";

export function GraphPanel() {
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

  const { nodes, edges } = useMemo(() => {
    if (!currentWorld) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const locationEntries = Object.values(currentWorld.graph ?? {});

    if (locationEntries.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const layoutGapX = 240;
    const layoutGapY = 160;

    const nodes: Node[] = locationEntries.map((location, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);

      const isEntry = location.id === currentWorld.entryLocationId;
      const isPlayerHere =
        currentCharacter?.currentLocationId === location.id ||
        (!currentCharacter?.currentLocationId && isEntry);

      return {
        id: location.id,
        data: {
          label: location.locationName,
        },
        position: {
          x: column * layoutGapX,
          y: row * layoutGapY,
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

    const edgeSet = new Set<string>();
    const edges: Edge[] = [];

    locationEntries.forEach((location) => {
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
        });
      });
    });

    return { nodes, edges };
  }, [currentWorld, currentCharacter]);

  return (
    <section className="flex w-[360px] min-h-0 flex-col bg-slate-950/20">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Граф мира
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Визуализация локаций и переходов. Новые ноды появятся по мере исследования.
        </p>
      </header>
      <div className="flex-1">
        {currentWorld && nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            className="bg-slate-950/30"
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

