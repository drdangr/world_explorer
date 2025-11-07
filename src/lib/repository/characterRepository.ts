import { randomUUID } from "node:crypto";

import {
  type Character,
  type CharacterId,
  type CharactersFile,
  type CreateCharacterPayload,
  type SessionEntry,
  type UpdateCharacterPayload,
  type WorldId,
} from "@/types/game";
import { readJsonFile, updateJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
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
import {
  createSessionLog,
} from "@/lib/repository/sessionRepository";

const CHARACTERS_FILE = "characters.json";
const CHARACTERS_FALLBACK: CharactersFile = { characters: [] };

export async function getCharacters(): Promise<Character[]> {
  if (isSupabaseEnabled()) {
    return sbGetCharacters();
  }

  const data = await readJsonFile(CHARACTERS_FILE, CHARACTERS_FALLBACK);
  const migrated = await migrateLegacyHistories(data);
  return migrated.characters;
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
    lastSessionFile: null,
    lastSessionEntryId: null,
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
        lastSessionFile:
          payload.currentWorldId !== undefined && payload.currentWorldId !== character.currentWorldId
            ? null
            : character.lastSessionFile ?? null,
        lastSessionEntryId:
          payload.currentWorldId !== undefined && payload.currentWorldId !== character.currentWorldId
            ? null
            : character.lastSessionEntryId ?? null,
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

async function migrateLegacyHistories(file: CharactersFile): Promise<CharactersFile> {
  let changed = false;
  const characters: Character[] = [];

  for (const legacy of file.characters as Array<Character & { history?: SessionEntry[] }>) {
    if (!legacy.history || legacy.history.length === 0) {
      characters.push({
        ...legacy,
        history: undefined,
        lastSessionFile: legacy.lastSessionFile ?? null,
        lastSessionEntryId: legacy.lastSessionEntryId ?? null,
      } as Character);
      continue;
    }

    changed = true;

    const grouped = groupEntriesByWorld(legacy.history);
    let lastSessionFile = legacy.lastSessionFile ?? null;
    let lastSessionEntryId = legacy.lastSessionEntryId ?? null;

    for (const [worldId, entries] of grouped) {
      if (!worldId || entries.length === 0) {
        continue;
      }

      const startedAt = entries[0].createdAt ?? new Date().toISOString();
      const { fileName, log } = await createSessionLog(legacy.id, worldId, startedAt, stripWorldId(entries));

      if (legacy.currentWorldId === worldId) {
        lastSessionFile = fileName;
        lastSessionEntryId = log.entries.at(-1)?.id ?? null;
      }
    }

    characters.push({
      id: legacy.id,
      name: legacy.name,
      description: legacy.description,
      inventory: legacy.inventory,
      currentWorldId: legacy.currentWorldId,
      currentLocationId: legacy.currentLocationId,
      lastSessionFile,
      lastSessionEntryId,
    });
  }

  if (changed) {
    const migrated: CharactersFile = { characters };
    await writeJsonFile(CHARACTERS_FILE, migrated);
    return migrated;
  }

  return file;
}

function groupEntriesByWorld(entries: SessionEntry[]): Map<WorldId | null, SessionEntry[]> {
  const map = new Map<WorldId | null, SessionEntry[]>();

  entries.forEach((entry) => {
    const worldId = (entry as SessionEntry & { worldId?: WorldId }).worldId ?? null;
    const list = map.get(worldId) ?? [];
    list.push(entry);
    map.set(worldId, list);
  });

  return map;
}

function stripWorldId(entries: SessionEntry[]): SessionEntry[] {
  return entries.map((entry) => {
    const clone = { ...entry } as SessionEntry & { worldId?: WorldId };
    if ("worldId" in clone) {
      delete clone.worldId;
    }
    return clone;
  });
}

