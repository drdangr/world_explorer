import { NextResponse } from "next/server";

import {
  deleteWorld,
  getWorldById,
  updateWorld,
} from "@/lib/repository/worldRepository";
import type { UpdateWorldPayload } from "@/types/game";

interface RouteParams {
  params: Promise<{
    worldId: string;
  }>;
}

export async function GET(_: Request, { params }: RouteParams) {
  const { worldId } = await params;
  const world = await getWorldById(worldId);

  if (!world) {
    return NextResponse.json({ error: "Мир не найден" }, { status: 404 });
  }

  return NextResponse.json(world);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { worldId } = await params;
    const payload = (await request.json()) as Partial<UpdateWorldPayload>;
    const world = await updateWorld(worldId, payload);

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
  const { worldId } = await params;
  const deleted = await deleteWorld(worldId);

  if (!deleted) {
    return NextResponse.json({ error: "Мир не найден" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

