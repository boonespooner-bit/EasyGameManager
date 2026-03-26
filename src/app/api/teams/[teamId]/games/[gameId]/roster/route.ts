import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateGamePlan, buildSeasonHistory } from "@/lib/algorithm";

export async function POST(
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
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.isLocked) return NextResponse.json({ error: "Game is locked" }, { status: 400 });

  const body = await req.json() as {
    action: "exclude" | "include";
    playerId: string;
  };
  const { action, playerId } = body;

  if (action === "exclude") {
    // Add exclusion
    try {
      await prisma.gameExclusion.create({
        data: { gameId, playerId },
      });
    } catch {
      // Already excluded or table doesn't exist
    }
  } else if (action === "include") {
    // Remove exclusion
    try {
      await prisma.gameExclusion.deleteMany({
        where: { gameId, playerId },
      });
    } catch {
      // Not excluded or table doesn't exist
    }
  }

  // Regenerate the game plan with updated roster
  const allPlayers = await prisma.player.findMany({
    where: { teamId },
    include: { ratings: true },
  });
  const rosterPlayers = allPlayers.filter((p) => !p.isPoolPlayer);

  let exclusions: { playerId: string }[] = [];
  let poolPlayers: typeof rosterPlayers = [];
  try {
    exclusions = await prisma.gameExclusion.findMany({
      where: { gameId },
      select: { playerId: true },
    });
  } catch { /* table may not exist */ }
  try {
    poolPlayers = await prisma.player.findMany({
      where: { poolGameId: gameId },
      include: { ratings: true },
    });
  } catch { /* column may not exist */ }

  const excludedIds = new Set(exclusions.map((e) => e.playerId));
  const availablePlayers = rosterPlayers.filter((p) => !excludedIds.has(p.id));
  const gamePlayers = [...availablePlayers, ...poolPlayers];

  // Get season history
  const lockedGames = await prisma.game.findMany({
    where: { teamId, isLocked: true },
    include: { innings: true },
  });
  const pastAssignments = lockedGames.map((g) =>
    g.innings.map((i) => ({ playerId: i.playerId, inning: i.inning, position: i.position })),
  );
  const seasonHistory = buildSeasonHistory(pastAssignments);

  const playersWithRatings = gamePlayers.map((p) => ({
    id: p.id,
    name: p.name,
    battingOrder: p.battingOrder,
    ratings: p.ratings.map((r) => ({ position: r.position, rating: r.rating })),
  }));

  const newAssignments = generateGamePlan(playersWithRatings, seasonHistory);

  // Save new assignments and clear held positions (roster changed, holds are stale)
  await prisma.inningAssignment.deleteMany({ where: { gameId } });
  await prisma.inningAssignment.createMany({
    data: newAssignments.map((a) => ({
      gameId,
      playerId: a.playerId,
      inning: a.inning,
      position: a.position,
    })),
  });

  // Clear held positions since roster changed
  await prisma.game.update({
    where: { id: gameId },
    data: { heldPositions: [] },
  });

  return NextResponse.json({ success: true });
}
