import { randomUUID } from "node:crypto";

import {
  type CharacterId,
  type CreateWorldPayload,
  type UpdateWorldPayload,
  type World,
  type WorldId,
  type WorldsFile,
} from "@/types/game";
import { readJsonFile, updateJsonFile } from "@/lib/storage/jsonStorage";
import { isSupabaseEnabled } from "@/lib/supabase/client";
import {
  sbAttachCharacterToWorld,
  sbCreateWorld,
  sbDeleteWorld,
  sbDetachCharacterFromWorld,
  sbGetWorldById,
  sbGetWorlds,
  sbSaveWorld,
  sbUpdateWorld,
} from "@/lib/repository/supabase/worldRepository";

const WORLDS_FILE = "worlds.json";
const WORLD_FALLBACK: WorldsFile = { worlds: [] };

export async function getWorlds(): Promise<World[]> {
  if (isSupabaseEnabled()) {
    return sbGetWorlds();
  }

  const data = await readJsonFile(WORLDS_FILE, WORLD_FALLBACK);
  return data.worlds;
}

export async function getWorldById(worldId: WorldId): Promise<World | undefined> {
  if (isSupabaseEnabled()) {
    return sbGetWorldById(worldId);
  }

  const worlds = await getWorlds();
  return worlds.find((world) => world.id === worldId);
}

export async function createWorld(payload: CreateWorldPayload): Promise<World> {
  if (isSupabaseEnabled()) {
    return sbCreateWorld(payload);
  }

  const now = new Date().toISOString();
  const entryLocationId = randomUUID();

  const world: World = {
    id: randomUUID(),
    name: payload.name.trim() || "Новый мир",
    setting: payload.setting.trim(),
    atmosphere: payload.atmosphere.trim(),
    genre: payload.genre.trim(),
    createdAt: now,
    updatedAt: now,
    entryLocationId,
    graph: {
      [entryLocationId]: {
        id: entryLocationId,
        locationName: "Центральная локация",
        description: null,
        mapDescription: null,
        discovered: false,
        items: [],
        connections: [],
      },
    },
    ownerCharacterIds: [],
  };

  await updateJsonFile(WORLDS_FILE, WORLD_FALLBACK, (data) => {
    data.worlds.push(world);
    return data;
  });

  return world;
}

export async function updateWorld(
  worldId: WorldId,
  payload: UpdateWorldPayload,
): Promise<World | undefined> {
  if (isSupabaseEnabled()) {
    return sbUpdateWorld(worldId, payload);
  }

  let updatedWorld: World | undefined;

  await updateJsonFile(WORLDS_FILE, WORLD_FALLBACK, (data) => {
    data.worlds = data.worlds.map((world) => {
      if (world.id !== worldId) {
        return world;
      }

      updatedWorld = {
        ...world,
        ...payload,
        name: payload.name?.trim() ?? world.name,
        setting: payload.setting?.trim() ?? world.setting,
        atmosphere: payload.atmosphere?.trim() ?? world.atmosphere,
        genre: payload.genre?.trim() ?? world.genre,
        updatedAt: new Date().toISOString(),
      };

      return updatedWorld;
    });

    return data;
  });

  return updatedWorld;
}

export async function saveWorld(world: World): Promise<World> {
  if (isSupabaseEnabled()) {
    return sbSaveWorld(world);
  }

  let updated = world;

  await updateJsonFile(WORLDS_FILE, WORLD_FALLBACK, (data) => {
    const hasWorld = data.worlds.some((item) => item.id === world.id);

    if (hasWorld) {
      data.worlds = data.worlds.map((item) => (item.id === world.id ? world : item));
    } else {
      data.worlds.push(world);
    }

    updated = world;
    return data;
  });

  return updated;
}

export async function deleteWorld(worldId: WorldId): Promise<boolean> {
  if (isSupabaseEnabled()) {
    return sbDeleteWorld(worldId);
  }

  let removed = false;

  await updateJsonFile(WORLDS_FILE, WORLD_FALLBACK, (data) => {
    const initialLength = data.worlds.length;
    data.worlds = data.worlds.filter((world) => world.id !== worldId);
    removed = data.worlds.length < initialLength;
    return data;
  });

  return removed;
}

export async function detachCharacterFromWorld(
  worldId: WorldId,
  characterId: CharacterId,
): Promise<void> {
  if (isSupabaseEnabled()) {
    await sbDetachCharacterFromWorld(worldId, characterId);
    return;
  }

  await updateJsonFile(WORLDS_FILE, WORLD_FALLBACK, (data) => {
    data.worlds = data.worlds.map((world) => {
      if (world.id !== worldId) {
        return world;
      }

      return {
        ...world,
        ownerCharacterIds: world.ownerCharacterIds.filter(
          (id) => id !== characterId,
        ),
        updatedAt: new Date().toISOString(),
      };
    });

    return data;
  });
}

export async function attachCharacterToWorld(
  worldId: WorldId,
  characterId: CharacterId,
): Promise<void> {
  if (isSupabaseEnabled()) {
    await sbAttachCharacterToWorld(worldId, characterId);
    return;
  }

  await updateJsonFile(WORLDS_FILE, WORLD_FALLBACK, (data) => {
    data.worlds = data.worlds.map((world) => {
      if (world.id !== worldId) {
        return world;
      }

      if (world.ownerCharacterIds.includes(characterId)) {
        return world;
      }

      return {
        ...world,
        ownerCharacterIds: [...world.ownerCharacterIds, characterId],
        updatedAt: new Date().toISOString(),
      };
    });

    return data;
  });
}

