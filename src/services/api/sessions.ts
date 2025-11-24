import { Character, CharacterId, SessionEntry, World, WorldId } from "@/types/game";

export interface SessionResponse {
    world: World;
    character: Character;
    session: {
        file: string | null;
        entries: SessionEntry[];
    };
    suggestions?: string[];
}

export interface SessionLogResponse {
    file: string | null;
    entries: SessionEntry[];
}

export async function fetchSessionLog(
    worldId: WorldId,
    characterId: CharacterId,
    sessionId?: string
): Promise<SessionLogResponse> {
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

    return response.json();
}

export async function sendSessionMessage(payload: {
    worldId: WorldId;
    characterId: CharacterId;
    message: string;
    isInitial: boolean;
    forceNew: boolean;
}): Promise<SessionResponse> {
    const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error ?? "Не удалось получить ответ ГМ");
    }

    return response.json();
}

export async function fetchAppState(): Promise<{
    currentWorldId: WorldId | null;
    currentCharacterId: CharacterId | null;
}> {
    const response = await fetch("/api/app-state", { cache: "no-store" });
    if (!response.ok) {
        return { currentWorldId: null, currentCharacterId: null };
    }
    return response.json();
}

export async function saveAppState(payload: {
    currentWorldId?: WorldId | null;
    currentCharacterId?: CharacterId | null;
}): Promise<void> {
    await fetch("/api/app-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}
