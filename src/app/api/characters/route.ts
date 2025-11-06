import { NextResponse } from "next/server";

import {
  createCharacter,
  getCharacters,
} from "@/lib/repository/characterRepository";
import type { CreateCharacterPayload } from "@/types/game";

export async function GET() {
  const characters = await getCharacters();
  return NextResponse.json(characters);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<CreateCharacterPayload>;

    if (!payload.name || !payload.description) {
      return NextResponse.json(
        { error: "Укажите имя и описание персонажа" },
        { status: 400 },
      );
    }

    const character = await createCharacter({
      name: payload.name,
      description: payload.description,
      currentWorldId:
        payload.currentWorldId === undefined ? null : payload.currentWorldId,
    });

    return NextResponse.json(character, { status: 201 });
  } catch (error) {
    console.error("Ошибка создания персонажа", error);
    return NextResponse.json(
      { error: "Не удалось создать персонажа" },
      { status: 500 },
    );
  }
}

