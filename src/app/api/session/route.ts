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
  forceNew: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { worldId, characterId, message, isInitial, forceNew } = SessionRequestSchema.parse(json);

    const world = await getWorldOrThrow(worldId);
    const character = await getCharacterOrThrow(characterId);

    const currentLocation = resolveCurrentLocation(world, character.currentLocationId);
    const knownLocations = Object.values(world.graph);

    const provider = getLLMProvider();

    const { sessionFile, sessionLog } = await resolveSessionLog(character, worldId, forceNew);
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
        lastActionReminder: lastActionReminder ?? undefined,
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
      toolLogs: parsedTurn.toolLogs || [],
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

class NotFoundError extends Error { }

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

async function resolveSessionLog(
  character: Awaited<ReturnType<typeof getCharacterOrThrow>>,
  worldId: string,
  forceNew: boolean = false,
) {
  // If forceNew is true, always create a new session
  if (forceNew) {
    const startedAt = new Date().toISOString();
    const { fileName, log } = await createSessionLog(character.id, worldId, startedAt, []);
    return { sessionFile: fileName, sessionLog: log };
  }

  // Try to find existing session
  const candidateFiles = [
    character.lastSessionFile,
    await findLatestSessionFile(character.id, worldId),
  ].filter((file): file is string => Boolean(file));

  for (const file of candidateFiles) {
    const log = await readSessionLog(file);
    if (log && log.worldId === worldId && log.characterId === character.id) {
      return { sessionFile: file, sessionLog: log };
    }
  }

  // No existing session found, create new one
  const startedAt = new Date().toISOString();
  const { fileName, log } = await createSessionLog(character.id, worldId, startedAt, []);
  return { sessionFile: fileName, sessionLog: log };
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

