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

  const { opponent, date, excludedPlayerIds = [], poolPlayers = [] } = await req.json();

  // Get roster players (non-pool players)
  const allPlayersRaw = await prisma.player.findMany({
    where: { teamId },
    include: { ratings: true },
  });
  const allPlayers = allPlayersRaw.filter((p) => !p.isPoolPlayer);

  // Filter out excluded players
  const excludedSet = new Set(excludedPlayerIds as string[]);
  const availablePlayers = allPlayers.filter((p) => !excludedSet.has(p.id));

  // Create pool players for this game
  const createdPoolPlayers: typeof allPlayers = [];
  for (const pp of poolPlayers as { name: string; ratings: Record<string, number> }[]) {
    const maxOrder = allPlayers.length > 0
      ? Math.max(...allPlayers.map((p) => p.battingOrder))
      : 0;

    const poolPlayer = await prisma.player.create({
      data: {
        name: pp.name,
        teamId,
        battingOrder: maxOrder + 1 + createdPoolPlayers.length,
        isPoolPlayer: true,
        ratings: {
          create: Object.entries(pp.ratings).map(([position, rating]) => ({
            position,
            rating: rating as number,
          })),
        },
      },
      include: { ratings: true },
    });
    createdPoolPlayers.push(poolPlayer);
  }

  const gamePlayers = [...availablePlayers, ...createdPoolPlayers];

  // Get past games for season history
  const pastGames = await prisma.game.findMany({
    where: { teamId, isLocked: true },
    include: { innings: true },
  });

  const pastAssignments = pastGames.map((g) =>
    g.innings.map((i) => ({ playerId: i.playerId, inning: i.inning, position: i.position })),
  );

  const seasonHistory = buildSeasonHistory(pastAssignments);

  const playersWithRatings = gamePlayers.map((p) => ({
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

  // Create exclusions and link pool players (safe if tables/columns don't exist yet)
  try {
    if ((excludedPlayerIds as string[]).length > 0) {
      await prisma.gameExclusion.createMany({
        data: (excludedPlayerIds as string[]).map((playerId: string) => ({
          gameId: game.id,
          playerId,
        })),
      });
    }
    if (createdPoolPlayers.length > 0) {
      await prisma.player.updateMany({
        where: { id: { in: createdPoolPlayers.map((p) => p.id) } },
        data: { poolGameId: game.id },
      });
    }
  } catch {
    // Migration may not have been applied yet
  }

  return NextResponse.json(game, { status: 201 });
}
