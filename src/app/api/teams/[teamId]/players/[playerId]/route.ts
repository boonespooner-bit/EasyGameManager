import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateFutureGames } from "@/lib/regenerate";

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

  const { firstName, lastName, jerseyNumber, battingOrder, ratings } = await req.json();

  const nameData: Record<string, unknown> = {};
  if (firstName !== undefined) {
    nameData.firstName = firstName;
    nameData.lastName = lastName ?? "";
    nameData.name = `${firstName} ${lastName ?? ""}`.trim();
  }
  if (jerseyNumber !== undefined) nameData.jerseyNumber = jerseyNumber || null;

  const player = await prisma.player.update({
    where: { id: playerId },
    data: {
      ...nameData,
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

export async function PATCH(
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

  const { hasPitched } = await req.json();
  const player = await prisma.player.update({
    where: { id: playerId },
    data: { hasPitched },
  });
  return NextResponse.json(player);
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

  // Rebuild every unlocked game so the departing player's spots are filled
  await regenerateFutureGames(teamId);

  return NextResponse.json({ success: true });
}
