import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string; gameId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gameId } = await params;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      innings: {
        include: { player: true },
        orderBy: [{ inning: "asc" }, { position: "asc" }],
      },
      team: {
        include: {
          players: {
            include: { ratings: true },
            orderBy: { battingOrder: "asc" },
          },
        },
      },
    },
  });

  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Query exclusions and pool players separately (tables may not exist in unmigrated DBs)
  let exclusions: { playerId: string }[] = [];
  let poolPlayers: { id: string; name: string }[] = [];
  try {
    exclusions = await prisma.gameExclusion.findMany({
      where: { gameId },
      select: { playerId: true },
    });
  } catch {
    // Table may not exist yet
  }
  try {
    poolPlayers = await prisma.player.findMany({
      where: { poolGameId: gameId },
      select: { id: true, name: true },
    });
  } catch {
    // Column may not exist yet
  }

  // Query per-game batting order (table may not exist in unmigrated DBs)
  let gameBattingOrder: { playerId: string; order: number }[] = [];
  try {
    gameBattingOrder = await prisma.gameBattingOrder.findMany({
      where: { gameId },
      select: { playerId: true, order: true },
    });
  } catch {
    // Table may not exist yet
  }

  // Query game ball (table may not exist in unmigrated DBs)
  let gameBall: { playerId: string; reason: string } | null = null;
  try {
    gameBall = await prisma.gameBall.findUnique({
      where: { gameId },
      select: { playerId: true, reason: true },
    });
  } catch {
    // Table may not exist yet
  }

  // Filter players: roster players + pool players for this game
  const poolPlayerIds = new Set(poolPlayers.map((p) => p.id));
  const filteredPlayers = game.team.players.filter(
    (p) => !p.isPoolPlayer || poolPlayerIds.has(p.id),
  );

  return NextResponse.json({
    ...game,
    team: { ...game.team, players: filteredPlayers },
    exclusions,
    poolPlayers,
    gameBattingOrder,
    gameBall,
  });
}

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

  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.isLocked !== undefined) data.isLocked = body.isLocked;
  if (body.opponent !== undefined) data.opponent = body.opponent;
  if (body.date !== undefined) {
    const d = body.date;
    data.date = new Date(d.includes("T") ? d : d + "T12:00:00");
  }

  const game = await prisma.game.update({
    where: { id: gameId },
    data,
  });

  return NextResponse.json(game);
}

export async function DELETE(
  _req: NextRequest,
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

  await prisma.game.delete({ where: { id: gameId } });
  return NextResponse.json({ success: true });
}
