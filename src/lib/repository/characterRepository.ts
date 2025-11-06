import { randomUUID } from "node:crypto";

import {
  type Character,
  type CharacterId,
  type CharactersFile,
  type CreateCharacterPayload,
  type UpdateCharacterPayload,
  type WorldId,
} from "@/types/game";
import { readJsonFile, updateJsonFile } from "@/lib/storage/jsonStorage";
import {
  attachCharacterToWorld,
  detachCharacterFromWorld,
} from "@/lib/repository/worldRepository";
import { isSupabaseEnabled } from "@/lib/supabase/client";
import {
  sbCreateCharacter,
  sbDeleteCharacter,
  sbGetCharacterById,
  sbGetCharacters,
  sbSaveCharacter,
  sbUpdateCharacter,
} from "@/lib/repository/supabase/characterRepository";

const CHARACTERS_FILE = "characters.json";
const CHARACTERS_FALLBACK: CharactersFile = { characters: [] };

export async function getCharacters(): Promise<Character[]> {
  if (isSupabaseEnabled()) {
    return sbGetCharacters();
  }

  const data = await readJsonFile(CHARACTERS_FILE, CHARACTERS_FALLBACK);
  return data.characters;
}

export async function getCharacterById(
  characterId: CharacterId,
): Promise<Character | undefined> {
  if (isSupabaseEnabled()) {
    return sbGetCharacterById(characterId);
  }

  const characters = await getCharacters();
  return characters.find((character) => character.id === characterId);
}

export async function createCharacter(
  payload: CreateCharacterPayload,
): Promise<Character> {
  if (isSupabaseEnabled()) {
    const character = await sbCreateCharacter(payload);

    if (payload.currentWorldId) {
      await attachCharacterToWorld(payload.currentWorldId, character.id);
    }

    return character;
  }

  const character: Character = {
    id: randomUUID(),
    name: payload.name.trim() || "Безымянный герой",
    description: payload.description.trim(),
    inventory: [],
    currentWorldId: payload.currentWorldId ?? null,
    currentLocationId: null,
    history: [],
  };

  await updateJsonFile(CHARACTERS_FILE, CHARACTERS_FALLBACK, (data) => {
    data.characters.push(character);
    return data;
  });

  if (payload.currentWorldId) {
    await attachCharacterToWorld(payload.currentWorldId, character.id);
  }

  return character;
}

export async function updateCharacter(
  characterId: CharacterId,
  payload: UpdateCharacterPayload,
): Promise<Character | undefined> {
  if (isSupabaseEnabled()) {
    const previous = await sbGetCharacterById(characterId);
    if (!previous) {
      return undefined;
    }

    const updated = await sbUpdateCharacter(characterId, payload);

    if (!updated) {
      return undefined;
    }

    const previousWorldId = previous.currentWorldId ?? null;
    const nextWorldId = updated.currentWorldId ?? null;

    if (previousWorldId && previousWorldId !== nextWorldId) {
      await detachCharacterFromWorld(previousWorldId, characterId);
    }

    if (nextWorldId && nextWorldId !== previousWorldId) {
      await attachCharacterToWorld(nextWorldId, characterId);
    }

    return updated;
  }

  const previous = await getCharacterById(characterId);
  if (!previous) {
    return undefined;
  }

  let updated: Character | undefined;
  const newWorldId =
    payload.currentWorldId === undefined ? previous.currentWorldId : payload.currentWorldId;

  await updateJsonFile(CHARACTERS_FILE, CHARACTERS_FALLBACK, (data) => {
    data.characters = data.characters.map((character) => {
      if (character.id !== characterId) {
        return character;
      }

      updated = {
        ...character,
        ...payload,
        name: payload.name?.trim() ?? character.name,
        description: payload.description?.trim() ?? character.description,
        currentWorldId: newWorldId ?? null,
        currentLocationId:
          payload.currentLocationId === undefined
            ? character.currentLocationId
            : payload.currentLocationId,
      };

      return updated;
    });

    return data;
  });

  if (!updated) {
    return undefined;
  }

  const previousWorldId = previous.currentWorldId;
  const nextWorldId = updated.currentWorldId;

  if (previousWorldId && previousWorldId !== nextWorldId) {
    await detachCharacterFromWorld(previousWorldId, characterId);
  }

  if (nextWorldId && nextWorldId !== previousWorldId) {
    await attachCharacterToWorld(nextWorldId, characterId);
  }

  return updated;
}

export async function deleteCharacter(characterId: CharacterId): Promise<boolean> {
  if (isSupabaseEnabled()) {
    const character = await getCharacterById(characterId);
    if (!character) {
      return false;
    }

    const deleted = await sbDeleteCharacter(characterId);

    if (deleted && character.currentWorldId) {
      await detachCharacterFromWorld(character.currentWorldId, characterId);
    }

    return deleted;
  }

  const character = await getCharacterById(characterId);
  if (!character) {
    return false;
  }

  await updateJsonFile(CHARACTERS_FILE, CHARACTERS_FALLBACK, (data) => {
    data.characters = data.characters.filter((item) => item.id !== characterId);
    return data;
  });

  if (character.currentWorldId) {
    await detachCharacterFromWorld(character.currentWorldId, characterId);
  }

  return true;
}

export async function reassignCharacterToWorld(
  characterId: CharacterId,
  worldId: WorldId | null,
) {
  await updateCharacter(characterId, { currentWorldId: worldId });
}

export async function saveCharacter(character: Character): Promise<Character> {
  if (isSupabaseEnabled()) {
    return sbSaveCharacter(character);
  }

  let updated = character;

  await updateJsonFile(CHARACTERS_FILE, CHARACTERS_FALLBACK, (data) => {
    const exists = data.characters.some((item) => item.id === character.id);

    if (exists) {
      data.characters = data.characters.map((item) =>
        item.id === character.id ? character : item,
      );
    } else {
      data.characters.push(character);
    }

    updated = character;
    return data;
  });

  return updated;
}

