"use client";

import { create } from "zustand";
import { GameState, GameStore } from "./types";
import { createWorldSlice } from "./slices/worldSlice";
import { createCharacterSlice } from "./slices/characterSlice";
import { createSessionSlice } from "./slices/sessionSlice";
import * as api from "@/services/api";

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

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  actions: {
    ...createWorldSlice(set, get),
    ...createCharacterSlice(set, get),
    ...createSessionSlice(set, get),

    loadInitialData: async () => {
      set({ isInitializing: true, error: null });

      try {
        const [worlds, characters, appState] = await Promise.all([
          api.fetchWorlds(),
          api.fetchCharacters(),
          api.fetchAppState(),
        ]);

        let { currentWorldId, currentCharacterId } = appState;

        // Use persisted ID if available and valid, otherwise fallback
        if (!currentWorldId || !worlds.find((w) => w.id === currentWorldId)) {
          currentWorldId = worlds.at(0)?.id ?? null;
        }

        if (
          !currentCharacterId ||
          !characters.find((c) => c.id === currentCharacterId)
        ) {
          currentCharacterId = characters.at(0)?.id ?? null;
        }

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

    resetError: () => set({ error: null }),
  },
}));
