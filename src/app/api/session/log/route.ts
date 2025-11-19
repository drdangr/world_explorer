import { NextResponse } from "next/server";

import { getCharacterById } from "@/lib/repository/characterRepository";
import { findLatestSessionFile, readSessionLog } from "@/lib/repository/sessionRepository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get("characterId");
  const worldId = searchParams.get("worldId");
  const sessionId = searchParams.get("sessionId"); // Optional: specific session file name

  if (!characterId || !worldId) {
    return NextResponse.json({ error: "Требуются characterId и worldId" }, { status: 400 });
  }

  const character = await getCharacterById(characterId);

  if (!character) {
    return NextResponse.json({ error: "Персонаж не найден" }, { status: 404 });
  }

  // If sessionId is provided, try to load that specific file
  if (sessionId) {
    const log = await readSessionLog(sessionId);
    if (log && log.worldId === worldId && log.characterId === characterId) {
      return NextResponse.json({ file: sessionId, entries: log.entries });
    }
    // If specified session not found or mismatch, fall through to default behavior (or could error)
    // For now, let's return empty if specific session fails, to avoid confusion
    return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }

  // Default behavior: find latest
  const candidateFiles = [character.lastSessionFile, await findLatestSessionFile(characterId, worldId)].filter(
    (file): file is string => Boolean(file),
  );

  for (const file of candidateFiles) {
    const log = await readSessionLog(file);
    if (log && log.worldId === worldId && log.characterId === characterId) {
      return NextResponse.json({ file, entries: log.entries });
    }
  }

  return NextResponse.json({ file: null, entries: [] });
}

