import { NextResponse } from "next/server";

import {
  createWorld,
  getWorlds,
} from "@/lib/repository/worldRepository";
import type { CreateWorldPayload } from "@/types/game";

export async function GET() {
  const worlds = await getWorlds();
  return NextResponse.json(worlds);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<CreateWorldPayload>;

    if (!payload.setting || !payload.atmosphere || !payload.genre) {
      return NextResponse.json(
        { error: "Укажите сеттинг, атмосферу и жанр" },
        { status: 400 },
      );
    }

    const world = await createWorld({
      name: payload.name ?? "Новый мир",
      setting: payload.setting,
      atmosphere: payload.atmosphere,
      genre: payload.genre,
    });

    return NextResponse.json(world, { status: 201 });
  } catch (error) {
    console.error("Ошибка создания мира", error);
    return NextResponse.json(
      { error: "Не удалось создать мир" },
      { status: 500 },
    );
  }
}

