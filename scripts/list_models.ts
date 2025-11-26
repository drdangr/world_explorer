
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("GEMINI_API_KEY not found in .env.local");
    process.exit(1);
}

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error("Error fetching models:", data);
            return;
        }

        console.log("Available Models:");
        if (data.models) {
            data.models.forEach((model: any) => {
                console.log(`- ${model.name} (${model.displayName})`);
                console.log(`  Supported methods: ${model.supportedGenerationMethods.join(", ")}`);
            });
        } else {
            console.log("No models found in response.");
        }

    } catch (error) {
        console.error("Network error:", error);
    }
}

listModels();
