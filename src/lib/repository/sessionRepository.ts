import { promises as fs } from "node:fs";
import path from "node:path";

import type { CharacterId, SessionEntry, SessionLog, WorldId } from "@/types/game";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");

function buildSessionFileName(
  characterId: CharacterId,
  worldId: WorldId,
  startedAt: string,
): string {
  const normalizedTimestamp = startedAt.replace(/[-:.]/g, "").replace(/Z$/, "");
  return `session__${characterId}__${worldId}__${normalizedTimestamp}.json`;
}

async function ensureSessionsDirectory() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

export async function writeSessionLog(fileName: string, log: SessionLog): Promise<void> {
  await ensureSessionsDirectory();
  const filePath = path.join(SESSIONS_DIR, fileName);
  await fs.writeFile(`${filePath}`, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

export async function readSessionLog(fileName: string): Promise<SessionLog | null> {
  try {
    const filePath = path.join(SESSIONS_DIR, fileName);
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as SessionLog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function appendSessionEntries(
  fileName: string,
  log: SessionLog,
  entries: SessionEntry[],
): Promise<SessionLog> {
  const merged: SessionLog = {
    ...log,
    entries: [...log.entries, ...entries],
  };

  await writeSessionLog(fileName, merged);
  return merged;
}

export async function createSessionLog(
  characterId: CharacterId,
  worldId: WorldId,
  startedAt: string,
  entries: SessionEntry[] = [],
): Promise<{ fileName: string; log: SessionLog }> {
  const fileName = buildSessionFileName(characterId, worldId, startedAt);
  const log: SessionLog = {
    worldId,
    characterId,
    startedAt,
    entries,
  };

  await writeSessionLog(fileName, log);
  return { fileName, log };
}

export async function listSessionFiles(): Promise<string[]> {
  try {
    await ensureSessionsDirectory();
    return await fs.readdir(SESSIONS_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

interface SessionFileMeta {
  fileName: string;
  characterId: CharacterId;
  worldId: WorldId;
  startedAt: string;
}

function parseSessionFileName(fileName: string): SessionFileMeta | null {
  const match = fileName.match(/^session__(.+?)__(.+?)__(.+)\.json$/);
  if (!match) {
    return null;
  }

  const [, characterId, worldId, timestamp] = match;

  // Normalize timestamp - remove any remaining separators
  const normalized = timestamp.replace(/[-:.]/g, "");

  // Reconstruct ISO 8601 from compressed format: 20251119T103000000 -> 2025-01-19T10:30:00.000Z
  let startedAt = timestamp;
  if (normalized.length >= 15) {
    const year = normalized.slice(0, 4);
    const month = normalized.slice(4, 6);
    const day = normalized.slice(6, 8);
    const hour = normalized.slice(9, 11);
    const minute = normalized.slice(11, 13);
    const second = normalized.slice(13, 15);
    const ms = normalized.slice(15, 18) || "000";

    startedAt = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
  }

  return {
    fileName,
    characterId,
    worldId,
    startedAt,
  };
}

export async function findLatestSessionFile(
  characterId: CharacterId,
  worldId: WorldId,
): Promise<string | null> {
  const files = await listSessionFiles();

  const candidates = files
    .map(parseSessionFileName)
    .filter((meta): meta is SessionFileMeta => Boolean(meta))
    .filter((meta) => meta.characterId === characterId && meta.worldId === worldId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return candidates.at(0)?.fileName ?? null;
}

export async function sessionFileExists(fileName: string): Promise<boolean> {
  try {
    const filePath = path.join(SESSIONS_DIR, fileName);
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export { SESSIONS_DIR, buildSessionFileName, parseSessionFileName };

