import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

import type { GenerateTurnInput } from "@/lib/llm/provider";
import { GeminiProvider } from "@/lib/llm/providers/geminiProvider";
import type { Character, WorldsFile } from "@/types/game";

loadEnv({ path: ".env.local" });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY отсутствует. Добавьте ключ в .env.local и повторите.");
    process.exit(1);
  }

  const worldFilePath = resolve("data/worlds.json");
  const characterFilePath = resolve("data/characters.json");

  const worldsData = JSON.parse(readFileSync(worldFilePath, "utf-8")) as WorldsFile;
  const charactersData = JSON.parse(readFileSync(characterFilePath, "utf-8")) as {
    characters: Character[];
  };

  const world = worldsData.worlds[0];
  const character = charactersData.characters.find((item) => item.currentWorldId === world.id);
  if (!world || !character) {
    console.error("Не удалось найти тестовый мир и персонажа. Проверьте data/worlds.json и data/characters.json.");
    process.exit(1);
  }

  const provider = new GeminiProvider(apiKey, {
    model: process.env.GEMINI_MODEL,
  });

  const currentLocation = world.graph[character.currentLocationId ?? world.entryLocationId];
  const knownLocations = Object.values(world.graph);

  const playerMessage = process.argv[2] ?? "";
  const isInitial = !playerMessage;

  const input: GenerateTurnInput = {
    world,
    character,
    playerMessage,
    history: [],
    locationContext: {
      currentLocation,
      knownLocations,
    },
    isInitial,
  };

  try {
    const turn = await provider.generateTurn(input);
    console.dir(turn, { depth: null });
  } catch (error) {
    console.error("Запрос к Gemini завершился ошибкой:", error);
  }
}

void main();

