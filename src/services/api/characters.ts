import { Character, CharacterId, CreateCharacterPayload, UpdateCharacterPayload } from "@/types/game";

export async function fetchCharacters(): Promise<Character[]> {
    const response = await fetch("/api/characters", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Ошибка загрузки персонажей");
    }
    return response.json();
}

export async function createCharacter(payload: CreateCharacterPayload): Promise<Character> {
    const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error ?? "Не удалось создать персонажа");
    }

    return response.json();
}

export async function updateCharacter(
    characterId: CharacterId,
    payload: UpdateCharacterPayload
): Promise<Character> {
    const response = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error ?? "Не удалось обновить персонажа");
    }

    return response.json();
}

export async function deleteCharacter(characterId: CharacterId): Promise<void> {
    const response = await fetch(`/api/characters/${characterId}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error ?? "Не удалось удалить персонажа");
    }
}
