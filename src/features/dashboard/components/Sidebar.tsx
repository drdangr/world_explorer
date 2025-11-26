"use client";

import type { CSSProperties } from "react";
import { startTransition, useEffect, useMemo, useState } from "react";

import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useGameStore } from "@/store/gameStore";
import type { World } from "@/types/game";

import { CharacterSettingsModal } from "./CharacterSettingsModal";
import { SessionSelectionModal, type SessionMeta } from "./SessionSelectionModal";
import { WorldSettingsModal } from "./WorldSettingsModal";

interface WorldModalState {
  mode: "create" | "edit";
  world: World | null;
}

export function Sidebar() {
  const worlds = useGameStore((state) => state.worlds);
  const currentWorldId = useGameStore((state) => state.currentWorldId);
  const characters = useGameStore((state) => state.characters);
  const currentCharacterId = useGameStore((state) => state.currentCharacterId);
  const error = useGameStore((state) => state.error);
  const isMutating = useGameStore((state) => state.isMutating);
  const actions = useGameStore((state) => state.actions);

  const [orderedWorldIds, setOrderedWorldIds] = useState<string[]>(() => worlds.map((world) => world.id));
  const [worldModal, setWorldModal] = useState<WorldModalState | null>(null);
  const [isCharacterModalOpen, setCharacterModalOpen] = useState(false);
  const [inventoryExpanded, setInventoryExpanded] = useState(true);
  const [toolLogsExpanded, setToolLogsExpanded] = useState(false);
  const [sessionModal, setSessionModal] = useState<{ worldId: string; sessions: SessionMeta[] } | null>(null);

  const latestToolLogs = useGameStore((state) => state.latestToolLogs);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    startTransition(() => {
      setOrderedWorldIds((previous) => {
        const nextIds = worlds.map((world) => world.id);
        const filtered = previous.filter((id) => nextIds.includes(id));
        const appended = nextIds.filter((id) => !filtered.includes(id));
        const result = [...filtered, ...appended];

        if (
          result.length === previous.length &&
          result.every((id, index) => id === previous[index])
        ) {
          return previous;
        }

        return result;
      });
    });
  }, [worlds]);

  const worldsById = useMemo(() => new Map(worlds.map((world) => [world.id, world])), [worlds]);
  const orderedWorlds = orderedWorldIds
    .map((id) => worldsById.get(id))
    .filter((item): item is World => Boolean(item));

  const currentCharacter = useMemo(
    () => characters.find((c) => c.id === currentCharacterId) ?? null,
    [characters, currentCharacterId],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setOrderedWorldIds((ids) => {
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);

      if (oldIndex === -1 || newIndex === -1) {
        return ids;
      }

      return arrayMove(ids, oldIndex, newIndex);
    });
  };

  const openCreateWorldModal = () => {
    setWorldModal({ mode: "create", world: null });
  };

  const openEditWorldModal = (world: World) => {
    setWorldModal({ mode: "edit", world });
  };

  const closeWorldModal = () => {
    setWorldModal(null);
  };

  const handleDeleteWorld = async (world: World) => {
    const confirmed = window.confirm(
      `Удалить мир «${world.name}»? Все связанные данные будут утеряны.`,
    );

    if (!confirmed) {
      return;
    }

    await actions.deleteWorld(world.id);
  };

  const handleSelectWorld = async (worldId: string) => {
    if (!currentCharacterId) {
      // No character selected, just switch worlds
      actions.selectWorld(worldId);
      return;
    }

    try {
      const params = new URLSearchParams({ characterId: currentCharacterId, worldId });
      const response = await fetch(`/api/sessions?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }

      const sessions = (await response.json()) as SessionMeta[];

      if (sessions.length === 0) {
        // No sessions, just switch
        actions.selectWorld(worldId);
      } else {
        // Show session selection modal
        setSessionModal({ worldId, sessions });
      }
    } catch (error) {
      console.error("Error fetching sessions:", error);
      // Fallback to default behavior
      actions.selectWorld(worldId);
    }
  };

  const formatToolArgs = (args: Record<string, any>): string => {
    const entries = Object.entries(args);
    if (entries.length === 0) return "—";
    return entries.map(([key, value]) => `${key}: "${value}"`).join(", ");
  };

  const formatToolResult = (toolName: string, result: any): React.ReactElement => {
    if (!result) return <span className="text-slate-500">—</span>;

    switch (toolName) {
      case "get_near_locations":
        if (result.locations && Array.isArray(result.locations)) {
          return (
            <>
              <p className="font-medium text-emerald-400">📍 Найдено: {result.count}</p>
              <ul className="mt-1 ml-2 space-y-1">
                {result.locations.map((loc: any, i: number) => (
                  <li key={i} className="text-slate-300">
                    • {loc.name}
                  </li>
                ))}
              </ul>
            </>
          );
        }
        break;

      case "find_location_by_name":
        if (result.matches && Array.isArray(result.matches)) {
          return (
            <>
              <p className="font-medium text-emerald-400">
                🔍 Найдено кандидатов: {result.matches.length}
              </p>
              <ul className="mt-1 ml-2 space-y-1">
                {result.matches.map((match: any, i: number) => (
                  <li key={i} className="text-slate-300">
                    • {match.name} <span className="text-emerald-300">({match.similarity})</span>
                  </li>
                ))}
              </ul>
            </>
          );
        }
        break;

      case "get_route":
        if (result.exists && result.path && Array.isArray(result.path)) {
          return (
            <>
              <p className="font-medium text-emerald-400">
                🛤️ Маршрут ({result.distance} шаг{result.distance !== 1 ? "ов" : ""}):
              </p>
              <ol className="mt-1 ml-2 space-y-1">
                {result.path.map((loc: any, i: number) => (
                  <li key={i} className="text-slate-300">
                    {i + 1}. {loc.name}
                  </li>
                ))}
              </ol>
            </>
          );
        } else if (result.error) {
          return <span className="text-red-400">❌ {result.error}</span>;
        }
        break;
    }

    // Fallback - show JSON
    return (
      <pre className="text-[9px] text-slate-400 overflow-x-auto">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  };

  const handleSessionSelect = (sessionId: string) => {
    if (sessionModal) {
      actions.selectWorld(sessionModal.worldId, sessionId);
      setSessionModal(null);
    }
  };

  const handleNewSession = () => {
    if (sessionModal) {
      actions.selectWorld(sessionModal.worldId, "new"); // "new" = explicitly start fresh
      setSessionModal(null);
    }
  };

  return (
    <aside className="flex h-full min-w-[16rem] max-w-md flex-col border-r border-slate-800 bg-slate-950/60 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">World Explorer</h1>
          <p className="text-xs text-slate-500">Выберите мир для исследования</p>
        </div>
        <button
          type="button"
          onClick={() => setCharacterModalOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-emerald-400/70 hover:text-emerald-200"
          aria-label="Настройки персонажей"
        >
          <UserIcon className="h-4 w-4" />
        </button>
      </header>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={openCreateWorldModal}
            className="flex w-full items-center justify-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-400/60 hover:text-emerald-200"
          >
            <PlusIcon className="h-4 w-4" />
            Создать мир
          </button>
          {isMutating && (
            <p className="mt-2 text-xs text-slate-500">Синхронизация данных…</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {error && (
            <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}

          {orderedWorlds.length === 0 ? (
            <div className="mt-6 rounded border border-dashed border-slate-700 px-4 py-6 text-center text-xs text-slate-400">
              Список миров пуст. Создайте первый мир, чтобы начать приключение.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={orderedWorlds.map((world) => world.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {orderedWorlds.map((world) => (
                    <SortableWorldListItem
                      key={world.id}
                      world={world}
                      isSelected={world.id === currentWorldId}
                      onSelect={() => handleSelectWorld(world.id)}
                      onOpenSettings={() => openEditWorldModal(world)}
                      onDelete={() => handleDeleteWorld(world)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          {currentCharacter && (
            <div className="border-t border-slate-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setInventoryExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:text-white"
              >
                <span>Инвентарь</span>
                <ChevronIcon className={`h-3 w-3 transition-transform ${inventoryExpanded ? 'rotate-180' : ''}`} />
              </button>
              {inventoryExpanded && (
                <div className="mt-3">
                  {currentCharacter.inventory.length === 0 ? (
                    <p className="rounded border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-400">
                      Инвентарь пуст. Возьмите предмет в одной из локаций.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {currentCharacter.inventory.map((item) => (
                        <li
                          key={item.id}
                          className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                        >
                          <p className="text-xs font-medium text-slate-100">{item.name}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {item.description || "Описание отсутствует"}
                          </p>
                          <p className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">
                            {item.portable ? "Переносимый" : "Нельзя взять"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          {latestToolLogs && latestToolLogs.length > 0 && (
            <div className="border-t border-slate-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setToolLogsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:text-white"
              >
                <span>Логи инструментов</span>
                <ChevronIcon className={`h-3 w-3 transition-transform ${toolLogsExpanded ? 'rotate-180' : ''}`} />
              </button>
              {toolLogsExpanded && (
                <div className="mt-3">
                  <ul className="flex flex-col gap-2">
                    {latestToolLogs.map((log, index) => (
                      <li
                        key={index}
                        className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                      >
                        <p className="text-xs font-medium text-emerald-300">{log.toolName}</p>
                        {log.args && Object.keys(log.args).length > 0 && (
                          <p className="mt-1 text-[10px] text-slate-400">
                            📥 {formatToolArgs(log.args)}
                          </p>
                        )}
                        {log.result && (
                          <div className="mt-2 text-[10px] text-slate-300">
                            {formatToolResult(log.toolName, log.result)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500">
        Данные сохраняются локально в каталоге <code>data/</code> до миграции в Supabase.
      </footer>

      <WorldSettingsModal
        open={worldModal !== null}
        mode={worldModal?.mode ?? "create"}
        world={worldModal?.world ?? null}
        onClose={closeWorldModal}
      />
      <CharacterSettingsModal open={isCharacterModalOpen} onClose={() => setCharacterModalOpen(false)} />
      <SessionSelectionModal
        open={sessionModal !== null}
        sessions={sessionModal?.sessions ?? []}
        onSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        onClose={() => setSessionModal(null)}
      />
    </aside>
  );
}

interface SortableWorldListItemProps {
  world: World;
  isSelected: boolean;
  onSelect: () => void;
  onOpenSettings: () => void;
  onDelete: () => void;
}

function SortableWorldListItem({ world, isSelected, onSelect, onOpenSettings, onDelete }: SortableWorldListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: world.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition ${isSelected
        ? "border-emerald-400/60 bg-emerald-400/10"
        : "border-transparent hover:border-slate-700 hover:bg-slate-900/60"
        }`}
    >
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-800 bg-slate-950/60 text-slate-400 transition hover:border-emerald-400/50 hover:text-emerald-200"
        aria-label="Перетащить мир"
        {...attributes}
        {...listeners}
      >
        <GripIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={`flex-1 truncate text-left text-sm font-medium transition ${isSelected ? "text-emerald-100" : "text-slate-200 group-hover:text-white"
          }`}
      >
        {world.name}
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-800 bg-slate-950/60 text-slate-400 transition hover:border-slate-600 hover:text-white"
          aria-label={`Настройки мира «${world.name}»`}
        >
          <KebabIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded border border-red-700/70 bg-slate-950/60 text-red-200 transition hover:border-red-500 hover:text-red-100"
          aria-label={`Удалить мир «${world.name}»`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

interface IconProps {
  className?: string;
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 3.2v9.6M3.2 8h9.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M10 10.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3137 0-6 2.0147-6 4.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5c0-2.4853-2.6863-4.5-6-4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GripIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M5 6h10M5 10h10M5 14h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function KebabIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 3.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm0 3.8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm0 3.8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3.6 4.8h8.8M6.533 3.2h2.934M6 6.4v5.2m4-5.2v5.2M4.4 4.8l.32 7.68c.02.476.41.85.887.85h4.786c.477 0 .867-.374.886-.85l.321-7.68"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

