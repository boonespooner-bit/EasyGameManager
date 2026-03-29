import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateGamePlan, buildSeasonHistory } from "@/lib/algorithm";

type RosterAction =
  | { action: "exclude"; playerId: string }
  | { action: "include"; playerId: string }
  | { action: "addPool"; name: string; ratings: Record<string, number> }
  | { action: "removePool"; playerId: string };

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

  const body = await req.json() as RosterAction;

  if (body.action === "exclude") {
    try {
      await prisma.gameExclusion.create({
        data: { gameId, playerId: body.playerId },
      });
    } catch {
      // Already excluded or table doesn't exist
    }
  } else if (body.action === "include") {
    try {
      await prisma.gameExclusion.deleteMany({
        where: { gameId, playerId: body.playerId },
      });
    } catch {
      // Not excluded or table doesn't exist
    }
  } else if (body.action === "addPool") {
    // Create a new pool player linked to this game
    const allPlayers = await prisma.player.findMany({
      where: { teamId },
      select: { battingOrder: true },
    });
    const maxOrder = allPlayers.length > 0
      ? Math.max(...allPlayers.map((p) => p.battingOrder))
      : 0;

    await prisma.player.create({
      data: {
        name: body.name,
        teamId,
        battingOrder: maxOrder + 1,
        isPoolPlayer: true,
        poolGameId: gameId,
        ratings: {
          create: Object.entries(body.ratings).map(([position, rating]) => ({
            position,
            rating: rating as number,
          })),
        },
      },
    });
  } else if (body.action === "removePool") {
    // Delete pool player and their assignments
    await prisma.inningAssignment.deleteMany({
      where: { gameId, playerId: body.playerId },
    });
    await prisma.player.delete({
      where: { id: body.playerId },
    });
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

  await prisma.game.update({
    where: { id: gameId },
    data: { heldPositions: [] },
  });

  return NextResponse.json({ success: true });
}
