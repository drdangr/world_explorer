import { randomUUID } from "node:crypto";

import type { Character, CharacterId, Item, LocationNode, SessionEntry, World } from "@/types/game";
import type { LLMGameTurn, ItemDescriptor, LocationPayload } from "@/lib/llm/types";
import { DEFAULT_EXIT_LABEL } from "@/lib/gameplay/constants";

interface ApplyGameTurnParams {
  world: World;
  character: Character;
  turn: LLMGameTurn;
  playerMessage: string;
  isInitial: boolean;
}

export interface ApplyGameTurnResult {
  world: World;
  character: Character;
  newEntries: SessionEntry[];
}

const HISTORY_LIMIT = 200;

export function applyGameTurn({
  world,
  character,
  turn,
  playerMessage,
  isInitial,
}: ApplyGameTurnParams): ApplyGameTurnResult {
  const worldClone: World = structuredClone(world);
  const characterClone: Character = structuredClone(character);

  const previousLocationId =
    characterClone.currentLocationId ?? worldClone.entryLocationId ?? null;

  const playerLocationNode = upsertLocationFromPayload(
    worldClone,
    turn.playerLocation,
    {
      discovered: true,
    },
    turn.mapDescription,
  );

  turn.discoveries.forEach((location) => {
    upsertLocationFromPayload(
      worldClone,
      location,
      {
        discovered: false,
      },
    );
  });

  characterClone.currentWorldId = worldClone.id;
  characterClone.currentLocationId = playerLocationNode.id;
  characterClone.inventory = mergeItems(
    characterClone.inventory,
    turn.inventory.items,
    characterClone.id,
  );

  if (!worldClone.ownerCharacterIds.includes(characterClone.id)) {
    worldClone.ownerCharacterIds.push(characterClone.id);
  }

  worldClone.updatedAt = new Date().toISOString();

  const entries: SessionEntry[] = [];

  if (!isInitial && playerMessage.trim()) {
    entries.push({
      id: randomUUID(),
      worldId: worldClone.id,
      locationId: previousLocationId,
      author: "player",
      message: playerMessage.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  entries.push({
    id: randomUUID(),
    worldId: worldClone.id,
    locationId: playerLocationNode.id,
    author: "gm",
    message: turn.narration,
    createdAt: new Date().toISOString(),
  });

  characterClone.history = [...characterClone.history, ...entries].slice(-HISTORY_LIMIT);

  return {
    world: worldClone,
    character: characterClone,
    newEntries: entries,
  };
}

interface UpsertLocationOptions {
  discovered: boolean;
}

function upsertLocationFromPayload(
  world: World,
  payload: LocationPayload,
  options: UpsertLocationOptions,
  fallbackMapDescription?: string | null,
): LocationNode {
  const locationNode = ensureLocation(world, payload.name);

  locationNode.locationName = payload.name;
  locationNode.description = payload.description;
  locationNode.mapDescription = resolveMapDescription(
    payload.mapDescription,
    fallbackMapDescription,
    locationNode.mapDescription,
    locationNode.description,
  );
  locationNode.discovered = locationNode.discovered || options.discovered;
  locationNode.items = mergeItems(locationNode.items, payload.items, null);

  syncExits(world, locationNode, payload);

  return locationNode;
}

function ensureLocation(world: World, name: string): LocationNode {
  const normalized = normalize(name);
  const existing = Object.values(world.graph).find(
    (location) => normalize(location.locationName) === normalized,
  );

  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const node: LocationNode = {
    id,
    locationName: name,
    description: null,
    mapDescription: null,
    discovered: false,
    items: [],
    connections: [],
  };

  world.graph[id] = node;
  return node;
}

function syncExits(world: World, source: LocationNode, payload: LocationPayload) {
  payload.exits.forEach((exit) => {
    const target = ensureLocation(world, exit.name);
    const label = exit.label?.trim() || DEFAULT_EXIT_LABEL;
    const bidirectional = exit.bidirectional ?? true;

    upsertConnection(source, target, label, bidirectional);

    if (bidirectional) {
      upsertConnection(target, source, label, bidirectional);
    }
  });
}

function upsertConnection(source: LocationNode, target: LocationNode, label: string, bidirectional: boolean) {
  const existingIndex = source.connections.findIndex((connection) => connection.targetId === target.id);

  if (existingIndex >= 0) {
    const existing = source.connections[existingIndex];
    source.connections[existingIndex] = {
      ...existing,
      label: label || existing.label || DEFAULT_EXIT_LABEL,
      bidirectional: existing.bidirectional || bidirectional,
    };
    return;
  }

  source.connections.push({
    id: randomUUID(),
    targetId: target.id,
    label: label || DEFAULT_EXIT_LABEL,
    bidirectional,
  });
}

function mergeItems(
  existingItems: Item[],
  descriptors: ItemDescriptor[],
  ownerCharacterId: CharacterId | null,
): Item[] {
  const mapByName = new Map<string, Item>();

  existingItems.forEach((item) => {
    mapByName.set(normalize(item.name), item);
  });

  return descriptors.map((descriptor) => {
    const key = normalize(descriptor.name);
    const existing = mapByName.get(key);

    return {
      id: existing?.id ?? randomUUID(),
      name: descriptor.name,
      description: descriptor.description ?? "",
      portable: descriptor.portable ?? true,
      ownerCharacterId,
    } satisfies Item;
  });
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveMapDescription(
  primary?: string | null,
  ...fallbacks: Array<string | null | undefined>
): string | null {
  const all = [primary, ...fallbacks];

  for (const candidate of all) {
    if (!candidate) {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

