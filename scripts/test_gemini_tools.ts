
import { config } from "dotenv";
import { GeminiProvider } from "../src/lib/llm/providers/geminiProvider";
import type { GenerateTurnInput } from "../src/lib/llm/provider";
import type { World, Character } from "../src/types/game";

// Load environment variables
config({ path: ".env.local" });

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("GEMINI_API_KEY not found in .env.local");
    process.exit(1);
}

async function runTest() {
    console.log("Initializing GeminiProvider...");
    const provider = new GeminiProvider(API_KEY!);

    // Mock World
    const world: World = {
        id: "test-world",
        name: "Test World",
        setting: "Cyberpunk",
        atmosphere: "Dark",
        genre: "Sci-Fi",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entryLocationId: "loc-1",
        graph: {
            "loc-1": {
                id: "loc-1",
                locationName: "Станция Дарница",
                description: "Шумная станция метро.",
                mapDescription: "Станция метро Дарница.",
                discovered: true,
                items: [],
                connections: [
                    { id: "c1", targetId: "loc-2", label: "поехать на", bidirectional: true },
                ],
            },
            "loc-2": {
                id: "loc-2",
                locationName: "Станция Левобережная",
                description: "Станция возле выставочного центра.",
                mapDescription: "Станция метро Левобережная.",
                discovered: true,
                items: [],
                connections: [
                    { id: "c2", targetId: "loc-1", label: "вернуться на", bidirectional: true },
                    { id: "c3", targetId: "loc-3", label: "поехать на", bidirectional: true },
                ],
            },
            "loc-3": {
                id: "loc-3",
                locationName: "Станция Гидропарк",
                description: "Остров развлечений.",
                mapDescription: "Станция метро Гидропарк.",
                discovered: true,
                items: [],
                connections: [
                    { id: "c4", targetId: "loc-2", label: "вернуться на", bidirectional: true },
                    { id: "c5", targetId: "loc-4", label: "поехать на", bidirectional: true },
                ],
            },
            "loc-4": {
                id: "loc-4",
                locationName: "Станция Днепр",
                description: "Станция над рекой.",
                mapDescription: "Станция метро Днепр.",
                discovered: true,
                items: [],
                connections: [
                    { id: "c6", targetId: "loc-3", label: "вернуться на", bidirectional: true },
                ],
            }
        },
        ownerCharacterIds: ["char-1"],
    };

    // Mock Character
    const character: Character = {
        id: "char-1",
        name: "Tester",
        description: "A test character",
        currentWorldId: "test-world",
        currentLocationId: "loc-1",
        inventory: [],
        lastSessionFile: null,
        lastSessionEntryId: null,
    };

    // Mock Input
    const input: GenerateTurnInput = {
        world,
        character,
        playerMessage: "отправиться на Станцию Днепр",
        history: [],
        locationContext: {
            currentLocation: world.graph["loc-1"],
            knownLocations: [world.graph["loc-2"]],
            lastActionReminder: undefined,
        },
        isInitial: false,
    };

    console.log("Sending prompt:", input.playerMessage);
    console.log("Current Location:", world.graph["loc-1"].locationName);
    console.log("Target Location:", "Станция Днепр (requires multi-hop)");

    try {
        const result = await provider.generateTurn(input);
        console.log("\n--- Result ---");
        console.log("Narration:", result.narration);
        console.log("Player Location:", JSON.stringify(result.playerLocation, null, 2));

    } catch (error) {
        console.error("Error:", error);
    }
}

runTest();
