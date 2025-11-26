import { Character, CharacterId, SessionEntry, World, WorldId, CreateWorldPayload, UpdateWorldPayload, CreateCharacterPayload, UpdateCharacterPayload } from "@/types/game";

export interface GameState {
    // World Slice
    worlds: World[];
    currentWorldId: WorldId | null;

    // Character Slice
    characters: Character[];
    currentCharacterId: CharacterId | null;

    // Session Slice
    messages: SessionEntry[];
    suggestions: string[];
    isProcessingTurn: boolean;
    forceNewSession: boolean;
    latestToolLogs: any[]; // Tool execution logs from last turn

    // UI/Shared Slice
    isInitializing: boolean;
    isMutating: boolean;
    error: string | null;
}

export interface GameActions {
    // World Actions
    loadWorlds: () => Promise<void>;
    selectWorld: (worldId: WorldId | null, sessionId?: string) => void;
    createWorld: (payload: CreateWorldPayload) => Promise<World | null>;
    updateWorld: (worldId: WorldId, payload: UpdateWorldPayload) => Promise<World | null>;
    deleteWorld: (worldId: WorldId) => Promise<boolean>;

    // Character Actions
    loadCharacters: () => Promise<void>;
    selectCharacter: (characterId: CharacterId | null) => void;
    createCharacter: (payload: CreateCharacterPayload) => Promise<Character | null>;
    updateCharacter: (characterId: CharacterId, payload: UpdateCharacterPayload) => Promise<Character | null>;
    deleteCharacter: (characterId: CharacterId) => Promise<boolean>;

    // Session Actions
    loadSessionLog: (worldId: WorldId | null, characterId: CharacterId | null, sessionId?: string) => Promise<void>;
    requestInitialTurn: () => Promise<void>;
    sendPlayerMessage: (message: string) => Promise<void>;

    // Shared Actions
    loadInitialData: () => Promise<void>;
    resetError: () => void;
}

export type GameStore = GameState & { actions: GameActions };
