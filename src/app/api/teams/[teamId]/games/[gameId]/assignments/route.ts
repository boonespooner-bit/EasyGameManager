import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Update assignments (drag-and-drop swap)
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

  const { assignments } = await req.json();
  // assignments: Array<{ playerId, inning, position }>

  // Delete existing and recreate
  await prisma.inningAssignment.deleteMany({ where: { gameId } });
  await prisma.inningAssignment.createMany({
    data: assignments.map((a: { playerId: string; inning: number; position: string }) => ({
      gameId,
      playerId: a.playerId,
      inning: a.inning,
      position: a.position,
    })),
  });

  const updated = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      innings: {
        include: { player: true },
        orderBy: [{ inning: "asc" }, { position: "asc" }],
      },
    },
  });

  return NextResponse.json(updated);
}
