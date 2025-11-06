export type WorldId = string;
export type LocationId = string;
export type CharacterId = string;
export type ItemId = string;
export type ConnectionId = string;
export type SessionEntryId = string;

export interface World {
  id: WorldId;
  name: string;
  setting: string;
  atmosphere: string;
  genre: string;
  createdAt: string;
  updatedAt: string;
  entryLocationId: LocationId;
  graph: Record<LocationId, LocationNode>;
  ownerCharacterIds: CharacterId[];
}

export interface LocationNode {
  id: LocationId;
  locationName: string;
  description: string | null;
  discovered: boolean;
  items: Item[];
  connections: Connection[];
}

export interface Connection {
  id: ConnectionId;
  targetId: LocationId;
  label?: string;
  bidirectional: boolean;
}

export interface Item {
  id: ItemId;
  name: string;
  description: string;
  portable: boolean;
  ownerCharacterId: CharacterId | null;
}

export interface Character {
  id: CharacterId;
  name: string;
  description: string;
  inventory: Item[];
  currentWorldId: WorldId | null;
  currentLocationId: LocationId | null;
  history: SessionEntry[];
}

export interface SessionEntry {
  id: SessionEntryId;
  worldId: WorldId;
  locationId: LocationId | null;
  author: "player" | "gm";
  message: string;
  createdAt: string;
}

export interface WorldsFile {
  worlds: World[];
}

export interface CharactersFile {
  characters: Character[];
}

export interface CreateWorldPayload {
  name: string;
  setting: string;
  atmosphere: string;
  genre: string;
}

export interface UpdateWorldPayload {
  name?: string;
  setting?: string;
  atmosphere?: string;
  genre?: string;
}

export interface CreateCharacterPayload {
  name: string;
  description: string;
  currentWorldId?: WorldId | null;
}

export interface UpdateCharacterPayload {
  name?: string;
  description?: string;
  currentWorldId?: WorldId | null;
  currentLocationId?: LocationId | null;
}

