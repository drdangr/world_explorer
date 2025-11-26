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
      locationId: previousLocationId,
      author: "player",
      message: playerMessage.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  entries.push({
    id: randomUUID(),
    locationId: playerLocationNode.id,
    author: "gm",
    message: turn.narration,
    createdAt: new Date().toISOString(),
  });

  const didMove = playerLocationNode.id !== previousLocationId;
  const isAction = !isInitial && playerMessage.trim().length > 0 && !didMove;

  if (isAction) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index].author === "gm") {
        entries[index].actionSummary = {
          playerMessage: playerMessage.trim(),
          gmResponse: turn.narration,
          occurredAt: entries[index].createdAt,
          locationId: entries[index].locationId,
        };
        break;
      }
    }
  }

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
  const locationNode = ensureLocation(world, payload.name, payload.mapDescription ?? null);

  if (normalize(locationNode.locationName) === normalize(payload.name)) {
    locationNode.locationName = payload.name;
  }
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

function ensureLocation(world: World, name: string, mapDescription?: string | null): LocationNode {
  const normalizedName = normalize(name);

  const byName = Object.values(world.graph).find(
    (location) => normalize(location.locationName) === normalizedName,
  );

  if (byName) {
    return byName;
  }

  if (mapDescription) {
    const normalizedMapDescription = normalize(mapDescription);

    if (normalizedMapDescription.length > 0) {
      const byMapDescription = Object.values(world.graph).find((location) => {
        const locationMap = location.mapDescription ? normalize(location.mapDescription) : null;
        const locationDescription = location.description ? normalize(location.description) : null;

        return (
          (locationMap && locationMap === normalizedMapDescription) ||
          (locationDescription && locationDescription === normalizedMapDescription)
        );
      });

      if (byMapDescription) {
        return byMapDescription;
      }
    }
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

    // Check if there's already a path between source and target through intermediate nodes
    // If yes, don't add a direct connection
    const pathExists = hasPath(world.graph, source.id, target.id, 2); // Check path with depth > 1

    if (!pathExists) {
      upsertConnection(source, target, label, bidirectional);

      if (bidirectional) {
        upsertConnection(target, source, label, bidirectional);
      }
    } else {
      console.log(`[Navigation] Skipping direct connection ${source.locationName} → ${target.locationName}: path already exists through intermediate nodes`);
    }
  });
}

/**
 * Check if there's a path between two nodes with minimum depth
 * @param graph - World graph
 * @param fromId - Source location ID
 * @param toId - Target location ID
 * @param minDepth - Minimum depth to consider (2 = path through at least one intermediate node)
 * @returns true if path exists with depth >= minDepth
 */
function hasPath(
  graph: Record<string, LocationNode>,
  fromId: string,
  toId: string,
  minDepth: number
): boolean {
  if (fromId === toId) return false;

  const queue: Array<{ id: string; depth: number }> = [{ id: fromId, depth: 0 }];
  const visited = new Set<string>([fromId]);
  const MAX_DEPTH = 7;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.depth >= MAX_DEPTH) continue;

    const node = graph[current.id];
    if (!node) continue;

    for (const conn of node.connections) {
      if (conn.targetId === toId) {
        // Found target - check if depth meets minimum requirement
        if (current.depth + 1 >= minDepth) {
          return true;
        }
      }

      if (!visited.has(conn.targetId)) {
        visited.add(conn.targetId);
        queue.push({
          id: conn.targetId,
          depth: current.depth + 1,
        });
      }
    }
  }

  return false;
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

