import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; gameId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId, gameId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (game?.isLocked) {
    return NextResponse.json({ error: "Game is locked" }, { status: 400 });
  }

  const { order } = await req.json() as { order: { playerId: string; order: number }[] };

  // Delete existing and recreate
  await prisma.gameBattingOrder.deleteMany({ where: { gameId } });
  await prisma.gameBattingOrder.createMany({
    data: order.map((o) => ({
      gameId,
      playerId: o.playerId,
      order: o.order,
    })),
  });

  return NextResponse.json({ success: true });
}
