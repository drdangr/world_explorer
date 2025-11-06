import { randomUUID } from "node:crypto";

import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  Character,
  CharacterId,
  CreateCharacterPayload,
  UpdateCharacterPayload,
  WorldId,
} from "@/types/game";

const TABLE_CHARACTERS = "characters";

interface CharacterRow {
  id: string;
  name: string;
  description: string;
  inventory: Character["inventory"];
  current_world_id: WorldId | null;
  current_location_id: string | null;
  history: Character["history"];
  created_at: string;
  updated_at: string;
}

const INVENTORY_FALLBACK: Character["inventory"] = [];
const HISTORY_FALLBACK: Character["history"] = [];

export async function sbGetCharacters(): Promise<Character[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.from(TABLE_CHARACTERS).select("*").order("created_at", {
    ascending: true,
  });

  if (error) {
    throw new Error(`Supabase: не удалось получить персонажей — ${error.message}`);
  }

  return (data as CharacterRow[]).map(mapCharacterRow);
}

export async function sbGetCharacterById(
  characterId: CharacterId,
): Promise<Character | undefined> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLE_CHARACTERS)
    .select("*")
    .eq("id", characterId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase: не удалось получить персонажа — ${error.message}`);
  }

  return data ? mapCharacterRow(data as CharacterRow) : undefined;
}

export async function sbCreateCharacter(payload: CreateCharacterPayload): Promise<Character> {
  const now = new Date().toISOString();

  const character: Character = {
    id: randomUUID(),
    name: payload.name.trim() || "Безымянный герой",
    description: payload.description.trim(),
    inventory: [],
    currentWorldId: payload.currentWorldId ?? null,
    currentLocationId: null,
    history: [],
  };

  const client = getSupabaseClient();
  const { error } = await client.from(TABLE_CHARACTERS).insert({
    id: character.id,
    name: character.name,
    description: character.description,
    inventory: character.inventory,
    current_world_id: character.currentWorldId,
    current_location_id: character.currentLocationId,
    history: character.history,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw new Error(`Supabase: не удалось создать персонажа — ${error.message}`);
  }

  return character;
}

export async function sbUpdateCharacter(
  characterId: CharacterId,
  payload: UpdateCharacterPayload,
): Promise<Character | undefined> {
  const client = getSupabaseClient();
  const current = await sbGetCharacterById(characterId);
  if (!current) {
    return undefined;
  }

  const updated: Character = {
    ...current,
    ...payload,
    name: payload.name?.trim() ?? current.name,
    description: payload.description?.trim() ?? current.description,
    currentWorldId:
      payload.currentWorldId === undefined ? current.currentWorldId : payload.currentWorldId,
    currentLocationId:
      payload.currentLocationId === undefined
        ? current.currentLocationId
        : payload.currentLocationId,
  };

  const { error } = await client
    .from(TABLE_CHARACTERS)
    .update({
      name: updated.name,
      description: updated.description,
      inventory: updated.inventory,
      current_world_id: updated.currentWorldId,
      current_location_id: updated.currentLocationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", characterId);

  if (error) {
    throw new Error(`Supabase: не удалось обновить персонажа — ${error.message}`);
  }

  return updated;
}

export async function sbDeleteCharacter(characterId: CharacterId): Promise<boolean> {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLE_CHARACTERS).delete().eq("id", characterId);

  if (error) {
    throw new Error(`Supabase: не удалось удалить персонажа — ${error.message}`);
  }

  return true;
}

export async function sbSaveCharacter(character: Character): Promise<Character> {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLE_CHARACTERS)
    .upsert(
      {
        id: character.id,
        name: character.name,
        description: character.description,
        inventory: character.inventory,
        current_world_id: character.currentWorldId,
        current_location_id: character.currentLocationId,
        history: character.history,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(`Supabase: не удалось сохранить персонажа — ${error.message}`);
  }

  return character;
}

function mapCharacterRow(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    inventory: row.inventory ?? INVENTORY_FALLBACK,
    currentWorldId: row.current_world_id ?? null,
    currentLocationId: row.current_location_id ?? null,
    history: row.history ?? HISTORY_FALLBACK,
  } satisfies Character;
}

