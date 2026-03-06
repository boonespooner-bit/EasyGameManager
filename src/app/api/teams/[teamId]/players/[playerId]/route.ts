import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; playerId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId, playerId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const { name, battingOrder, ratings } = await req.json();

  const player = await prisma.player.update({
    where: { id: playerId },
    data: {
      ...(name !== undefined && { name }),
      ...(battingOrder !== undefined && { battingOrder }),
    },
  });

  if (ratings) {
    for (const [position, rating] of Object.entries(ratings)) {
      await prisma.playerRating.upsert({
        where: { playerId_position: { playerId, position } },
        update: { rating: rating as number },
        create: { playerId, position, rating: rating as number },
      });
    }
  }

  const updated = await prisma.player.findUnique({
    where: { id: playerId },
    include: { ratings: true },
  });

  // Regenerate future (unlocked) games when player data changes
  await regenerateFutureGames(teamId);

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string; playerId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId, playerId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role === "viewer") {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  await prisma.player.delete({ where: { id: playerId } });
  return NextResponse.json({ success: true });
}

async function regenerateFutureGames(teamId: string) {
  const { generateGamePlan, buildSeasonHistory } = await import("@/lib/algorithm");

  const futureGames = await prisma.game.findMany({
    where: { teamId, isLocked: false },
    orderBy: { date: "asc" },
    include: { innings: true },
  });

  const lockedGames = await prisma.game.findMany({
    where: { teamId, isLocked: true },
    include: { innings: true },
  });

  const players = await prisma.player.findMany({
    where: { teamId },
    include: { ratings: true },
  });

  if (players.length !== 12) return;

  const pastAssignments = lockedGames.map((g) =>
    g.innings.map((i) => ({ playerId: i.playerId, inning: i.inning, position: i.position })),
  );

  let cumulativeHistory = pastAssignments;

  for (const game of futureGames) {
    const seasonHistory = buildSeasonHistory(cumulativeHistory);
    const playersWithRatings = players.map((p) => ({
      id: p.id,
      name: p.name,
      battingOrder: p.battingOrder,
      ratings: p.ratings.map((r) => ({ position: r.position, rating: r.rating })),
    }));

    const newAssignments = generateGamePlan(playersWithRatings, seasonHistory);

    await prisma.inningAssignment.deleteMany({ where: { gameId: game.id } });
    await prisma.inningAssignment.createMany({
      data: newAssignments.map((a) => ({
        gameId: game.id,
        playerId: a.playerId,
        inning: a.inning,
        position: a.position,
      })),
    });

    cumulativeHistory = [
      ...cumulativeHistory,
      newAssignments.map((a) => ({ playerId: a.playerId, inning: a.inning, position: a.position })),
    ];
  }
}
