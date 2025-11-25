import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

import { jsonrepair } from "jsonrepair";

import { DEFAULT_EXIT_LABEL } from "@/lib/gameplay/constants";
import {
  getNearLocations,
  findLocationByName,
  getRoute,
  formatRoute,
} from "../navigationTools";

import type { GenerateTurnInput, LLMProvider } from "../provider";
import { LLMGameTurnSchema, type LLMGameTurn } from "../types";

const DEFAULT_MODEL = "gemini-1.5-pro-latest";
const HISTORY_LIMIT = 8;
const MAX_FUNCTION_CALLS = 5;

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
      tools: [{ functionDeclarations: buildFunctionDeclarations() }],
    });
  }

  async generateTurn(input: GenerateTurnInput): Promise<LLMGameTurn> {
    const prompt = buildUserPrompt(input);

    const chat = this.model.startChat({
      generationConfig: {
        temperature: input.isInitial ? 0.6 : 0.8,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    });

    let iterationCount = 0;
    let currentMessage: any = prompt;

    while (iterationCount < MAX_FUNCTION_CALLS) {
      iterationCount++;

      const result = await chat.sendMessage(currentMessage);
      const response = result.response;

      const functionCalls = response.functionCalls();

      if (!functionCalls || functionCalls.length === 0) {
        const text = response.text();
        if (!text) {
          console.error("Gemini вернул пустой ответ:", JSON.stringify(response, null, 2));
          throw new Error("Gemini вернул пустой ответ");
        }
        return parseGameTurn(text);
      }

      const functionResponses = functionCalls.map((call) => {
        console.log(`[Gemini Tool Call] ${call.name}:`, call.args);

        const functionResult = executeFunctionCall(call.name, call.args, input);

        console.log(`[Gemini Tool Result] ${call.name}:`, functionResult);

        return {
          functionResponse: {
            name: call.name,
            response: functionResult,
          },
        };
      });

      currentMessage = functionResponses;
    }

    throw new Error("Превышен лимит вызовов функций");
  }
}

function buildFunctionDeclarations() {
  return [
    {
      name: "get_near_locations",
      description: "Получить локации, непосредственно связанные с текущей локацией игрока. Используй это для проверки прямых соседей.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {} as Record<string, any>,
      },
    },
    {
      name: "find_location_by_name",
      description: "Найти локацию на всей карте мира по приблизительному названию. Возвращает список подходящих локаций с оценкой совпадения.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          raw_name: {
            type: SchemaType.STRING,
            description: "Название места, куда предположительно хочет пойти игрок",
          },
        } as Record<string, any>,
        required: ["raw_name"],
      },
    },
    {
      name: "get_route",
      description: "Построить маршрут от текущей локации к целевой. Возвращает последовательность локаций для перемещения.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          target_location_name: {
            type: SchemaType.STRING,
            description: "Точное название целевой локации",
          },
        } as Record<string, any>,
        required: ["target_location_name"],
      },
    },
  ];
}

function executeFunctionCall(
  functionName: string,
  args: Record<string, any>,
  input: GenerateTurnInput
): any {
  const { world, locationContext } = input;
  const { currentLocation } = locationContext;

  switch (functionName) {
    case "get_near_locations": {
      const nearLocations = getNearLocations(currentLocation.id, world.graph);
      return {
        count: nearLocations.length,
        locations: nearLocations.map((loc) => ({
          name: loc.name,
          description: loc.mapDescription || "",
        })),
      };
    }

    case "find_location_by_name": {
      const rawName = args.raw_name as string;
      if (!rawName) {
        return { error: "Не указано название для поиска" };
      }

      const matches = findLocationByName(rawName, world.graph);
      return {
        found: matches.length > 0,
        matches: matches.map((match) => ({
          name: match.name,
          description: match.mapDescription,
          similarity: Math.round(match.similarity * 100) + "%",
        })),
      };
    }

    case "get_route": {
      const targetName = args.target_location_name as string;
      if (!targetName) {
        return { error: "Не указана целевая локация" };
      }

      const targetLocation = Object.values(world.graph).find(
        (loc) => loc.locationName === targetName
      );

      if (!targetLocation) {
        return { error: `Локация "${targetName}" не найдена на карте` };
      }

      const route = getRoute(currentLocation.id, targetLocation.id, world.graph);

      if (!route.exists) {
        return {
          exists: false,
          message: "Маршрут не найден. Локации не связаны.",
        };
      }

      return {
        exists: true,
        distance: route.totalDistance,
        path: route.path.map((loc) => ({
          name: loc.name,
          description: loc.mapDescription,
        })),
        formatted: formatRoute(route),
      };
    }

    default:
      return { error: `Неизвестная функция: ${functionName}` };
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
    "",
    "NAVIGATION TOOLS:",
    "У тебя есть инструменты для работы с картой:",
    "- get_near_locations() - показывает соседние локации",
    "- find_location_by_name(raw_name) - ищет локацию по названию",
    "- get_route(target_location_name) - строит маршрут",
    "",
    "PRIORITY LOGIC:",
    "0. Определи куда хочет игрок (raw_name)",
    "1. Вызови get_near_locations() - если raw_name среди них, переведи туда",
    "2. Если нет - вызови find_location_by_name(raw_name)",
    "3. Если нашлась - вызови get_route(имя_локации) и опиши маршрут",
    "4. Если не нашлась - реши создать новую или отказать",
    "",
    "Всегда возвращай ответ строго в формате JSON без дополнительного текста.",
  ].join("\n");
}

function buildUserPrompt(input: GenerateTurnInput): string {
  const { world, character, playerMessage, history, locationContext, isInitial } = input;
  const { currentLocation, lastActionReminder } = locationContext;

  const recentHistory = history
    .slice(-HISTORY_LIMIT)
    .map((entry) => `${entry.author === "player" ? "Игрок" : "ГМ"}: ${entry.message}`)
    .join("\n");

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
    `- Инвентарь: ${character.inventory.length > 0
      ? character.inventory.map((item) => `${item.name} (${item.description})`).join(", ")
      : "пуст"
    }`,
    `Текущая локация героя: ${currentLocation.locationName}.`,
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
