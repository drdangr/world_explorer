import { promises as fs } from "node:fs";
import path from "node:path";
import { sanitizeFilename } from "../src/lib/utils/filename";

const DATA_DIR = path.join(process.cwd(), "data");
const WORLDS_FILE = path.join(DATA_DIR, "worlds.json");
const WORLDS_DIR = path.join(DATA_DIR, "worlds");

async function migrate() {
    console.log("Starting migration...");

    try {
        await fs.access(WORLDS_FILE);
    } catch {
        console.log("No worlds.json found, skipping migration.");
        return;
    }

    const content = await fs.readFile(WORLDS_FILE, "utf8");
    const data = JSON.parse(content);

    if (!data.worlds || !Array.isArray(data.worlds)) {
        console.error("Invalid worlds.json format");
        return;
    }

    await fs.mkdir(WORLDS_DIR, { recursive: true });

    for (const world of data.worlds) {
        const safeName = sanitizeFilename(world.name);
        const fileName = `${safeName}_${world.id}.json`;
        const filePath = path.join(WORLDS_DIR, fileName);

        await fs.writeFile(filePath, JSON.stringify(world, null, 2), "utf8");
        console.log(`Migrated world "${world.name}" to ${fileName}`);
    }

    const backupPath = `${WORLDS_FILE}.bak`;
    await fs.rename(WORLDS_FILE, backupPath);
    console.log(`Renamed worlds.json to ${backupPath}`);
    console.log("Migration complete.");
}

migrate().catch(console.error);
