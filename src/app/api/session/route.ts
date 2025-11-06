import { NextResponse } from "next/server";
import { z } from "zod";

import { applyGameTurn } from "@/lib/gameplay/applyGameTurn";
import { getLLMProvider } from "@/lib/llm/getProvider";
import { LLMGameTurnSchema } from "@/lib/llm/types";
import {
  getCharacterById,
  saveCharacter,
} from "@/lib/repository/characterRepository";
import { getWorldById, saveWorld } from "@/lib/repository/worldRepository";

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

    const history = character.history
      .filter((entry) => entry.worldId === world.id)
      .slice(-12);

    const turn = await provider.generateTurn({
      world,
      character,
      playerMessage: message,
      history,
      locationContext: {
        currentLocation,
        knownLocations,
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

    await Promise.all([saveWorld(updatedWorld), saveCharacter(updatedCharacter)]);

    return NextResponse.json({
      world: updatedWorld,
      character: updatedCharacter,
      entries: newEntries,
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

