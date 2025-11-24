import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  type CharacterId,
  type CreateWorldPayload,
  type UpdateWorldPayload,
  type World,
  type WorldId,
} from "@/types/game";
import {
  deleteJsonFile,
  listJsonFiles,
  readJsonFile,
  writeJsonFile,
} from "@/lib/storage/jsonStorage";
import { isSupabaseEnabled } from "@/lib/supabase/client";
import { sanitizeFilename } from "@/lib/utils/filename";
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

const WORLDS_DIR = "worlds";

function getWorldFileName(world: World): string {
  const safeName = sanitizeFilename(world.name);
  return path.join(WORLDS_DIR, `${safeName}_${world.id}.json`);
}

async function findWorldFileById(worldId: WorldId): Promise<string | null> {
  const worlds = await listJsonFiles<World>(WORLDS_DIR);
  const world = worlds.find((w) => w.id === worldId);
  if (!world) return null;
  return getWorldFileName(world);
}

export async function getWorlds(): Promise<World[]> {
  if (isSupabaseEnabled()) {
    return sbGetWorlds();
  }

  return listJsonFiles<World>(WORLDS_DIR);
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

  const fileName = getWorldFileName(world);
  await writeJsonFile(fileName, world);

  return world;
}

export async function updateWorld(
  worldId: WorldId,
  payload: UpdateWorldPayload,
): Promise<World | undefined> {
  if (isSupabaseEnabled()) {
    return sbUpdateWorld(worldId, payload);
  }

  const currentWorld = await getWorldById(worldId);
  if (!currentWorld) {
    return undefined;
  }

  const updatedWorld: World = {
    ...currentWorld,
    ...payload,
    name: payload.name?.trim() ?? currentWorld.name,
    setting: payload.setting?.trim() ?? currentWorld.setting,
    atmosphere: payload.atmosphere?.trim() ?? currentWorld.atmosphere,
    genre: payload.genre?.trim() ?? currentWorld.genre,
    updatedAt: new Date().toISOString(),
  };

  // Explicitly handle graph update if present in payload
  if (payload.graph) {
    updatedWorld.graph = payload.graph;
  }

  // If name changed, we might want to rename the file, but for simplicity
  // we can keep the old filename or delete old and create new.
  // Let's delete old and create new to keep filenames consistent with content.
  const oldFileName = getWorldFileName(currentWorld);
  const newFileName = getWorldFileName(updatedWorld);

  if (oldFileName !== newFileName) {
    await deleteJsonFile(oldFileName);
  }

  await writeJsonFile(newFileName, updatedWorld);

  return updatedWorld;
}

export async function saveWorld(world: World): Promise<World> {
  if (isSupabaseEnabled()) {
    return sbSaveWorld(world);
  }

  // Check if file exists with potentially different name (if name changed externally)
  // But here we just save what we have.
  // Ideally we should find the file by ID first to handle renames properly if we didn't have the old object.
  // But saveWorld usually implies we have the full object.

  // Let's try to find if there is an existing file for this ID to clean it up if name changed
  const existingFile = await findWorldFileById(world.id);
  const newFileName = getWorldFileName(world);

  if (existingFile && existingFile !== newFileName) {
    await deleteJsonFile(existingFile);
  }

  await writeJsonFile(newFileName, world);
  return world;
}

export async function deleteWorld(worldId: WorldId): Promise<boolean> {
  if (isSupabaseEnabled()) {
    return sbDeleteWorld(worldId);
  }

  const fileName = await findWorldFileById(worldId);
  if (!fileName) {
    return false;
  }

  await deleteJsonFile(fileName);
  return true;
}

export async function detachCharacterFromWorld(
  worldId: WorldId,
  characterId: CharacterId,
): Promise<void> {
  if (isSupabaseEnabled()) {
    await sbDetachCharacterFromWorld(worldId, characterId);
    return;
  }

  const world = await getWorldById(worldId);
  if (!world) return;

  const updatedWorld = {
    ...world,
    ownerCharacterIds: world.ownerCharacterIds.filter((id) => id !== characterId),
    updatedAt: new Date().toISOString(),
  };

  await saveWorld(updatedWorld);
}

export async function attachCharacterToWorld(
  worldId: WorldId,
  characterId: CharacterId,
): Promise<void> {
  if (isSupabaseEnabled()) {
    await sbAttachCharacterToWorld(worldId, characterId);
    return;
  }

  const world = await getWorldById(worldId);
  if (!world) return;

  if (world.ownerCharacterIds.includes(characterId)) {
    return;
  }

  const updatedWorld = {
    ...world,
    ownerCharacterIds: [...world.ownerCharacterIds, characterId],
    updatedAt: new Date().toISOString(),
  };

  await saveWorld(updatedWorld);
}

