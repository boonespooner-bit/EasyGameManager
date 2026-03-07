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
            where: { OR: [{ NOT: { isPoolPlayer: true } }, { poolGameId: gameId }] },
            include: { ratings: true },
            orderBy: { battingOrder: "asc" },
          },
        },
      },
      exclusions: { select: { playerId: true } },
      poolPlayers: { select: { id: true, name: true } },
    },
  });

  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  return NextResponse.json(game);
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

  const { isLocked } = await req.json();

  const game = await prisma.game.update({
    where: { id: gameId },
    data: { ...(isLocked !== undefined && { isLocked }) },
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
