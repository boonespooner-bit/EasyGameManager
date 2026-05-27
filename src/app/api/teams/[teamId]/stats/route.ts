import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  const players = await prisma.player.findMany({
    where: { teamId, isPoolPlayer: false },
    orderBy: { battingOrder: "asc" },
    select: { id: true, name: true, firstName: true, lastName: true, jerseyNumber: true },
  });

  const games = await prisma.game.findMany({
    where: { teamId, isLocked: true },
    include: { innings: { select: { playerId: true, position: true, inning: true } } },
    orderBy: { date: "asc" },
  });

  const playerStats: Record<string, Record<string, number>> = {};
  for (const p of players) playerStats[p.id] = {};
  for (const g of games) {
    for (const i of g.innings) {
      if (!playerStats[i.playerId]) continue;
      playerStats[i.playerId][i.position] = (playerStats[i.playerId][i.position] || 0) + 1;
    }
  }

  return NextResponse.json({
    players,
    gameCount: games.length,
    stats: playerStats,
  });
}
