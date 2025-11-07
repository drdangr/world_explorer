import { NextResponse } from "next/server";

import { getCharacterById } from "@/lib/repository/characterRepository";
import { findLatestSessionFile, readSessionLog } from "@/lib/repository/sessionRepository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get("characterId");
  const worldId = searchParams.get("worldId");

  if (!characterId || !worldId) {
    return NextResponse.json({ error: "Требуются characterId и worldId" }, { status: 400 });
  }

  const character = await getCharacterById(characterId);

  if (!character) {
    return NextResponse.json({ error: "Персонаж не найден" }, { status: 404 });
  }

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

