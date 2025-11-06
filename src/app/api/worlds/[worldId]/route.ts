import { NextResponse } from "next/server";

import {
  deleteWorld,
  getWorldById,
  updateWorld,
} from "@/lib/repository/worldRepository";
import type { UpdateWorldPayload } from "@/types/game";

interface RouteParams {
  params: {
    worldId: string;
  };
}

export async function GET(_: Request, { params }: RouteParams) {
  const world = await getWorldById(params.worldId);

  if (!world) {
    return NextResponse.json({ error: "Мир не найден" }, { status: 404 });
  }

  return NextResponse.json(world);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const payload = (await request.json()) as Partial<UpdateWorldPayload>;
    const world = await updateWorld(params.worldId, payload);

    if (!world) {
      return NextResponse.json({ error: "Мир не найден" }, { status: 404 });
    }

    return NextResponse.json(world);
  } catch (error) {
    console.error("Ошибка обновления мира", error);
    return NextResponse.json(
      { error: "Не удалось обновить мир" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const deleted = await deleteWorld(params.worldId);

  if (!deleted) {
    return NextResponse.json({ error: "Мир не найден" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

