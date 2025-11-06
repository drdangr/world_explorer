import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDataDirectory() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function ensureFileExists(filePath: string, fallback: string) {
  try {
    await fs.access(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await ensureDataDirectory();
      await fs.writeFile(filePath, fallback, "utf8");
    } else {
      throw error;
    }
  }
}

function createDefaultPayload<T>(fallback: T): string {
  return `${JSON.stringify(fallback, null, 2)}\n`;
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = path.join(DATA_DIR, fileName);
  await ensureFileExists(filePath, createDefaultPayload(fallback));

  const fileContent = await fs.readFile(filePath, "utf8");

  try {
    return JSON.parse(fileContent) as T;
  } catch {
    console.warn(`Не удалось распарсить ${fileName}, перезаписываю по умолчанию.`);
    await fs.writeFile(filePath, createDefaultPayload(fallback), "utf8");
    return structuredCloneIfPossible(fallback);
  }
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  const filePath = path.join(DATA_DIR, fileName);
  await ensureDataDirectory();
  await fs.writeFile(filePath, createDefaultPayload(data), "utf8");
}

export async function updateJsonFile<T>(
  fileName: string,
  fallback: T,
  updater: (data: T) => T | Promise<T>,
): Promise<T> {
  const current = await readJsonFile(fileName, fallback);
  const next = await updater(structuredCloneIfPossible(current));
  await writeJsonFile(fileName, next);
  return next;
}

function structuredCloneIfPossible<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

