import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const { id, playerId, reason } = body;

  if (!playerId || !reason) {
    return NextResponse.json({ error: "playerId and reason are required" }, { status: 400 });
  }

  if (id) {
    // Update existing game ball
    const gameBall = await prisma.gameBall.update({
      where: { id },
      data: { playerId, reason },
    });
    return NextResponse.json(gameBall);
  }

  // Creating new - check max 2 per game
  const count = await prisma.gameBall.count({ where: { gameId } });
  if (count >= 2) {
    return NextResponse.json({ error: "Maximum 2 game balls per game" }, { status: 400 });
  }

  const gameBall = await prisma.gameBall.create({
    data: { gameId, playerId, reason },
  });

  return NextResponse.json(gameBall);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; gameId: string }> },
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

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  try {
    await prisma.gameBall.delete({ where: { id } });
  } catch {
    // No game ball to delete
  }

  return NextResponse.json({ success: true });
}
