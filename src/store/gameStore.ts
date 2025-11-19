"use client";

import { create } from "zustand";

import type {
  Character,
  CharacterId,
  CreateCharacterPayload,
  CreateWorldPayload,
  SessionEntry,
  UpdateCharacterPayload,
  UpdateWorldPayload,
  World,
  WorldId,
} from "@/types/game";

interface GameState {
  worlds: World[];
  characters: Character[];
  currentWorldId: WorldId | null;
  currentCharacterId: CharacterId | null;
  messages: SessionEntry[];
  suggestions: string[];
  isInitializing: boolean;
  isProcessingTurn: boolean;
  isMutating: boolean;
  error: string | null;
  forceNewSession: boolean;
  actions: GameActions;
}

interface GameActions {
  loadInitialData: () => Promise<void>;
  loadSessionLog: (worldId: WorldId | null, characterId: CharacterId | null, sessionId?: string) => Promise<void>;
  selectWorld: (worldId: WorldId | null, sessionId?: string) => void;
  selectCharacter: (characterId: CharacterId | null) => void;
  requestInitialTurn: () => Promise<void>;
  sendPlayerMessage: (message: string) => Promise<void>;
  createWorld: (payload: CreateWorldPayload) => Promise<World | null>;
  updateWorld: (worldId: WorldId, payload: UpdateWorldPayload) => Promise<World | null>;
  deleteWorld: (worldId: WorldId) => Promise<boolean>;
  createCharacter: (payload: CreateCharacterPayload) => Promise<Character | null>;
  updateCharacter: (
    characterId: CharacterId,
    payload: UpdateCharacterPayload,
  ) => Promise<Character | null>;
  deleteCharacter: (characterId: CharacterId) => Promise<boolean>;
}

const initialState: Omit<GameState, "actions"> = {
  worlds: [],
  characters: [],
  currentWorldId: null,
  currentCharacterId: null,
  messages: [],
  suggestions: [],
  isInitializing: true,
  isProcessingTurn: false,
  isMutating: false,
  error: null,
  forceNewSession: false,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,
  actions: {
    loadInitialData: async () => {
      set({ isInitializing: true, error: null });

      try {
        const [worldsResponse, charactersResponse] = await Promise.all([
          fetch("/api/worlds", { cache: "no-store" }),
          fetch("/api/characters", { cache: "no-store" }),
        ]);

        if (!worldsResponse.ok || !charactersResponse.ok) {
          throw new Error("Ошибка загрузки данных");
        }

        const [worlds, characters] = (await Promise.all([
          worldsResponse.json(),
          charactersResponse.json(),
        ])) as [World[], Character[]];

        const currentWorldId = get().currentWorldId ?? worlds.at(0)?.id ?? null;
        const currentCharacterId =
          get().currentCharacterId ?? characters.at(0)?.id ?? null;

        set({
          worlds,
          characters,
          currentWorldId,
          currentCharacterId,
          messages: [],
          suggestions: [],
          isInitializing: false,
          isProcessingTurn: false,
        });

        await get().actions.loadSessionLog(currentWorldId, currentCharacterId);
      } catch (error) {
        console.error(error);
        set({
          error: error instanceof Error ? error.message : "Неизвестная ошибка",
          isInitializing: false,
          isProcessingTurn: false,
        });
      }
    },

    loadSessionLog: async (worldId, characterId, sessionId) => {
      if (!worldId || !characterId) {
        set({ messages: [], suggestions: [] });
        return;
      }

      // If explicitly "new" session, clear messages without loading
      if (sessionId === "new") {
        set({ messages: [], suggestions: [], error: null });
        return;
      }

      try {
        const params = new URLSearchParams({ characterId, worldId });
        if (sessionId) {
          params.append("sessionId", sessionId);
        }

        const response = await fetch(`/api/session/log?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить историю сессии");
        }

        const data = (await response.json()) as {
          file: string | null;
          entries: SessionEntry[];
        };

        set({ messages: data.entries, suggestions: [], error: null });
      } catch (error) {
        console.error(error);
        set({ error: "Не удалось загрузить историю", messages: [] });
      }
    },

    selectWorld: (worldId, sessionId) => {
      set({
        currentWorldId: worldId,
        messages: [],
        suggestions: [],
        error: null,
        forceNewSession: sessionId === "new", // Mark that we need a new session on next turn
      });

      void get().actions.loadSessionLog(worldId, get().currentCharacterId, sessionId);
    },

    selectCharacter: (characterId) => {
      set({ currentCharacterId: characterId, messages: [], suggestions: [], error: null });

      void get().actions.loadSessionLog(get().currentWorldId, characterId);
    },

    requestInitialTurn: async () => {
      await processSessionTurn({ isInitial: true, message: "" }, set, get);
    },

    sendPlayerMessage: async (message) => {
      if (!message.trim()) {
        return;
      }

      await processSessionTurn({ isInitial: false, message }, set, get);
    },

    createWorld: async (payload) => {
      set({ isMutating: true, error: null });

      try {
        const response = await fetch("/api/worlds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error?.error ?? "Не удалось создать мир");
        }

        const world = (await response.json()) as World;
        set((state) => {
          const worlds = [...state.worlds, world];
          return {
            worlds,
            currentWorldId: world.id,
            messages: [],
            suggestions: [],
            isMutating: false,
          };
        });

        await get().actions.loadSessionLog(world.id, get().currentCharacterId);

        return world;
      } catch (error) {
        console.error(error);
        set({
          error: error instanceof Error ? error.message : "Не удалось создать мир",
          isMutating: false,
        });
        return null;
      }
    },

    updateWorld: async (worldId, payload) => {
      set({ isMutating: true, error: null });

      try {
        const response = await fetch(`/api/worlds/${worldId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error?.error ?? "Не удалось обновить мир");
        }

        const world = (await response.json()) as World;
        set((state) => {
          const worlds = state.worlds.map((item) => (item.id === world.id ? world : item));
          return {
            worlds,
            messages: [],
            isMutating: false,
          };
        });

        await get().actions.loadSessionLog(get().currentWorldId, get().currentCharacterId);

        return world;
      } catch (error) {
        console.error(error);
        set({
          error: error instanceof Error ? error.message : "Не удалось обновить мир",
          isMutating: false,
        });
        return null;
      }
    },

    deleteWorld: async (worldId) => {
      set({ isMutating: true, error: null });

      try {
        const response = await fetch(`/api/worlds/${worldId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error?.error ?? "Не удалось удалить мир");
        }

        set((state) => {
          const worlds = state.worlds.filter((world) => world.id !== worldId);
          const currentWorldId =
            state.currentWorldId === worldId ? worlds.at(0)?.id ?? null : state.currentWorldId;

          return {
            worlds,
            currentWorldId,
            messages: [],
            suggestions: [],
            isMutating: false,
          };
        });

        await get().actions.loadSessionLog(get().currentWorldId, get().currentCharacterId);

        return true;
      } catch (error) {
        console.error(error);
        set({
          error: error instanceof Error ? error.message : "Не удалось удалить мир",
          isMutating: false,
        });
        return false;
      }
    },

    createCharacter: async (payload) => {
      set({ isMutating: true, error: null });

      try {
        const response = await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error?.error ?? "Не удалось создать персонажа");
        }

        const character = (await response.json()) as Character;
        set((state) => {
          const characters = [...state.characters, character];
          return {
            characters,
            currentCharacterId: character.id,
            messages: [],
            suggestions: [],
            isMutating: false,
          };
        });

        await get().actions.loadSessionLog(get().currentWorldId, character.id);

        return character;
      } catch (error) {
        console.error(error);
        set({
          error:
            error instanceof Error ? error.message : "Не удалось создать персонажа",
          isMutating: false,
        });
        return null;
      }
    },

    updateCharacter: async (characterId, payload) => {
      set({ isMutating: true, error: null });

      try {
        const response = await fetch(`/api/characters/${characterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error?.error ?? "Не удалось обновить персонажа");
        }

        const character = (await response.json()) as Character;
        set((state) => {
          const characters = state.characters.map((item) =>
            item.id === character.id ? character : item,
          );
          return {
            characters,
            messages: [],
            isMutating: false,
          };
        });

        await get().actions.loadSessionLog(get().currentWorldId, get().currentCharacterId);

        return character;
      } catch (error) {
        console.error(error);
        set({
          error:
            error instanceof Error ? error.message : "Не удалось обновить персонажа",
          isMutating: false,
        });
        return null;
      }
    },

    deleteCharacter: async (characterId) => {
      set({ isMutating: true, error: null });

      try {
        const response = await fetch(`/api/characters/${characterId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error?.error ?? "Не удалось удалить персонажа");
        }

        set((state) => {
          const characters = state.characters.filter((character) => character.id !== characterId);
          const currentCharacterId =
            state.currentCharacterId === characterId
              ? characters.at(0)?.id ?? null
              : state.currentCharacterId;

          return {
            characters,
            currentCharacterId,
            messages: [],
            suggestions: [],
            isMutating: false,
          };
        });

        await get().actions.loadSessionLog(get().currentWorldId, get().currentCharacterId);

        return true;
      } catch (error) {
        console.error(error);
        set({
          error:
            error instanceof Error ? error.message : "Не удалось удалить персонажа",
          isMutating: false,
        });
        return false;
      }
    },
  },
}));

interface ProcessTurnOptions {
  message: string;
  isInitial: boolean;
}

async function processSessionTurn(
  { message, isInitial }: ProcessTurnOptions,
  set: (partial: Partial<GameState>) => void,
  get: () => GameState,
) {
  const state = get();
  const { currentWorldId, currentCharacterId, forceNewSession } = state;

  if (!currentWorldId || !currentCharacterId) {
    set({ error: "Выберите мир и персонажа, чтобы продолжить" });
    return;
  }

  set({ isProcessingTurn: true, error: null });

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        worldId: currentWorldId,
        characterId: currentCharacterId,
        message,
        isInitial,
        forceNew: forceNewSession, // Pass the flag to create a new session
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error ?? "Не удалось получить ответ ГМ");
    }

    const data = (await response.json()) as {
      world: World;
      character: Character;
      session: {
        file: string | null;
        entries: SessionEntry[];
      };
      suggestions?: string[];
    };

    set((prev) => {
      const worlds = upsertWorld(prev.worlds, data.world);
      const characters = upsertCharacter(prev.characters, data.character);
      return {
        worlds,
        characters,
        messages: data.session.entries,
        suggestions: data.suggestions ?? [],
        isProcessingTurn: false,
        forceNewSession: false, // Reset the flag after successful turn
      };
    });
  } catch (error) {
    console.error(error);
    set({
      error: error instanceof Error ? error.message : "Ошибка общения с ГМ",
      isProcessingTurn: false,
    });
  }
}

function upsertWorld(worlds: World[], updated: World): World[] {
  const exists = worlds.some((world) => world.id === updated.id);
  return exists ? worlds.map((world) => (world.id === updated.id ? updated : world)) : [...worlds, updated];
}

function upsertCharacter(characters: Character[], updated: Character): Character[] {
  const exists = characters.some((character) => character.id === updated.id);
  return exists
    ? characters.map((character) => (character.id === updated.id ? updated : character))
    : [...characters, updated];
}

