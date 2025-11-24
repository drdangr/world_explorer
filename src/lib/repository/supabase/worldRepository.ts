import { randomUUID } from "node:crypto";

import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  CharacterId,
  CreateWorldPayload,
  UpdateWorldPayload,
  World,
  WorldId,
} from "@/types/game";

const TABLE_WORLDS = "worlds";

interface WorldRow {
  id: string;
  name: string;
  setting: string;
  atmosphere: string;
  genre: string;
  entry_location_id: string;
  graph: World["graph"];
  owner_character_ids: string[];
  created_at: string;
  updated_at: string;
}

const GRAPH_FALLBACK: World["graph"] = {};

export async function sbGetWorlds(): Promise<World[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.from(TABLE_WORLDS).select("*").order("created_at", {
    ascending: true,
  });

  if (error) {
    throw new Error(`Supabase: не удалось получить миры — ${error.message}`);
  }

  return (data as WorldRow[]).map(mapWorldRow);
}

export async function sbGetWorldById(worldId: WorldId): Promise<World | undefined> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLE_WORLDS)
    .select("*")
    .eq("id", worldId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase: не удалось получить мир — ${error.message}`);
  }

  return data ? mapWorldRow(data as WorldRow) : undefined;
}

export async function sbCreateWorld(payload: CreateWorldPayload): Promise<World> {
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

  const client = getSupabaseClient();
  const { error } = await client.from(TABLE_WORLDS).insert({
    id: world.id,
    name: world.name,
    setting: world.setting,
    atmosphere: world.atmosphere,
    genre: world.genre,
    entry_location_id: world.entryLocationId,
    graph: world.graph,
    owner_character_ids: world.ownerCharacterIds,
    created_at: world.createdAt,
    updated_at: world.updatedAt,
  });

  if (error) {
    throw new Error(`Supabase: не удалось создать мир — ${error.message}`);
  }

  return world;
}

export async function sbUpdateWorld(
  worldId: WorldId,
  payload: UpdateWorldPayload,
): Promise<World | undefined> {
  const client = getSupabaseClient();

  const current = await sbGetWorldById(worldId);
  if (!current) {
    return undefined;
  }

  const updated: World = {
    ...current,
    ...payload,
    name: payload.name?.trim() ?? current.name,
    setting: payload.setting?.trim() ?? current.setting,
    atmosphere: payload.atmosphere?.trim() ?? current.atmosphere,
    genre: payload.genre?.trim() ?? current.genre,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await client
    .from(TABLE_WORLDS)
    .update({
      name: updated.name,
      setting: updated.setting,
      atmosphere: updated.atmosphere,
      genre: updated.genre,
      graph: updated.graph,
      owner_character_ids: updated.ownerCharacterIds,
      entry_location_id: updated.entryLocationId,
      updated_at: updated.updatedAt,
    })
    .eq("id", worldId);

  if (error) {
    throw new Error(`Supabase: не удалось обновить мир — ${error.message}`);
  }

  return updated;
}

export async function sbDeleteWorld(worldId: WorldId): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLE_WORLDS).delete().eq("id", worldId);

  if (error) {
    throw new Error(`Supabase: не удалось удалить мир — ${error.message}`);
  }

  return true;
}

export async function sbSaveWorld(world: World): Promise<World> {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLE_WORLDS)
    .upsert(
      {
        id: world.id,
        name: world.name,
        setting: world.setting,
        atmosphere: world.atmosphere,
        genre: world.genre,
        entry_location_id: world.entryLocationId,
        graph: world.graph,
        owner_character_ids: world.ownerCharacterIds,
        created_at: world.createdAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(`Supabase: не удалось сохранить мир — ${error.message}`);
  }

  return world;
}

export async function sbAttachCharacterToWorld(worldId: WorldId, characterId: CharacterId) {
  const client = getSupabaseClient();
  const world = await sbGetWorldById(worldId);
  if (!world) {
    return;
  }

  const updated = {
    ...world,
    ownerCharacterIds: world.ownerCharacterIds.includes(characterId)
      ? world.ownerCharacterIds
      : [...world.ownerCharacterIds, characterId],
    updatedAt: new Date().toISOString(),
  } satisfies World;

  const { error } = await client
    .from(TABLE_WORLDS)
    .update({
      owner_character_ids: updated.ownerCharacterIds,
      updated_at: updated.updatedAt,
    })
    .eq("id", worldId);

  if (error) {
    throw new Error(`Supabase: не удалось прикрепить персонажа — ${error.message}`);
  }
}

export async function sbDetachCharacterFromWorld(
  worldId: WorldId,
  characterId: CharacterId,
) {
  const client = getSupabaseClient();
  const world = await sbGetWorldById(worldId);
  if (!world) {
    return;
  }

  const updated = {
    ...world,
    ownerCharacterIds: world.ownerCharacterIds.filter((id) => id !== characterId),
    updatedAt: new Date().toISOString(),
  } satisfies World;

  const { error } = await client
    .from(TABLE_WORLDS)
    .update({
      owner_character_ids: updated.ownerCharacterIds,
      updated_at: updated.updatedAt,
    })
    .eq("id", worldId);

  if (error) {
    throw new Error(`Supabase: не удалось отвязать персонажа — ${error.message}`);
  }
}

function mapWorldRow(row: WorldRow): World {
  return {
    id: row.id,
    name: row.name,
    setting: row.setting,
    atmosphere: row.atmosphere,
    genre: row.genre,
    entryLocationId: row.entry_location_id,
    graph: row.graph ?? GRAPH_FALLBACK,
    ownerCharacterIds: row.owner_character_ids ?? [],
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  } satisfies World;
}

