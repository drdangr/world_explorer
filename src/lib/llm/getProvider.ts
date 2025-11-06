import type { LLMProvider } from "./provider";
import { GeminiProvider } from "./providers/geminiProvider";
import { MockProvider } from "./providers/mockProvider";

let cachedProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const providerName = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

  if (providerName === "gemini" && process.env.GEMINI_API_KEY) {
    cachedProvider = new GeminiProvider(process.env.GEMINI_API_KEY, {
      model: process.env.GEMINI_MODEL,
    });
    return cachedProvider;
  }

  if (providerName === "mock") {
    cachedProvider = new MockProvider();
    return cachedProvider;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      "GEMINI_API_KEY не найден, переключаюсь на MockProvider. Укажите ключ и переменную LLM_PROVIDER=gemini для использования Gemini Pro.",
    );
    cachedProvider = new MockProvider();
    return cachedProvider;
  }

  console.warn(
    `Неизвестный провайдер LLM "${providerName}", используем Gemini Pro по умолчанию. Для выключения установите LLM_PROVIDER=mock.`,
  );
  cachedProvider = new GeminiProvider(process.env.GEMINI_API_KEY, {
    model: process.env.GEMINI_MODEL,
  });
  return cachedProvider;
}

