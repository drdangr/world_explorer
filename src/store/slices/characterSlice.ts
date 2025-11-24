import { GameStore } from "../types";
import * as api from "@/services/api";
import { CharacterId, CreateCharacterPayload, UpdateCharacterPayload } from "@/types/game";

export const createCharacterSlice = (
    set: any,
    get: () => GameStore
) => ({
    loadCharacters: async () => {
        try {
            const characters = await api.fetchCharacters();
            set({ characters, error: null });
        } catch (error) {
            console.error(error);
            set({ error: "Не удалось загрузить персонажей" });
        }
    },

    createCharacter: async (payload: CreateCharacterPayload) => {
        set({ isMutating: true, error: null });
        try {
            const character = await api.createCharacter(payload);
            set((state: GameStore) => {
                const characters = [...state.characters, character];
                return {
                    characters,
                    currentCharacterId: character.id,
                    messages: [],
                    suggestions: [],
                    isMutating: false,
                };
            });

            await api.saveAppState({ currentCharacterId: character.id });
            await get().actions.loadSessionLog(get().currentWorldId, character.id);
            return character;
        } catch (error) {
            console.error(error);
            set({
                error: error instanceof Error ? error.message : "Не удалось создать персонажа",
                isMutating: false,
            });
            return null;
        }
    },

    updateCharacter: async (characterId: CharacterId, payload: UpdateCharacterPayload) => {
        set({ isMutating: true, error: null });
        try {
            const character = await api.updateCharacter(characterId, payload);
            set((state: GameStore) => {
                const characters = state.characters.map((item) =>
                    item.id === character.id ? character : item
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
                error: error instanceof Error ? error.message : "Не удалось обновить персонажа",
                isMutating: false,
            });
            return null;
        }
    },

    deleteCharacter: async (characterId: CharacterId) => {
        set({ isMutating: true, error: null });
        try {
            await api.deleteCharacter(characterId);
            set((state: GameStore) => {
                const characters = state.characters.filter((character) => character.id !== characterId);
                const currentCharacterId =
                    state.currentCharacterId === characterId
                        ? characters.at(0)?.id ?? null
                        : state.currentCharacterId;

                if (state.currentCharacterId === characterId) {
                    api.saveAppState({ currentCharacterId });
                }

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
                error: error instanceof Error ? error.message : "Не удалось удалить персонажа",
                isMutating: false,
            });
            return false;
        }
    },

    selectCharacter: (characterId: CharacterId | null) => {
        set({ currentCharacterId: characterId, messages: [], suggestions: [], error: null });
        api.saveAppState({ currentCharacterId: characterId }).catch(console.error);
        void get().actions.loadSessionLog(get().currentWorldId, characterId);
    },
});
