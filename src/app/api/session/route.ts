import { NextResponse } from "next/server";
import { z } from "zod";

import { applyGameTurn } from "@/lib/gameplay/applyGameTurn";
import { getLLMProvider } from "@/lib/llm/getProvider";
import { LLMGameTurnSchema } from "@/lib/llm/types";
import {
  getCharacterById,
  saveCharacter,
} from "@/lib/repository/characterRepository";
import {
  appendSessionEntries,
  createSessionLog,
  findLatestSessionFile,
  readSessionLog,
} from "@/lib/repository/sessionRepository";
import { getWorldById, saveWorld } from "@/lib/repository/worldRepository";
import type { LocationId, SessionEntry } from "@/types/game";

const SessionRequestSchema = z.object({
  worldId: z.string().min(1),
  characterId: z.string().min(1),
  message: z.string().default(""),
  isInitial: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { worldId, characterId, message, isInitial } = SessionRequestSchema.parse(json);

    const world = await getWorldOrThrow(worldId);
    const character = await getCharacterOrThrow(characterId);

    const currentLocation = resolveCurrentLocation(world, character.currentLocationId);
    const knownLocations = Object.values(world.graph);

    const provider = getLLMProvider();

    const { sessionFile, sessionLog } = await resolveSessionLog(character, worldId);
    const history = sessionLog.entries.slice(-12);
    const lastActionReminder = findLastActionReminder(sessionLog.entries, currentLocation.id);

    const turn = await provider.generateTurn({
      world,
      character,
      playerMessage: message,
      history,
      locationContext: {
        currentLocation,
        knownLocations,
        lastActionReminder,
      },
      isInitial,
    });

    const parsedTurn = LLMGameTurnSchema.parse(turn);

    const { world: updatedWorld, character: updatedCharacter, newEntries } = applyGameTurn({
      world,
      character,
      turn: parsedTurn,
      playerMessage: message,
      isInitial,
    });

    const updatedLog = await appendSessionEntries(sessionFile, sessionLog, newEntries);

    updatedCharacter.lastSessionFile = sessionFile;
    updatedCharacter.lastSessionEntryId = updatedLog.entries.at(-1)?.id ?? null;

    await Promise.all([saveWorld(updatedWorld), saveCharacter(updatedCharacter)]);

    return NextResponse.json({
      world: updatedWorld,
      character: updatedCharacter,
      session: {
        file: sessionFile,
        entries: updatedLog.entries,
      },
      suggestions: parsedTurn.suggestions,
    });
  } catch (error) {
    console.error("Ошибка обработки запроса сессии", error);

    const isDev = process.env.NODE_ENV !== "production";
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Неизвестная ошибка";

    if (error instanceof Error && isDev) {
      console.error(error.stack);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: error.flatten() },
        { status: 400 },
      );
    }

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      {
        error: "Не удалось обработать ход",
        detail: isDev ? message : undefined,
      },
      { status: 500 },
    );
  }
}

class NotFoundError extends Error {}

async function getWorldOrThrow(worldId: string) {
  const world = await getWorldById(worldId);

  if (!world) {
    throw new NotFoundError("Мир не найден");
  }

  return world;
}

async function getCharacterOrThrow(characterId: string) {
  const character = await getCharacterById(characterId);

  if (!character) {
    throw new NotFoundError("Персонаж не найден");
  }

  return character;
}

function resolveCurrentLocation(world: Awaited<ReturnType<typeof getWorldOrThrow>>, locationId: string | null) {
  if (locationId && world.graph[locationId]) {
    return world.graph[locationId];
  }

  const entry = world.graph[world.entryLocationId];
  if (entry) {
    return entry;
  }

  const [, firstLocation] = Object.entries(world.graph)[0] ?? [];
  if (firstLocation) {
    return firstLocation;
  }

  throw new NotFoundError("В мире отсутствуют локации");
}

async function resolveSessionLog(character: Awaited<ReturnType<typeof getCharacterOrThrow>>, worldId: string) {
  const now = new Date().toISOString();

  if (character.lastSessionFile) {
    const existing = await readSessionLog(character.lastSessionFile);
    if (existing && existing.worldId === worldId && existing.characterId === character.id) {
      return {
        sessionFile: character.lastSessionFile,
        sessionLog: existing,
      };
    }
  }

  const latestFile = await findLatestSessionFile(character.id, worldId);
  if (latestFile) {
    const existing = await readSessionLog(latestFile);
    if (existing) {
      return {
        sessionFile: latestFile,
        sessionLog: existing,
      };
    }
  }

  const { fileName, log } = await createSessionLog(character.id, worldId, now, []);
  return {
    sessionFile: fileName,
    sessionLog: log,
  };
}

function findLastActionReminder(entries: SessionEntry[], locationId: LocationId) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.author === "gm" && entry.actionSummary && entry.actionSummary.locationId === locationId) {
      return entry.actionSummary;
    }
  }

  return null;
}

