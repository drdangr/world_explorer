"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { useGameStore } from "@/store/gameStore";
import type { Character } from "@/types/game";

import { Modal } from "./Modal";

interface CharacterSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const EMPTY_CHARACTER_FORM = {
  name: "",
  description: "",
  worldId: "",
};

export function CharacterSettingsModal({ open, onClose }: CharacterSettingsModalProps) {
  const characters = useGameStore((state) => state.characters);
  const worlds = useGameStore((state) => state.worlds);
  const currentCharacterId = useGameStore((state) => state.currentCharacterId);
  const actions = useGameStore((state) => state.actions);
  const isMutating = useGameStore((state) => state.isMutating);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CHARACTER_FORM);
  const [editForm, setEditForm] = useState(EMPTY_CHARACTER_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCreateOpen(characters.length === 0);
    setCreateForm(EMPTY_CHARACTER_FORM);
    setSelectedId((previous) => {
      if (previous && characters.some((character) => character.id === previous)) {
        return previous;
      }

      return currentCharacterId ?? characters.at(0)?.id ?? null;
    });
  }, [open, characters, currentCharacterId]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? null,
    [characters, selectedId],
  );

  useEffect(() => {
    if (selectedCharacter) {
      setEditForm({
        name: selectedCharacter.name,
        description: selectedCharacter.description,
        worldId: selectedCharacter.currentWorldId ?? "",
      });
    } else {
      setEditForm(EMPTY_CHARACTER_FORM);
    }
  }, [selectedCharacter]);

  const isProcessing = submitting || isMutating;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createForm.name.trim() || !createForm.description.trim() || isProcessing) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await actions.createCharacter({
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        currentWorldId: createForm.worldId || null,
      });

      if (result) {
        setCreateForm(EMPTY_CHARACTER_FORM);
        setCreateOpen(false);
        setSelectedId(result.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedCharacter || !editForm.name.trim() || !editForm.description.trim() || isProcessing) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await actions.updateCharacter(selectedCharacter.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        currentWorldId: editForm.worldId || null,
      });

      if (result) {
        // Keep modal open for further edits
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (character: Character) => {
    if (isProcessing) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить персонажа «${character.name}»? Это действие нельзя отменить.`,
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      const success = await actions.deleteCharacter(character.id);
      if (success) {
        if (selectedId === character.id) {
          setSelectedId(characters.filter((item) => item.id !== character.id).at(0)?.id ?? null);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMakeCurrent = async () => {
    if (!selectedCharacter) {
      return;
    }

    actions.selectCharacter(selectedCharacter.id);
  };

  const characterList = characters.map((character) => {
    const isSelected = character.id === selectedId;
    const isCurrent = character.id === currentCharacterId;

    return (
      <li key={character.id}>
        <button
          type="button"
          onClick={() => setSelectedId(character.id)}
          className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
            isSelected
              ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
              : "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700 hover:text-white"
          }`}
        >
          <span className="flex-1">
            <span className="block font-semibold">{character.name}</span>
            <span className="mt-1 line-clamp-2 text-xs text-slate-400">{character.description}</span>
          </span>
          {isCurrent && (
            <span className="rounded-full border border-emerald-400/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
              текущий
            </span>
          )}
        </button>
      </li>
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Персонажи"
      description="Выберите персонажа, настройте параметры или создайте нового героя."
      size="lg"
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        <aside className="lg:w-60">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Список</h3>
            <button
              type="button"
              onClick={() => setCreateOpen((value) => !value)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              {createOpen ? "Скрыть" : "Создать"}
            </button>
          </div>
          {characters.length === 0 ? (
            <p className="rounded border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-400">
              Пока нет персонажей. Создайте героя, чтобы начать приключение.
            </p>
          ) : (
            <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-2 text-sm">
              {characterList}
            </ul>
          )}
        </aside>

        <div className="flex-1">
          {createOpen && (
            <form
              onSubmit={handleCreate}
              className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <h3 className="text-sm font-semibold text-slate-200">Создать персонажа</h3>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                Имя
                <input
                  className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Имя персонажа"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                Описание
                <textarea
                  className="min-h-[80px] rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Кто ваш герой?"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                Текущий мир
                <select
                  className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
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
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                  disabled={isProcessing}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          {selectedCharacter ? (
            <div className="flex flex-col gap-5">
              <form
                onSubmit={handleUpdate}
                className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-4"
              >
                <header className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Параметры персонажа
                    </h3>
                    <p className="text-xs text-slate-500">Обновите имя, описание и привязку к миру.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleMakeCurrent}
                    className="rounded border border-emerald-400/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
                    disabled={isProcessing || selectedCharacter.id === currentCharacterId}
                  >
                    Сделать текущим
                  </button>
                </header>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                  Имя
                  <input
                    className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                  Описание
                  <textarea
                    className="min-h-[100px] rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
                  Привязка к миру
                  <select
                    className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    Сохранить изменения
                  </button>
                  <button
                    type="button"
                    onClick={() => selectedCharacter && handleDelete(selectedCharacter)}
                    className="rounded border border-red-700/70 px-4 py-2 text-sm text-red-200 transition hover:border-red-500 hover:text-red-100"
                    disabled={isProcessing}
                  >
                    Удалить персонажа
                  </button>
                </div>
              </form>

              <section className="rounded-lg border border-slate-800 bg-slate-900/20 px-4 py-4">
                <header className="mb-3">
                  <h3 className="text-sm font-semibold text-slate-200">Инвентарь</h3>
                  <p className="text-xs text-slate-500">
                    Предметы, которые герой держит при себе.
                  </p>
                </header>
                {selectedCharacter.inventory.length === 0 ? (
                  <p className="rounded border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-400">
                    Инвентарь пуст. Возьмите предмет в одной из локаций.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {selectedCharacter.inventory.map((item) => (
                      <li
                        key={item.id}
                        className="rounded border border-slate-800 bg-slate-950 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-slate-100">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.description || "Описание отсутствует"}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                          {item.portable ? "Можно переносить" : "Непереносимый предмет"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">
              Выберите персонажа слева или создайте нового.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

