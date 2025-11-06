import { GoogleGenerativeAI } from "@google/generative-ai";

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

    const response = await this.model.generateContent({
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

    const text = response.response.text();
    return parseGameTurn(text);
  }
}

function buildSystemPrompt(): string {
  return [
    "Ты — ведущий интерактивного текстового приключения. Ты играешь роль Гейм-мастера и описываешь события в форме внутреннего монолога персонажа игрока (1-е лицо).",
    "Всегда следуй сеттингу, жанру и атмосфере мира. Описывай сцену, предметы, звуки и запахи так, будто герой их воспринимает напрямую.",
    "Отвечай кратко, но образно. Максимум 5-6 предложений в `narration`. Не перечисляй механические подробности, если их можно показать через ощущения героя.",
    "Фокусируйся на логике мира. Если действие игрока невозможно, опиши последствия и предложи альтернативы, но все равно предоставь итоговое `playerLocation`.",
    "Всегда возвращай ответ строго в формате JSON без пояснений, комментариев и текста вне JSON.",
  ].join("\n");
}

function buildUserPrompt(input: GenerateTurnInput): string {
  const { world, character, playerMessage, history, locationContext, isInitial } = input;
  const { currentLocation, knownLocations } = locationContext;

  const knownLocationsText = knownLocations
    .map((location) => {
      const exits = location.connections
        .map((connection) => {
          const targetName = findLocationName(knownLocations, connection.targetId) ?? "Неизвестно";
          return `- ${targetName}${connection.label ? ` (${connection.label})` : ""}`;
        })
        .join("\n");

      const header = `${location.locationName}${location.id === currentLocation.id ? " (текущая)" : ""}`;
      const description = location.description ?? "Описание ещё не создано";

      return [header, description, exits ? `Выходы:\n${exits}` : "Выходы пока неизвестны"].join("\n");
    })
    .join("\n\n");

  const recentHistory = history
    .slice(-HISTORY_LIMIT)
    .map((entry) => `${entry.author === "player" ? "Игрок" : "ГМ"}: ${entry.message}`)
    .join("\n");

  const currentConnections = currentLocation.connections
    .map((connection) => {
      const targetName = findLocationName(knownLocations, connection.targetId) ?? "Неизвестно";
      const suffix = connection.label ? ` (${connection.label})` : "";
      return `${targetName}${suffix}`;
    })
    .join(", ");

  const playerInstruction = isInitial
    ? "Это первый ход. Опиши вступление в центральную локацию, задай атмосферу и отметь хотя бы один возможный путь."
    : `Игрок сообщил: "${playerMessage}". Проанализируй это действие, опиши результат и при необходимости расширь мир.`;

  return [
    `Сеттинг: ${world.setting}`,
    `Атмосфера: ${world.atmosphere}`,
    `Жанр: ${world.genre}`,
    `Персонаж игрока: ${character.name}. ${character.description}`,
    `Текущая локация героя: ${currentLocation.locationName}. Описание: ${currentLocation.description ?? "ещё не описана"}.`,
    currentConnections
      ? `Из этой локации уже известны пути: ${currentConnections}.`
      : "Пути из текущей локации ещё не описаны.",
    knownLocationsText ? `Известные локации:\n${knownLocationsText}` : "Это единственная исследованная локация сейчас.",
    recentHistory ? `Предыдущие реплики:\n${recentHistory}` : "История пуста, это начало приключения.",
    playerInstruction,
    JSON_FORMAT_INSTRUCTIONS,
  ].join("\n\n");
}

const JSON_FORMAT_INSTRUCTIONS = `Форматируй ответ строго в JSON (без текста до или после). Структура:
{
  "narration": "описание событий для игрока",
  "suggestions": ["краткие идеи следующих действий"],
  "playerLocation": {
    "name": "название конечной локации, куда попал герой",
    "description": "описание от лица героя",
    "items": [
      { "name": "название предмета", "description": "в чём ценность", "portable": true }
    ],
    "exits": [
      { "name": "название соседней локации", "label": "как герой воспринимает путь", "bidirectional": true }
    ]
  },
  "discoveries": [
    {
      "name": "новая локация или уточнённая",
      "description": "краткое описание, если герой туда заглянул",
      "items": [],
      "exits": []
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
    throw new Error(`Gemini вернул некорректный JSON: ${(error as Error).message}`);
  }

  const result = LLMGameTurnSchema.safeParse(parsed);
  if (!result.success) {
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

