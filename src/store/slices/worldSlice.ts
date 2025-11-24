import { StateCreator } from "zustand";
import { GameStore } from "../types";
import * as api from "@/services/api";
import { CreateWorldPayload, UpdateWorldPayload, WorldId } from "@/types/game";

export const createWorldSlice = (
    set: any,
    get: () => GameStore
) => ({
    loadWorlds: async () => {
        try {
            const worlds = await api.fetchWorlds();
            set({ worlds, error: null });
        } catch (error) {
            console.error(error);
            set({ error: "Не удалось загрузить миры" });
        }
    },

    createWorld: async (payload: CreateWorldPayload) => {
        set({ isMutating: true, error: null });
        try {
            const world = await api.createWorld(payload);
            set((state: GameStore) => {
                const worlds = [...state.worlds, world];
                return {
                    worlds,
                    currentWorldId: world.id,
                    messages: [],
                    suggestions: [],
                    isMutating: false,
                };
            });

            await api.saveAppState({ currentWorldId: world.id });
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

    updateWorld: async (worldId: WorldId, payload: UpdateWorldPayload) => {
        set({ isMutating: true, error: null });
        try {
            const world = await api.updateWorld(worldId, payload);
            set((state: GameStore) => {
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

    deleteWorld: async (worldId: WorldId) => {
        set({ isMutating: true, error: null });
        try {
            await api.deleteWorld(worldId);
            set((state: GameStore) => {
                const worlds = state.worlds.filter((world) => world.id !== worldId);
                const currentWorldId =
                    state.currentWorldId === worldId ? worlds.at(0)?.id ?? null : state.currentWorldId;

                if (state.currentWorldId === worldId) {
                    api.saveAppState({ currentWorldId });
                }

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

    selectWorld: (worldId: WorldId | null, sessionId?: string) => {
        set({
            currentWorldId: worldId,
            messages: [],
            suggestions: [],
            error: null,
            forceNewSession: sessionId === "new",
        });

        api.saveAppState({ currentWorldId: worldId }).catch(console.error);
        void get().actions.loadSessionLog(worldId, get().currentCharacterId, sessionId);
    },
});
