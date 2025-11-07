"use client";

import type { FormEvent } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useGameStore } from "@/store/gameStore";

export function ChatPanel() {
  const currentWorldId = useGameStore((state) => state.currentWorldId);
  const currentCharacterId = useGameStore((state) => state.currentCharacterId);
  const worlds = useGameStore((state) => state.worlds);
  const characters = useGameStore((state) => state.characters);
  const messages = useGameStore((state) => state.messages);
  const suggestions = useGameStore((state) => state.suggestions);
  const isProcessingTurn = useGameStore((state) => state.isProcessingTurn);
  const actions = useGameStore((state) => state.actions);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentWorld = useMemo(
    () => worlds.find((world) => world.id === currentWorldId) ?? null,
    [currentWorldId, worlds],
  );
  const currentCharacter = useMemo(
    () => characters.find((character) => character.id === currentCharacterId) ?? null,
    [characters, currentCharacterId],
  );

  const currentLocationNode =
    currentWorld?.graph[
      currentCharacter?.currentLocationId ?? currentWorld.entryLocationId
    ] ?? null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() || !currentWorld || !currentCharacter) {
      return;
    }

    void actions.sendPlayerMessage(input.trim());
    setInput("");
  };

  return (
    <section className="flex flex-1 min-h-0 flex-col border-r border-slate-800 bg-slate-950/30">
      <header className="border-b border-slate-800 bg-slate-950/60 px-6 py-4">
        {currentWorld && currentCharacter ? (
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-100">
              {currentWorld.name}
            </h2>
            <p className="text-sm text-slate-400">
              Персонаж: <span className="text-slate-100">{currentCharacter.name}</span>
            </p>
            <div className="text-xs text-slate-500">
              <p>Сеттинг: {currentWorld.setting}</p>
              <p>Атмосфера: {currentWorld.atmosphere}</p>
              <p>Жанр: {currentWorld.genre}</p>
            </div>
            {currentLocationNode?.mapDescription && (
              <p className="mt-2 text-xs text-slate-400">
                Текущая локация:{" "}
                <span className="text-slate-200">{currentLocationNode.locationName}</span>.{" "}
                <span className="text-slate-300">{currentLocationNode.mapDescription}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            Выберите мир и персонажа слева, чтобы начать путешествие.
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded border border-dashed border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
            <div className="flex flex-col items-center gap-3 text-center">
              <p>История диалога появится после начала исследования мира.</p>
              {currentWorld && currentCharacter && (
                <button
                  type="button"
                  className="rounded border border-emerald-400/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300 hover:text-emerald-100"
                  onClick={() => {
                    void actions.requestInitialTurn();
                  }}
                  disabled={isProcessingTurn}
                >
                  Получить вступительное описание
                </button>
              )}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {(() => {
              let lastLocationId: string | null = null;

              return messages.map((message) => {
                const locationId = message.locationId ?? lastLocationId;
                const locationChanged =
                  locationId !== null && locationId !== lastLocationId && message.author === "gm";
                lastLocationId = locationId ?? lastLocationId;
                const locationNode =
                  locationId && currentWorld ? currentWorld.graph[locationId] ?? null : null;

                return (
                  <Fragment key={message.id}>
                    {locationChanged && (
                      <div className="flex flex-col items-center gap-1 text-center">
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-wide text-emerald-200">
                          Локация: {locationNode?.locationName ?? "Неизвестно"}
                        </span>
                        {locationNode?.mapDescription && (
                          <span className="max-w-md text-[11px] text-slate-400">
                            {locationNode.mapDescription}
                          </span>
                        )}
                      </div>
                    )}
                    <li
                      className={`max-w-2xl rounded-lg px-4 py-3 text-sm leading-relaxed ${message.author === "player" ? "self-end bg-emerald-400/20 text-emerald-100" : "self-start bg-slate-800/80 text-slate-100"}`}
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        {message.author === "player" ? "Игрок" : "ГМ"}
                      </p>
                      <p className="mt-1 whitespace-pre-line">{message.message}</p>
                    </li>
                  </Fragment>
                );
              });
            })()}
            <div ref={messagesEndRef} />
          </ul>
        )}
      </div>

      <footer className="border-t border-slate-800 bg-slate-950/60 px-6 py-4">
        {suggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setInput(suggestion)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-emerald-300 hover:text-emerald-100"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form className="flex gap-3" onSubmit={handleSubmit}>
          <textarea
            className="min-h-[60px] flex-1 resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
            placeholder={
              currentWorld && currentCharacter
                ? "Опишите действие персонажа..."
                : "Сначала выберите мир и персонажа"
            }
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={!currentWorld || !currentCharacter || isProcessingTurn}
          />
          <button
            type="submit"
            className="h-fit self-end rounded bg-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            disabled={!currentWorld || !currentCharacter || !input.trim() || isProcessingTurn}
          >
            {isProcessingTurn ? "ГМ отвечает…" : "Отправить"}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          {currentWorld && currentCharacter
            ? "ГМ отвечает, учитывая контекст персонажа и мира."
            : "Сначала выберите мир и персонажа."}
        </p>
      </footer>
    </section>
  );
}

