import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateGamePlan, buildSeasonHistory } from "@/lib/algorithm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const games = await prisma.game.findMany({
    where: { teamId },
    orderBy: { date: "desc" },
    include: { _count: { select: { innings: true } } },
  });

  return NextResponse.json(games);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const { opponent, date } = await req.json();

  // Get players
  const players = await prisma.player.findMany({
    where: { teamId },
    include: { ratings: true },
  });

  if (players.length === 0) {
    return NextResponse.json(
      { error: "Team must have at least one player before creating a game" },
      { status: 400 },
    );
  }

  // Get past games for season history
  const pastGames = await prisma.game.findMany({
    where: { teamId, isLocked: true },
    include: { innings: true },
  });

  const pastAssignments = pastGames.map((g) =>
    g.innings.map((i) => ({ playerId: i.playerId, inning: i.inning, position: i.position })),
  );

  const seasonHistory = buildSeasonHistory(pastAssignments);

  const playersWithRatings = players.map((p) => ({
    id: p.id,
    name: p.name,
    battingOrder: p.battingOrder,
    ratings: p.ratings.map((r) => ({ position: r.position, rating: r.rating })),
  }));

  const assignments = generateGamePlan(playersWithRatings, seasonHistory);

  const game = await prisma.game.create({
    data: {
      teamId,
      opponent,
      date: new Date(date),
      innings: {
        create: assignments.map((a) => ({
          playerId: a.playerId,
          inning: a.inning,
          position: a.position,
        })),
      },
    },
    include: { innings: { include: { player: true } } },
  });

  return NextResponse.json(game, { status: 201 });
}
