import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "app-state.json");

async function ensureStateFile() {
    try {
        await fs.access(STATE_FILE);
    } catch {
        const defaultState = {
            currentWorldId: null,
            currentCharacterId: null,
            lastSessionId: null,
        };
        await fs.writeFile(STATE_FILE, JSON.stringify(defaultState, null, 2));
    }
}

export async function GET() {
    try {
        await ensureStateFile();
        const data = await fs.readFile(STATE_FILE, "utf-8");
        return NextResponse.json(JSON.parse(data));
    } catch (error) {
        console.error("Error reading app state:", error);
        return NextResponse.json(
            { error: "Failed to read app state" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        await ensureStateFile();
        const updates = await request.json();

        const currentData = JSON.parse(await fs.readFile(STATE_FILE, "utf-8"));
        const newState = { ...currentData, ...updates };

        await fs.writeFile(STATE_FILE, JSON.stringify(newState, null, 2));

        return NextResponse.json(newState);
    } catch (error) {
        console.error("Error updating app state:", error);
        return NextResponse.json(
            { error: "Failed to update app state" },
            { status: 500 }
        );
    }
}
