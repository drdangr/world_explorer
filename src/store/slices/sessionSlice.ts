import { GameStore } from "../types";
import * as api from "@/services/api";
import { Character, CharacterId, World, WorldId } from "@/types/game";

export const createSessionSlice = (
    set: any,
    get: () => GameStore
) => ({
    loadSessionLog: async (worldId: WorldId | null, characterId: CharacterId | null, sessionId?: string) => {
        if (!worldId || !characterId) {
            set({ messages: [], suggestions: [] });
            return;
        }

        if (sessionId === "new") {
            set({ messages: [], suggestions: [], error: null });
            return;
        }

        try {
            const data = await api.fetchSessionLog(worldId, characterId, sessionId);
            set({ messages: data.entries, suggestions: [], error: null });
        } catch (error) {
            console.error(error);
            set({ error: "Не удалось загрузить историю", messages: [] });
        }
    },

    requestInitialTurn: async () => {
        await processSessionTurn({ isInitial: true, message: "" }, set, get);
    },

    sendPlayerMessage: async (message: string) => {
        if (!message.trim()) return;
        await processSessionTurn({ isInitial: false, message }, set, get);
    },
});

// Helper function for session processing
async function processSessionTurn(
    { message, isInitial }: { message: string; isInitial: boolean },
    set: any,
    get: () => GameStore
) {
    const state = get();
    const { currentWorldId, currentCharacterId, forceNewSession } = state;

    if (!currentWorldId || !currentCharacterId) {
        set({ error: "Выберите мир и персонажа, чтобы продолжить" });
        return;
    }

    set({ isProcessingTurn: true, error: null });

    try {
        const data = await api.sendSessionMessage({
            worldId: currentWorldId,
            characterId: currentCharacterId,
            message,
            isInitial,
            forceNew: forceNewSession,
        });

        set((prev: GameStore) => {
            const worlds = upsertWorld(prev.worlds, data.world);
            const characters = upsertCharacter(prev.characters, data.character);
            return {
                worlds,
                characters,
                messages: data.session.entries,
                suggestions: data.suggestions ?? [],
                latestToolLogs: data.toolLogs ?? [],
                isProcessingTurn: false,
                forceNewSession: false,
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
