"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { useGameStore } from "@/store/gameStore";
import type { Character, World } from "@/types/game";
import { generateWorldPreset } from "../randomPresets";

export function Sidebar() {
  const error = useGameStore((state) => state.error);
  const isMutating = useGameStore((state) => state.isMutating);

  return (
    <aside className="flex h-full w-80 flex-col border-r border-slate-800 bg-slate-950/50 p-4 text-slate-100">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">World Explorer</h1>
        <p className="text-sm text-slate-400">
          Управляйте персонажами и мирами, чтобы начать текстовое приключение.
        </p>
        {error && (
          <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
            {error}
          </p>
        )}
        {isMutating && (
          <p className="text-xs text-slate-400">Синхронизация данных…</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto pr-2">
        <CharacterSection />
        <WorldSection />
        <InventorySummary />
      </div>
      <footer className="mt-6 text-xs text-slate-500">
        Прототип локального режима. Данные сохраняются в каталоге <code>data/</code>.
      </footer>
    </aside>
  );
}

function InventorySummary() {
  const currentCharacterId = useGameStore((state) => state.currentCharacterId);
  const characters = useGameStore((state) => state.characters);

  const currentCharacter = useMemo(
    () => characters.find((character) => character.id === currentCharacterId) ?? null,
    [characters, currentCharacterId],
  );

  if (!currentCharacter) {
    return null;
  }

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Инвентарь
        </h2>
      </header>
      {currentCharacter.inventory.length === 0 ? (
        <div className="rounded border border-dashed border-slate-700 p-3 text-xs text-slate-400">
          Инвентарь пуст. Возьмите предмет в одной из локаций.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {currentCharacter.inventory.map((item) => (
            <li key={item.id} className="rounded border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-sm font-medium text-slate-100">{item.name}</p>
              <p className="mt-1 text-xs text-slate-400">{item.description || "Описание отсутствует"}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                {item.portable ? "Можно переносить" : "Непереносимый предмет"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CharacterSection() {
  const characters = useGameStore((state) => state.characters);
  const worlds = useGameStore((state) => state.worlds);
  const currentCharacterId = useGameStore((state) => state.currentCharacterId);
  const actions = useGameStore((state) => state.actions);
  const [createOpen, setCreateOpen] = useState(characters.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    worldId: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    worldId: "",
  });

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [characters],
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createForm.name.trim() || !createForm.description.trim()) {
      return;
    }

    await actions.createCharacter({
      name: createForm.name,
      description: createForm.description,
      currentWorldId: createForm.worldId || null,
    });

    setCreateForm({ name: "", description: "", worldId: "" });
    setCreateOpen(false);
  };

  const startEdit = (character: Character) => {
    setEditingId(character.id);
    setEditForm({
      name: character.name,
      description: character.description,
      worldId: character.currentWorldId ?? "",
    });
  };

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    await actions.updateCharacter(editingId, {
      name: editForm.name,
      description: editForm.description,
      currentWorldId: editForm.worldId || null,
    });

    setEditingId(null);
  };

  const handleDelete = async (character: Character) => {
    const confirmation = window.confirm(
      `Удалить персонажа «${character.name}»? Это действие нельзя отменить.`,
    );
    if (!confirmation) {
      return;
    }

    await actions.deleteCharacter(character.id);
  };

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Персонажи
        </h2>
        <button
          type="button"
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 hover:text-white"
          onClick={() => setCreateOpen((value) => !value)}
        >
          {createOpen ? "Скрыть" : "Создать"}
        </button>
      </header>

      {createOpen && (
        <form
          onSubmit={handleCreate}
          className="mb-4 flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/60 p-3"
        >
          <label className="flex flex-col gap-1 text-xs">
            Имя
            <input
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Имя персонажа"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Описание
            <textarea
              className="resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={3}
              placeholder="Кто ваш герой?"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Текущий мир
            <select
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.worldId}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, worldId: event.target.value }))
              }
            >
              <option value="">Без привязки</option>
              {worlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="mt-1 rounded bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
          >
            Сохранить персонажа
          </button>
        </form>
      )}

      <ul className="flex flex-col gap-2">
        {sortedCharacters.length === 0 && (
          <li className="rounded border border-dashed border-slate-700 p-3 text-xs text-slate-400">
            Ещё нет персонажей. Создайте героя, чтобы начать приключение.
          </li>
        )}
        {sortedCharacters.map((character) => {
          const isSelected = currentCharacterId === character.id;

          return (
            <li key={character.id} className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => actions.selectCharacter(character.id)}
                  className={`flex-1 text-left text-sm font-medium text-slate-100 transition hover:text-white ${isSelected ? "rounded border border-emerald-400/60 bg-emerald-400/10 px-2 py-1" : ""}`}
                >
                  <span className="block text-sm font-semibold">
                    {character.name}
                    {isSelected && <span className="ml-2 text-xs text-emerald-300">текущий</span>}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {character.description || "Описание отсутствует"}
                  </span>
                  {character.currentWorldId && (
                    <span className="mt-2 inline-block rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">
                      В мире: {worlds.find((world) => world.id === character.currentWorldId)?.name ?? "Неизвестно"}
                    </span>
                  )}
                </button>
                <div className="flex flex-col gap-1 text-xs">
                  <button
                    type="button"
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200 hover:border-slate-500"
                    onClick={() => startEdit(character)}
                  >
                    Ред.
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-700/70 px-2 py-1 text-[10px] uppercase tracking-wide text-red-200 hover:border-red-500"
                    onClick={() => handleDelete(character)}
                  >
                    Удал.
                  </button>
                </div>
              </div>

              {editingId === character.id && (
                <form
                  onSubmit={handleEdit}
                  className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 p-3"
                >
                  <label className="flex flex-col gap-1 text-xs">
                    Имя
                    <input
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.name}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Описание
                    <textarea
                      className="resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.description}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      rows={3}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Текущий мир
                    <select
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.worldId}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, worldId: event.target.value }))
                      }
                    >
                      <option value="">Без привязки</option>
                      {worlds.map((world) => (
                        <option key={world.id} value={world.id}>
                          {world.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="submit"
                      className="flex-1 rounded bg-slate-200 px-3 py-1 font-semibold text-slate-900 hover:bg-white"
                    >
                      Обновить
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-slate-500"
                      onClick={() => setEditingId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WorldSection() {
  const worlds = useGameStore((state) => state.worlds);
  const currentWorldId = useGameStore((state) => state.currentWorldId);
  const actions = useGameStore((state) => state.actions);
  const [createOpen, setCreateOpen] = useState(worlds.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    name: "",
    setting: "",
    atmosphere: "",
    genre: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    setting: "",
    atmosphere: "",
    genre: "",
  });

  const sortedWorlds = useMemo(
    () => [...worlds].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [worlds],
  );

  const applyRandomPreset = () => {
    const preset = generateWorldPreset();
    setCreateForm((prev) => ({ ...prev, ...preset }));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createForm.setting.trim() || !createForm.atmosphere.trim() || !createForm.genre.trim()) {
      return;
    }

    await actions.createWorld({
      name: createForm.name || "Новый мир",
      setting: createForm.setting,
      atmosphere: createForm.atmosphere,
      genre: createForm.genre,
    });

    setCreateForm({ name: "", setting: "", atmosphere: "", genre: "" });
    setCreateOpen(false);
  };

  const startEdit = (world: World) => {
    setEditingId(world.id);
    setEditForm({
      name: world.name,
      setting: world.setting,
      atmosphere: world.atmosphere,
      genre: world.genre,
    });
  };

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    await actions.updateWorld(editingId, {
      name: editForm.name,
      setting: editForm.setting,
      atmosphere: editForm.atmosphere,
      genre: editForm.genre,
    });

    setEditingId(null);
  };

  const handleDelete = async (world: World) => {
    const confirmation = window.confirm(
      `Удалить мир «${world.name}»? Все связанные данные будут утеряны.`,
    );
    if (!confirmation) {
      return;
    }

    await actions.deleteWorld(world.id);
  };

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Миры
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 hover:text-white"
            onClick={() => setCreateOpen((value) => !value)}
          >
            {createOpen ? "Скрыть" : "Создать"}
          </button>
          <button
            type="button"
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 hover:text-white"
            onClick={applyRandomPreset}
            disabled={!createOpen}
          >
            Случайно
          </button>
        </div>
      </header>

      {createOpen && (
        <form
          onSubmit={handleCreate}
          className="mb-4 flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/60 p-3"
        >
          <label className="flex flex-col gap-1 text-xs">
            Название мира
            <input
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Например: Затерянный город"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Сеттинг
            <textarea
              className="resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.setting}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, setting: event.target.value }))
              }
              rows={2}
              placeholder="Где разворачиваются события"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Атмосфера
            <textarea
              className="resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.atmosphere}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, atmosphere: event.target.value }))
              }
              rows={2}
              placeholder="Общее настроение"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Жанр
            <input
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              value={createForm.genre}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, genre: event.target.value }))
              }
              placeholder="Например: нуар"
              required
            />
          </label>
          <button
            type="submit"
            className="mt-1 rounded bg-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-200"
          >
            Создать мир
          </button>
        </form>
      )}

      <ul className="flex flex-col gap-2">
        {sortedWorlds.length === 0 && (
          <li className="rounded border border-dashed border-slate-700 p-3 text-xs text-slate-400">
            Список миров пуст. Создайте новый мир с произвольными параметрами или
            воспользуйтесь случайной генерацией.
          </li>
        )}
        {sortedWorlds.map((world) => {
          const isSelected = currentWorldId === world.id;

          return (
            <li key={world.id} className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className={`flex-1 text-left transition ${isSelected ? "rounded border border-emerald-400/60 bg-emerald-400/10 px-2 py-1" : ""}`}
                  onClick={() => actions.selectWorld(world.id)}
                >
                  <span className="block text-sm font-semibold text-slate-100">
                    {world.name}
                    {isSelected && <span className="ml-2 text-xs text-emerald-300">текущий</span>}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">{world.setting}</span>
                  <span className="mt-1 inline-block rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">
                    {world.genre}
                  </span>
                  <p className="mt-1 text-[10px] text-slate-500">{world.atmosphere}</p>
                </button>
                <div className="flex flex-col gap-1 text-xs">
                  <button
                    type="button"
                    className="rounded border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200 hover:border-slate-500"
                    onClick={() => startEdit(world)}
                  >
                    Ред.
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-700/70 px-2 py-1 text-[10px] uppercase tracking-wide text-red-200 hover:border-red-500"
                    onClick={() => handleDelete(world)}
                  >
                    Удал.
                  </button>
                </div>
              </div>

              {editingId === world.id && (
                <form
                  onSubmit={handleEdit}
                  className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 p-3"
                >
                  <label className="flex flex-col gap-1 text-xs">
                    Название
                    <input
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.name}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Сеттинг
                    <textarea
                      className="resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.setting}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, setting: event.target.value }))
                      }
                      rows={2}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Атмосфера
                    <textarea
                      className="resize-none rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.atmosphere}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, atmosphere: event.target.value }))
                      }
                      rows={2}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Жанр
                    <input
                      className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                      value={editForm.genre}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, genre: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="submit"
                      className="flex-1 rounded bg-slate-200 px-3 py-1 font-semibold text-slate-900 hover:bg-white"
                    >
                      Обновить
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-slate-500"
                      onClick={() => setEditingId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

