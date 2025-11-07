"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { useGameStore } from "@/store/gameStore";
import type { World } from "@/types/game";

import { generateWorldPreset } from "../randomPresets";
import { Modal } from "./Modal";

interface WorldSettingsModalProps {
  open: boolean;
  mode: "create" | "edit";
  world: World | null;
  onClose: () => void;
}

const EMPTY_FORM = {
  name: "",
  setting: "",
  atmosphere: "",
  genre: "",
};

export function WorldSettingsModal({ open, mode, world, onClose }: WorldSettingsModalProps) {
  const actions = useGameStore((state) => state.actions);
  const isMutating = useGameStore((state) => state.isMutating);

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && world) {
      setForm({
        name: world.name,
        setting: world.setting,
        atmosphere: world.atmosphere,
        genre: world.genre,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, world]);

  const isProcessing = submitting || isMutating;
  const canSubmit = form.setting.trim() !== "" && form.atmosphere.trim() !== "" && form.genre.trim() !== "";

  const header = useMemo(() => {
    if (mode === "edit" && world) {
      return {
        title: `Настройки мира «${world.name}»`,
        description: "Редактируйте параметры выбранного мира или удалите его." ,
      };
    }

    return {
      title: "Создать новый мир",
      description: "Заполните основные поля, чтобы добавить новый сеттинг для приключения.",
    };
  }, [mode, world]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit || isProcessing) {
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "create") {
        const result = await actions.createWorld({
          name: form.name.trim(),
          setting: form.setting.trim(),
          atmosphere: form.atmosphere.trim(),
          genre: form.genre.trim(),
        });

        if (result) {
          onClose();
        }
      } else if (world) {
        const result = await actions.updateWorld(world.id, {
          name: form.name.trim() || undefined,
          setting: form.setting.trim(),
          atmosphere: form.atmosphere.trim(),
          genre: form.genre.trim(),
        });

        if (result) {
          onClose();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!world || isProcessing) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить мир «${world.name}»? Все связанные данные будут утеряны.`,
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);

    try {
      const success = await actions.deleteWorld(world.id);
      if (success) {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const applyRandomPreset = () => {
    const preset = generateWorldPreset();
    setForm((prev) => ({ ...prev, ...preset }));
  };

  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch (error) {
      console.error(error);
      return value;
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={header.title}
      description={header.description}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {mode === "edit" && world && (
          <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400 sm:grid-cols-2">
            <p>
              <span className="text-slate-500">Создан:</span> {formatDate(world.createdAt)}
            </p>
            <p>
              <span className="text-slate-500">Обновлён:</span> {formatDate(world.updatedAt)}
            </p>
            <p className="sm:col-span-2">
              <span className="text-slate-500">ID:</span> <code className="text-slate-300">{world.id}</code>
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            Название мира
            <input
              className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Например: Затерянный город"
            />
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
              Сеттинг
              <textarea
                className="min-h-[80px] rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                value={form.setting}
                onChange={(event) => setForm((prev) => ({ ...prev, setting: event.target.value }))}
                placeholder="Где разворачиваются события"
                required
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            Атмосфера
            <textarea
              className="min-h-[80px] rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
              value={form.atmosphere}
              onChange={(event) => setForm((prev) => ({ ...prev, atmosphere: event.target.value }))}
              placeholder="Общее настроение"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-400">
            Жанр
            <input
              className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
              value={form.genre}
              onChange={(event) => setForm((prev) => ({ ...prev, genre: event.target.value }))}
              placeholder="Например: нуар"
              required
            />
          </label>
        </div>

        {mode === "create" && (
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3 text-xs text-slate-400">
            <p>
              Нужна идея? Попробуйте сгенерировать случайные параметры.
            </p>
            <button
              type="button"
              onClick={applyRandomPreset}
              className="rounded border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Случайный пресет
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canSubmit || isProcessing}
              className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {mode === "create" ? "Создать мир" : "Сохранить изменения"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
              disabled={isProcessing}
            >
              Отмена
            </button>
          </div>

          {mode === "edit" && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded border border-red-700/70 px-4 py-2 text-sm text-red-200 transition hover:border-red-500 hover:text-red-100"
              disabled={isProcessing}
            >
              Удалить мир
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

