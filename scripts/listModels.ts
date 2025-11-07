import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY не установлен. Укажите ключ в переменной окружения и повторите запрос.");
    process.exit(1);
  }

  const url = new URL("https://generativelanguage.googleapis.com/v1/models");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Запрос завершился ошибкой ${response.status}: ${response.statusText}`);
      const body = await response.text();
      console.error(body);
      process.exit(1);
    }

    const payload: {
      models?: Array<{
        name?: string;
        displayName?: string;
        description?: string;
        supportedGenerationMethods?: string[];
      }>;
    } = await response.json();

    if (!payload.models || payload.models.length === 0) {
      console.log("Список моделей пуст или недоступен для указанного ключа.");
      return;
    }

    console.log("Доступные модели и поддерживаемые методы генерации:\n");
    for (const model of payload.models) {
      const name = model.name ?? "неизвестно";
      const methods = model.supportedGenerationMethods?.join(", ") ?? "нет данных";
      console.log(`- ${name}`);
      console.log(`  методы: ${methods}`);
      if (model.displayName) {
        console.log(`  display name: ${model.displayName}`);
      }
      if (model.description) {
        console.log(`  описание: ${model.description}`);
      }
      console.log();
    }
  } catch (error) {
    console.error("Не удалось получить список моделей:", error);
    process.exit(1);
  }
}

void main();

