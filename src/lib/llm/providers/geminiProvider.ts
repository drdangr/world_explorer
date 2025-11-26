import { GoogleGenAI, FunctionDeclaration, Type, GenerateContentResponse, Chat } from "@google/genai";

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

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_FUNCTION_CALLS = 5;

interface GeminiProviderOptions {
  model?: string | null;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private readonly ai: GoogleGenAI;
  private readonly modelName: string;

  constructor(apiKey: string, options: GeminiProviderOptions = {}) {
    if (!apiKey) {
      throw new Error("GeminiProvider требует API ключ");
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.modelName = options.model?.trim() || DEFAULT_MODEL;
  }

  async generateTurn(input: GenerateTurnInput): Promise<LLMGameTurn> {
    const prompt = buildUserPrompt(input);

    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction: buildSystemPrompt(),
        tools: [{ functionDeclarations: buildFunctionDeclarations() }],
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO" as any, // Allow model to decide between function and text
          },
        },
      },
    });

    let iterationCount = 0;
    let currentResponse: GenerateContentResponse | null = null;
    const toolLogs: any[] = []; // Track tool executions

    try {
      // Send initial message
      console.log("[Gemini] Sending initial message...");
      currentResponse = await chat.sendMessage({ message: prompt });
    } catch (error) {
      console.error("[Gemini] Error sending initial message:", error);
      throw error;
    }

    while (iterationCount < MAX_FUNCTION_CALLS) {
      iterationCount++;

      // console.log("[Gemini] Response received:", JSON.stringify(currentResponse, null, 2));

      const candidates = currentResponse.candidates;
      if (!candidates || candidates.length === 0) {
        console.error("[Gemini] No candidates in response");
        throw new Error("Gemini вернул пустой ответ - нет candidates");
      }

      const candidate = candidates[0];
      if (!candidate.content) {
        console.error("[Gemini] No content in candidate:", JSON.stringify(candidate, null, 2));
        throw new Error("Gemini вернул пустой ответ - нет content");
      }

      const parts = candidate.content.parts;
      if (!parts || parts.length === 0) {
        console.error("[Gemini] No parts in content");
        throw new Error("Gemini вернул пустой ответ - нет parts");
      }

      let functionCallFound = false;

      for (const part of parts) {
        if ((part as any).functionCall) {
          functionCallFound = true;
          const fc = (part as any).functionCall;
          const functionName = fc.name;
          const callId = fc.id || "unknown-id";

          console.log(`[Gemini Tool Call] ${functionName}:`, fc.args);

          const functionResult = executeFunctionCall(functionName, fc.args || {}, input);

          console.log(`[Gemini Tool Result] ${functionName}:`, functionResult);

          // Log this tool execution
          toolLogs.push({
            toolName: functionName,
            args: fc.args || {},
            result: functionResult,
            timestamp: Date.now(),
          });

          // Send function response back
          try {
            currentResponse = await chat.sendMessage({
              message: [
                {
                  functionResponse: {
                    name: functionName,
                    response: functionResult,
                    id: callId,
                  },
                },
              ],
            });
          } catch (error) {
            console.error(`[Gemini] Error sending tool response for ${functionName}:`, error);
            throw error;
          }

          break; // Process one function at a time
        }
      }

      if (!functionCallFound) {
        // No more function calls, get the text response
        const textPart = parts.find((p) => (p as any).text);
        if (textPart && (textPart as any).text) {
          return {
            ...parseGameTurn((textPart as any).text),
            toolLogs,
          };
        }

        // Try to get text from response
        const text = (currentResponse as any).text;
        if (text) {
          return {
            ...parseGameTurn(text),
            toolLogs,
          };
        }

        console.error("[Gemini] No text or function call in response:", JSON.stringify(currentResponse, null, 2));
        throw new Error("Gemini вернул пустой ответ");
      }
    }

    throw new Error("Превышен лимит вызовов функций");
  }
}

function buildFunctionDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: "get_near_locations",
      description: "Получить локации, непосредственно связанные с текущей локацией игрока. Используй это для проверки прямых соседей.",
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: "find_location_by_name",
      description: `Найти локацию на всей карте мира по приблизительному названию. 
Возвращает список подходящих локаций с оценкой совпадения (similarity от 0% до 100%).
ВАЖНО: Передавай название максимально близко к тому, что сказал игрок.
После получения результатов используй ТОЧНОЕ название (поле "name") из лучшего кандидата для get_route.`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          raw_name: {
            type: Type.STRING,
            description: "Название места, которое упомянул игрок (передай как можно точнее)",
          },
        },
        required: ["raw_name"],
      },
    },
    {
      name: "get_route",
      description: "Построить маршрут от текущей локации к целевой. Возвращает последовательность локаций для перемещения.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          target_location_name: {
            type: Type.STRING,
            description: "Точное название целевой локации",
          },
        },
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
          error: "Маршрут не найден",
        };
      }

      return {
        exists: true,
        distance: route.path.length - 1,
        path: route.path.map((loc) => ({
          name: loc.locationName,
          description: loc.mapDescription,
        })),
        formatted: formatRoute(route),
      };
    }

    default:
      return { error: `Функция ${functionName} не найдена` };
  }
}

function buildUserPrompt(input: GenerateTurnInput): string {
  const { world, character, playerMessage, history, locationContext, isInitial } = input;
  const { currentLocation, knownLocations, lastActionReminder } = locationContext;

  let prompt = `
Твоя роль: Гейм-мастер (ГМ) в текстовой ролевой игре.
Жанр: ${world.genre}
Сеттинг: ${world.setting}
Атмосфера: ${world.atmosphere}

Текущее состояние:
- Игрок: ${character.name}
- Локация: ${currentLocation.locationName} (${currentLocation.description})
- Окружение: ${knownLocations.map((l) => l.locationName).join(", ")}
`;

  if (lastActionReminder) {
    prompt += `\nНапоминание о последнем действии: ${JSON.stringify(lastActionReminder)}\n`;
  }

  prompt += `\nИстория последних ходов:\n`;
  history.forEach((entry) => {
    prompt += `- [${entry.author}]: ${entry.message}\n`;
  });

  prompt += `\nСообщение игрока: "${playerMessage}"\n`;

  prompt += `
Твоя задача:
1. Проанализировать сообщение игрока.
2. Если игрок хочет переместиться:
   - Сначала вызови get_near_locations() чтобы проверить соседей.
   - Если цель среди соседей - перемести игрока.
   - Если цель НЕ среди соседей - ОБЯЗАТЕЛЬНО вызови find_location_by_name(raw_name) чтобы найти локацию на карте.
   - Если локация найдена далеко - вызови get_route(target_location_name).
3. Сгенерировать ответ в формате JSON.

Формат ответа (JSON):
{
  "narration": "Художественное описание происходящего...",
  "playerLocation": {
    "name": "Новая локация (или текущая)",
    "mapDescription": "Краткое описание для карты",
    "description": "Полное описание локации",
    "items": [],
    "exits": [
      { "name": "Соседняя локация 1", "bidirectional": true }
    ]
  },
  "suggestions": ["Вариант действия 1", "Вариант действия 2"]
}
`;

  return prompt;
}

function buildSystemPrompt(): string {
  return `
Ты - опытный Гейм-мастер. Твоя задача - вести увлекательную игру, описывать мир и реагировать на действия игрока.
Ты ДОЛЖЕН использовать инструменты для навигации.

ПРАВИЛА НАВИГАЦИИ:
1. Если игрок называет локацию для перемещения:
   a) Передай в find_location_by_name максимально точное название, которое упомянул игрок
   b) Получи список кандидатов с оценкой совпадения (similarity)
   c) Если есть кандидат с similarity >= 70%, используй его ТОЧНОЕ название (name) для get_route
   d) Если лучший кандидат имеет similarity < 70%, спроси игрока уточнить

2. НИКОГДА не придумывай свои варианты названий - используй только то, что вернул find_location_by_name

3. Если маршрут найден - опиши путешествие через промежуточные локации

ПРИМЕР:
Игрок: "Хочу попасть на Дарницу"
ГМ: (вызывает find_location_by_name "Дарница")
    -> Результат: [{"name": "Станция Дарница", "similarity": "80%"}]
ГМ: (вызывает get_route "Станция Дарница") // Использует ТОЧНОЕ название!
    -> Маршрут: Холл -> Коридор -> Станция Дарница
ГМ: (Генерирует ответ): "Ты проходишь через..."
`;
}

function parseGameTurn(text: string): LLMGameTurn {
  try {
    const cleaned = jsonrepair(text);
    const parsed = JSON.parse(cleaned);
    return LLMGameTurnSchema.parse(parsed);
  } catch (error) {
    console.error("Ошибка парсинга ответа LLM:", text, error);
    throw new Error("Некорректный формат ответа от LLM");
  }
}
