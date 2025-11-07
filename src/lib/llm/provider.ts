import type { Character, LocationNode, SessionEntry, World } from "@/types/game";

import type { LLMGameTurn } from "./types";

export interface GenerateTurnInput {
  world: World;
  character: Character;
  playerMessage: string;
  history: SessionEntry[];
  locationContext: {
    currentLocation: LocationNode;
    knownLocations: LocationNode[];
    lastActionReminder?: {
      playerMessage: string;
      gmResponse: string;
      occurredAt: string;
    };
  };
  isInitial: boolean;
}

export interface LLMProvider {
  readonly name: string;
  generateTurn(input: GenerateTurnInput): Promise<LLMGameTurn>;
}

