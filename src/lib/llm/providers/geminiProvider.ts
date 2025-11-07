import { GoogleGenerativeAI } from "@google/generative-ai";

import { jsonrepair } from "jsonrepair";

import { DEFAULT_EXIT_LABEL } from "@/lib/gameplay/constants";

import type { GenerateTurnInput, LLMProvider } from "../provider";
import { LLMGameTurnSchema, type LLMGameTurn } from "../types";

const DEFAULT_MODEL = "gemini-1.5-pro-latest";
const HISTORY_LIMIT = 8;

interface GeminiProviderOptions {
  model?: string | null;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private readonly model;

  constructor(apiKey: string, options: GeminiProviderOptions = {}) {
    if (!apiKey) {
      throw new Error("GeminiProvider требует API ключ");
    }

    const client = new GoogleGenerativeAI(apiKey);
    const modelName = options.model?.trim() || DEFAULT_MODEL;

    this.model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: buildSystemPrompt(),
    });
  }

  async generateTurn(input: GenerateTurnInput): Promise<LLMGameTurn> {
    const prompt = buildUserPrompt(input);

    const result = await this.model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: input.isInitial ? 0.6 : 0.8,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    });

    const response = result.response;
    const candidates = response.candidates ?? [];

    const raw = candidates
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => {
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("\n")
      .trim();

    if (!raw) {
      console.error("Gemini вернул пустой ответ:", JSON.stringify(response, null, 2));
      throw new Error("Gemini вернул пустой ответ");
    }

    return parseGameTurn(raw);
  }
}

function buildSystemPrompt(): string {
  return [
    "Ты выступаешь в роли Гейм-мастера интерактивного приключения.",
    "Опиши мир так, будто наблюдаешь его глазами персонажа игрока, соблюдая заданные сеттинг, атмосферу и жанр.",
    "В `narration` используй художественный стиль от первого лица: запахи, звуки, ощущения, реакции героя.",
    "Одновременно формируй сухое, краткое `mapDescription` — 1‑2 предложения без эмоциональной окраски, чтобы хранить его в карте мира.",
    "Если игрок уже бывал в локации, используй сохранённый `mapDescription` как основу, но можешь варьировать литературную подачу в `narration`.",
    "Если локация новая, придумай `mapDescription`, предметы и потенциальные выходы, логично продолжая мир.",
    "Всегда возвращай ответ строго в формате JSON без дополнительного текста.",
  ].join("\n");
}

function buildUserPrompt(input: GenerateTurnInput): string {
  const { world, character, playerMessage, history, locationContext, isInitial } = input;
  const { currentLocation, knownLocations, lastActionReminder } = locationContext;

  const worldRegistry = buildWorldRegistry(currentLocation.id, knownLocations);

  const recentHistory = history
    .slice(-HISTORY_LIMIT)
    .map((entry) => `${entry.author === "player" ? "Игрок" : "ГМ"}: ${entry.message}`)
    .join("\n");

  const currentConnections = formatConnections(currentLocation, knownLocations);

  const reminderInstruction = lastActionReminder
    ? `Помни: последнее заметное действие игрока здесь — "${lastActionReminder.playerMessage}". Тогда произошло: "${lastActionReminder.gmResponse}". Учитывай последствия.`
    : null;

  const playerInstruction = isInitial
    ? "Это первый ход. Опиши вступление в центральную локацию, задай атмосферу и отметь хотя бы один возможный путь."
    : `Игрок сообщил: "${playerMessage}". Проанализируй это действие, опиши результат и при необходимости расширь мир.`;

  return [
    "Установки мира и героя:",
    `- Сеттинг: ${world.setting}`,
    `- Атмосфера: ${world.atmosphere}`,
    `- Жанр: ${world.genre}`,
    `- Персонаж: ${character.name}. ${character.description}`,
    `Текущая локация героя: ${currentLocation.locationName}.`,
    "Правило имён: если упоминаешь уже известную локацию, используй её точное название из раздела \"Карта известных локаций\" без добавления новых слов или уточнений.",
    currentConnections
      ? `Из этой локации видны пути: ${currentConnections.join("; ")}.`
      : "Из этой локации пока не выявлено путей.",
    worldRegistry ? `Карта известных локаций:\n${worldRegistry}` : "Это единственная исследованная локация сейчас.",
    recentHistory ? `Недавняя история:\n${recentHistory}` : "История пуста, это начало приключения.",
    reminderInstruction,
    playerInstruction,
    JSON_FORMAT_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const JSON_FORMAT_INSTRUCTIONS = `Форматируй ответ строго в JSON (без текста до или после). Структура:
{
  "narration": "описание событий для игрока",
  "mapDescription": "краткое жёсткое описание текущей локации без эмоций",
  "suggestions": ["краткие идеи следующих действий"],
  "playerLocation": {
    "name": "название конечной локации, куда попал герой",
    "mapDescription": "сухое описание для карты",
    "description": "литературное описание для чата от 1-го лица",
    "items": [
      { "name": "название предмета", "description": "в чём ценность", "portable": true }
    ],
    "exits": [
      { "name": "название соседней локации", "label": "фраза-команда (например, \\"${DEFAULT_EXIT_LABEL}\\")", "bidirectional": true }
    ]
  },
  "discoveries": [
    {
      "name": "новая локация или уточнённая",
      "mapDescription": "сухое описание для карты",
      "description": "литературное описание, если герой кратко заглянул или ощутил новинку",
      "items": [],
      "exits": [
        { "name": "название потенциальной локации", "label": "фраза-команда", "bidirectional": true }
      ]
    }
  ],
  "inventory": {
    "items": [
      { "name": "предмет у героя", "description": "зачем полезен", "portable": true }
    ]
  }
}`;

function parseGameTurn(raw: string): LLMGameTurn {
  const candidate = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    console.error("Не удалось распарсить ответ Gemini. Исходные данные:", candidate);

    try {
      parsed = JSON.parse(jsonrepair(candidate));
    } catch (repairError) {
      throw new Error(
        `Gemini вернул некорректный JSON: ${(error as Error).message}; jsonrepair: ${(repairError as Error).message}`,
      );
    }
  }

  const result = LLMGameTurnSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Ответ Gemini не соответствует схеме. Исходные данные:", candidate);
    throw new Error(`Gemini прислал JSON, не соответствующий схеме: ${result.error.message}`);
  }

  return result.data;
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const directMatch = text.match(/\{[\s\S]*\}/);
  if (directMatch?.[0]) {
    return directMatch[0];
  }

  return text.trim();
}

function findLocationName(locations: GenerateTurnInput["locationContext"]["knownLocations"], id: string): string | undefined {
  return locations.find((location) => location.id === id)?.locationName;
}

type CurrentLocation = GenerateTurnInput["locationContext"]["currentLocation"];
type KnownLocation = GenerateTurnInput["locationContext"]["knownLocations"][number];

function getMapDescription(location: CurrentLocation | KnownLocation): string {
  const candidate = (location as { mapDescription?: string | null }).mapDescription;
  if (candidate && candidate.trim().length > 0) {
    return candidate.trim();
  }

  return location.description ?? "Описание отсутствует";
}

function buildWorldRegistry(currentLocationId: string, locations: GenerateTurnInput["locationContext"]["knownLocations"]): string {
  if (locations.length === 0) {
    return "";
  }

  const limited = locations.slice(0, 12);

  return limited
    .map((location) => {
      const header = `${location.locationName}${location.id === currentLocationId ? " (текущая)" : ""}`;
      const mapDesc = getMapDescription(location);
      const exits = formatConnections(location, locations)
        .map((entry) => `    - ${entry}`)
        .join("\n");

      return [`• ${header}`, `  Описание: ${mapDesc}`, exits ? `  Пути:\n${exits}` : "  Пути: (нет данных)"].join("\n");
    })
    .join("\n\n");
}

function formatConnections(location: CurrentLocation | KnownLocation, knownLocations: GenerateTurnInput["locationContext"]["knownLocations"]): string[] {
  if (!location.connections.length) {
    return [];
  }

  return location.connections.map((connection) => {
    const targetName = findLocationName(knownLocations, connection.targetId) ?? "Неизвестно";
    const label = connection.label?.trim() || DEFAULT_EXIT_LABEL;
    return `${label} ${targetName}`;
  });
}

