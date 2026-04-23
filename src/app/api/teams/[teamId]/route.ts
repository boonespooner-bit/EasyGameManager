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

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        include: { ratings: true },
        orderBy: { battingOrder: "asc" },
      },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      games: { orderBy: { date: "desc" } },
    },
  });

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Filter out pool players in JS (backward-compatible with unmigrated DBs)
  const filtered = {
    ...team,
    players: team.players.filter((p) => !p.isPoolPlayer),
  };

  const rosterIds = filtered.players.map((p) => p.id);
  let gameBallCounts: { playerId: string; count: number }[] = [];
  try {
    const balls = await prisma.gameBall.findMany({
      where: { playerId: { in: rosterIds } },
      select: { playerId: true },
    });
    const countMap: Record<string, number> = {};
    for (const b of balls) countMap[b.playerId] = (countMap[b.playerId] || 0) + 1;
    gameBallCounts = Object.entries(countMap).map(([playerId, count]) => ({ playerId, count }));
  } catch { /* table may not exist */ }

  return NextResponse.json({ ...filtered, gameBallCounts });
}

export async function DELETE(
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
  if (!member || member.role !== "head_coach") {
    return NextResponse.json({ error: "Only the head coach can delete a team" }, { status: 403 });
  }

  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ success: true });
}
