import { NextResponse } from "next/server";

import {
  deleteCharacter,
  getCharacterById,
  updateCharacter,
} from "@/lib/repository/characterRepository";
import type { UpdateCharacterPayload } from "@/types/game";

interface RouteParams {
  params: {
    characterId: string;
  };
}

export async function GET(_: Request, { params }: RouteParams) {
  const character = await getCharacterById(params.characterId);

  if (!character) {
    return NextResponse.json({ error: "Персонаж не найден" }, { status: 404 });
  }

  return NextResponse.json(character);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const payload = (await request.json()) as Partial<UpdateCharacterPayload>;
    const character = await updateCharacter(params.characterId, payload);

    if (!character) {
      return NextResponse.json({ error: "Персонаж не найден" }, { status: 404 });
    }

    return NextResponse.json(character);
  } catch (error) {
    console.error("Ошибка обновления персонажа", error);
    return NextResponse.json(
      { error: "Не удалось обновить персонажа" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const deleted = await deleteCharacter(params.characterId);

  if (!deleted) {
    return NextResponse.json({ error: "Персонаж не найден" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

