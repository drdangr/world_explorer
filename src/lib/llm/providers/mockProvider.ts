import type { GenerateTurnInput, LLMProvider } from "../provider";
import type { LLMGameTurn, LocationPayload } from "../types";
import { DEFAULT_EXIT_LABEL } from "@/lib/gameplay/constants";

const DEFAULT_EXIT_NAME = "Улица у входа";
const DEFAULT_EXIT_LABEL_NORMALIZED = normalizeText(DEFAULT_EXIT_LABEL);

export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async generateTurn(input: GenerateTurnInput): Promise<LLMGameTurn> {
    return buildMockTurn(input);
  }
}

function buildMockTurn(input: GenerateTurnInput): LLMGameTurn {
  const { world, character, playerMessage, locationContext, isInitial } = input;
  const { currentLocation } = locationContext;
  const lowerMessage = playerMessage.toLowerCase();
  const normalizedMessage = normalizeText(playerMessage);

  const currentExits = mapExits(world, currentLocation);
  const inventoryItems = character.inventory.map((item) => ({
    name: item.name,
    description: item.description,
    portable: item.portable,
  }));

  const discoveries: LocationPayload[] = [];
  let narration = composeNarration(world, currentLocation, playerMessage, isInitial);
  let playerLocation: LocationPayload = {
    name: currentLocation.locationName,
    description: ensureDescription(world, currentLocation),
    items: currentLocation.items.map((item) => ({
      name: item.name,
      description: item.description,
      portable: item.portable,
    })),
    exits: currentExits,
  };

  let suggestions: string[] = [];

  if (isInitial) {
    if (playerLocation.exits.length === 0) {
      const defaultStreet: LocationPayload = {
        name: DEFAULT_EXIT_NAME,
        description: `Улица, ведущая прочь из ${currentLocation.locationName.toLowerCase()}.`,
        items: [],
        exits: [
          {
            name: currentLocation.locationName,
            label: "Вернуться внутрь",
            bidirectional: true,
          },
        ],
      };
      discoveries.push(defaultStreet);
      playerLocation.exits = [
        {
          name: defaultStreet.name,
          label: DEFAULT_EXIT_LABEL,
          bidirectional: true,
        },
      ];
    }
    suggestions = buildSuggestions(lowerMessage, playerLocation.exits);
  } else if (lowerMessage.includes("черн")) {
    const alley: LocationPayload = {
      name: "Улица за чёрным ходом",
      description:
        "Я выскальзываю через чёрный ход и оказываюсь в узком переулке, пахнущем сыростью и старым металлом.",
      items: [],
      exits: [
        {
          name: currentLocation.locationName,
          label: DEFAULT_EXIT_LABEL,
          bidirectional: true,
        },
        {
          name: "Тёмный переулок",
          label: "пройти в",
          bidirectional: true,
        },
      ],
    };

    discoveries.push({
      name: "Тёмный переулок",
      description: "В глубине слышны отдалённые шаги, а стены покрыты влажным мхом.",
      items: [],
      exits: [
        {
          name: alley.name,
          label: DEFAULT_EXIT_LABEL,
          bidirectional: true,
        },
      ],
    });

    playerLocation = alley;
    narration = alley.description;
    suggestions = mergeSuggestions(
      ["Осмотреть переулок", "Прислушаться к звукам", "Вернуться в заведение"],
      buildSuggestions("", playerLocation.exits),
    );
  } else if (lowerMessage.includes("кух")) {
    const kitchen: LocationPayload = {
      name: "Кухня",
      description:
        "Я протискиваюсь на кухню: горячий пар, запах жареного мяса и суета поваров мгновенно накрывают меня.",
      items: [
        {
          name: "Кухонный нож",
          description: "Острый нож с потёртой деревянной рукоятью.",
          portable: true,
        },
      ],
      exits: [
        {
          name: currentLocation.locationName,
          label: DEFAULT_EXIT_LABEL,
          bidirectional: true,
        },
        {
          name: "Улица за чёрным ходом",
          label: DEFAULT_EXIT_LABEL,
          bidirectional: true,
        },
      ],
    };

    discoveries.push({
      name: "Улица за чёрным ходом",
      description: "Чёрный ход ведёт к неприметной двери во двор, где редко кто появляется.",
      items: [],
      exits: [
        {
          name: kitchen.name,
          label: DEFAULT_EXIT_LABEL,
          bidirectional: true,
        },
      ],
    });

    playerLocation = kitchen;
    narration = kitchen.description;
    suggestions = mergeSuggestions(
      ["Проверить нож", "Посмотреть на поваров", "Выйти через чёрный ход"],
      buildSuggestions("", playerLocation.exits),
    );
  } else if (lowerMessage.includes("улиц") || lowerMessage.includes("выйт")) {
    const exit = playerLocation.exits.find((item) => item.name.toLowerCase().includes("улиц"));

    if (exit) {
      const sideAlley: LocationPayload = {
        name: "Тёмный переулок",
        description:
          "Я замечаю узкий переулок, уходящий в темноту. В лужах отражается неоновый отблеск вывесок, а где-то внутри слышится шорох.",
        items: [],
        exits: [
          {
            name: exit.name,
            label: DEFAULT_EXIT_LABEL,
            bidirectional: true,
          },
          {
            name: "Задний двор лавки алхимика",
            label: "пройти к",
            bidirectional: true,
          },
        ],
      };

      const alchemistYard: LocationPayload = {
        name: "Задний двор лавки алхимика",
        description:
          "Во дворе пахнет травами и серой, на верёвке сушатся пучки неизвестных растений. Дверь в лавку чуть приоткрыта.",
        items: [
          {
            name: "Пучок сушёного мухомора",
            description: "Местный алхимик уверяет, что это идеальная приправа для тролльего блюда.",
            portable: true,
          },
        ],
        exits: [
          {
            name: sideAlley.name,
            label: DEFAULT_EXIT_LABEL,
            bidirectional: true,
          },
        ],
      };

      discoveries.push(sideAlley, alchemistYard);

      playerLocation = {
        name: exit.name,
        description: `Я выхожу к ${exit.name.toLowerCase()} и на мгновение щурюсь от света.`,
        items: [],
        exits: [
          {
            name: currentLocation.locationName,
            label: DEFAULT_EXIT_LABEL,
            bidirectional: true,
          },
          {
            name: sideAlley.name,
            label: DEFAULT_EXIT_LABEL,
            bidirectional: true,
          },
        ],
      };

      narration = playerLocation.description;
      suggestions = mergeSuggestions(
        ["Осмотреть улицу", "Заглянуть в переулок", "Подойти к лавке", "Вернуться в помещение"],
        buildSuggestions("", playerLocation.exits),
      );
    }
  } else {
    const targetLocation = findConnectedLocation(world, currentLocation, normalizedMessage);

    if (targetLocation) {
      playerLocation = toLocationPayloadFromWorld(world, targetLocation);
      narration =
        targetLocation.description ??
        `Я останавливаюсь в ${targetLocation.locationName.toLowerCase()} и оглядываюсь по сторонам.`;
      suggestions = buildSuggestions(lowerMessage, playerLocation.exits);
    }
  }

  suggestions =
    suggestions.length > 0
      ? mergeSuggestions(suggestions, buildSuggestions(lowerMessage, playerLocation.exits))
      : buildSuggestions(lowerMessage, playerLocation.exits);

  return {
    narration,
    suggestions,
    playerLocation,
    discoveries,
    inventory: {
      items: inventoryItems,
    },
  };
}

function mapExits(world: GenerateTurnInput["world"], location: GenerateTurnInput["locationContext"]["currentLocation"]): LocationPayload["exits"] {
  return location.connections.map((connection) => {
    const target = world.graph[connection.targetId];
    return {
      name: target?.locationName ?? "Неизвестная локация",
      label: connection.label ?? DEFAULT_EXIT_LABEL,
      bidirectional: connection.bidirectional,
    };
  });
}

function ensureDescription(world: GenerateTurnInput["world"], location: GenerateTurnInput["locationContext"]["currentLocation"]): string {
  if (location.description) {
    return location.description;
  }

  return `Я осматриваюсь: ${world.atmosphere.toLowerCase()}, ${world.setting.toLowerCase()} и ${world.genre.toLowerCase()} сразу же ощущаются в воздухе.`;
}

function composeNarration(
  world: GenerateTurnInput["world"],
  location: GenerateTurnInput["locationContext"]["currentLocation"],
  playerMessage: string,
  isInitial: boolean,
): string {
  if (isInitial || !location.description) {
    return `Я делаю первый шаг в ${location.locationName.toLowerCase()} и ощущаю, как ${world.atmosphere.toLowerCase()} ложится на плечи.`;
  }

  if (!playerMessage.trim()) {
    return location.description;
  }

  return `${location.description} (${playerMessage.trim()})`;
}

function buildSuggestions(lowerMessage: string, exits: LocationPayload["exits"]): string[] {
  const base = ["Оглядеться", "Поговорить с кем-нибудь"];

  if (lowerMessage.includes("взять") || lowerMessage.includes("осмотр")) {
    base.push("Изучить предметы");
  }

  if (exits.length === 0) {
    base.push("Искать выход");
    if (!base.includes("Изучить предметы")) {
      base.push("Изучить предметы");
    }
  }

  const exitSuggestions = exits.map(formatExitAction);

  return mergeSuggestions(base, exitSuggestions);
}

function mergeSuggestions(primary: string[], additional: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const suggestion of [...primary, ...additional]) {
    if (!suggestion || seen.has(suggestion)) {
      continue;
    }

    seen.add(suggestion);
    merged.push(suggestion);
  }

  return merged;
}

function formatExitAction(exit: LocationPayload["exits"][number]): string {
  const prefix = exit.label?.trim() || DEFAULT_EXIT_LABEL;
  const hasPunctuation = /[\s]$/.test(prefix);
  const separator = hasPunctuation ? "" : " ";
  return `${prefix}${separator}${exit.name}`;
}

const MOVEMENT_WORDS = new Set([
  "пойти",
  "идти",
  "перейти",
  "направиться",
  "вернуться",
  "заглянуть",
  "пройти",
  "отправиться",
  "добраться",
]);

const INSPECTION_WORDS = new Set(["осмотреть", "оглядеться", "изучить", "рассмотреть", "оглядываться"]);

const STOP_WORDS = new Set([
  "пойти",
  "идти",
  "перейти",
  "направиться",
  "вернуться",
  "заглянуть",
  "отправиться",
  "пройти",
  "добраться",
  "к",
  "в",
  "на",
  "по",
  "когда",
  "через",
  "обратно",
  "назад",
  "и",
  "или",
  "же",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeMessage(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ")
    .trim();
}

function hasMovementIntent(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return normalized.split(" ").some((word) => MOVEMENT_WORDS.has(word));
}

function isInspectionIntent(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return normalized.split(" ").some((word) => INSPECTION_WORDS.has(word));
}

function matchesNormalized(message: string, target: string): boolean {
  if (!message || !target) {
    return false;
  }

  return (
    message === target ||
    message.startsWith(target) ||
    target.startsWith(message) ||
    message.includes(target) ||
    target.includes(message)
  );
}

function isBareReference(message: string, target: string): boolean {
  if (!message || !target) {
    return false;
  }

  const messageTokens = message.split(" ").filter(Boolean);
  const targetTokens = new Set(target.split(" ").filter(Boolean));

  if (messageTokens.length === 0) {
    return false;
  }

  return messageTokens.every((token) => targetTokens.has(token));
}

function findConnectedLocation(
  world: GenerateTurnInput["world"],
  location: GenerateTurnInput["locationContext"]["currentLocation"],
  normalizedMessage: string,
) {
  if (!normalizedMessage || isInspectionIntent(normalizedMessage)) {
    return null;
  }

  const cleanedMessage = sanitizeMessage(normalizedMessage);
  const candidates = [cleanedMessage, normalizedMessage].filter(Boolean);
  const movementIntent = hasMovementIntent(normalizedMessage);

  for (const connection of location.connections) {
    const target = world.graph[connection.targetId];
    if (!target) {
      continue;
    }

    const targetNameNormalized = normalizeText(target.locationName);
    const labelNormalized = connection.label ? normalizeText(connection.label) : "";
    const labelIsDefault = labelNormalized === DEFAULT_EXIT_LABEL_NORMALIZED;

    const matchedCandidate = candidates.find((candidate) => {
      if (matchesNormalized(candidate, targetNameNormalized)) {
        return true;
      }

      if (!labelNormalized || labelIsDefault) {
        return false;
      }

      return matchesNormalized(candidate, labelNormalized);
    });

    if (!matchedCandidate) {
      continue;
    }

    const bareReference =
      isBareReference(matchedCandidate, targetNameNormalized) ||
      (labelNormalized && !labelIsDefault ? isBareReference(matchedCandidate, labelNormalized) : false);

    const candidateTokensCount = matchedCandidate.split(" ").filter(Boolean).length;

    if (!movementIntent) {
      if (!bareReference) {
        continue;
      }

      if (candidateTokensCount === 1 && matchedCandidate !== targetNameNormalized && matchedCandidate !== labelNormalized) {
        continue;
      }
    }

    return target;
  }

  return null;
}

function toLocationPayloadFromWorld(
  world: GenerateTurnInput["world"],
  location: GenerateTurnInput["locationContext"]["currentLocation"],
): LocationPayload {
  return {
    name: location.locationName,
    description:
      location.description ??
      `Я оказываюсь в ${location.locationName.toLowerCase()} и стараюсь запомнить каждую деталь.`,
    items: location.items
      .filter((item) => !item.ownerCharacterId)
      .map((item) => ({
        name: item.name,
        description: item.description,
        portable: item.portable,
      })),
    exits: location.connections.map((connection) => ({
      name: world.graph[connection.targetId]?.locationName ?? "Неизвестная локация",
      label: connection.label ?? DEFAULT_EXIT_LABEL,
      bidirectional: connection.bidirectional,
    })),
  };
}

