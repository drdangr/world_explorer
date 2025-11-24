import { CreateWorldPayload, UpdateWorldPayload, World, WorldId } from "@/types/game";

export async function fetchWorlds(): Promise<World[]> {
    const response = await fetch("/api/worlds", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Ошибка загрузки миров");
    }
    return response.json();
}

export async function createWorld(payload: CreateWorldPayload): Promise<World> {
    const response = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error ?? "Не удалось создать мир");
    }

    return response.json();
}

export async function updateWorld(worldId: WorldId, payload: UpdateWorldPayload): Promise<World> {
    const response = await fetch(`/api/worlds/${worldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error ?? "Не удалось обновить мир");
    }

    return response.json();
}

export async function deleteWorld(worldId: WorldId): Promise<void> {
    const response = await fetch(`/api/worlds/${worldId}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error ?? "Не удалось удалить мир");
    }
}
