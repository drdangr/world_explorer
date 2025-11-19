import { NextResponse } from "next/server";

import { listSessionFiles, parseSessionFileName, readSessionLog } from "@/lib/repository/sessionRepository";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get("characterId");
    const worldId = searchParams.get("worldId");

    if (!characterId || !worldId) {
        return NextResponse.json({ error: "Требуются characterId и worldId" }, { status: 400 });
    }

    try {
        const files = await listSessionFiles();

        const sessionMetas = files
            .map(parseSessionFileName)
            .filter((meta): meta is NonNullable<ReturnType<typeof parseSessionFileName>> => Boolean(meta))
            .filter((meta) => meta.characterId === characterId && meta.worldId === worldId);

        // Load session logs to get entry count and last message
        const sessionsWithData = await Promise.all(
            sessionMetas.map(async (meta) => {
                try {
                    const log = await readSessionLog(meta.fileName);
                    const entryCount = log?.entries.length ?? 0;
                    const lastEntry = log?.entries.at(-1);

                    let lastMessage = "";
                    if (lastEntry && lastEntry.message) {
                        lastMessage = lastEntry.message.slice(0, 150);
                        if (lastMessage.length >= 150) {
                            lastMessage += "...";
                        }
                    }

                    return {
                        ...meta,
                        entryCount,
                        lastMessage,
                    };
                } catch (error) {
                    console.error(`Error reading session ${meta.fileName}:`, error);
                    return {
                        ...meta,
                        entryCount: 0,
                        lastMessage: "",
                    };
                }
            })
        );

        // Sort by date, newest first
        sessionsWithData.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

        return NextResponse.json(sessionsWithData);
    } catch (error) {
        console.error("Error listing sessions:", error);
        return NextResponse.json({ error: "Ошибка при получении списка сессий" }, { status: 500 });
    }
}
