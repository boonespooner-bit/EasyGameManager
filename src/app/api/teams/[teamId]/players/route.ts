import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POSITIONS } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const players = await prisma.player.findMany({
    where: { teamId, NOT: { isPoolPlayer: true } },
    orderBy: { battingOrder: "asc" },
    select: { id: true, name: true, battingOrder: true },
  });

  return NextResponse.json(players);
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

  const { name, battingOrder, ratings } = await req.json();

  const player = await prisma.player.create({
    data: {
      name,
      battingOrder,
      teamId,
      ratings: {
        create: POSITIONS.map((pos) => ({
          position: pos,
          rating: ratings?.[pos] ?? 5,
        })),
      },
    },
    include: { ratings: true },
  });

  return NextResponse.json(player, { status: 201 });
}

export async function PUT(
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

  const { order } = await req.json() as { order: { playerId: string; battingOrder: number }[] };

  await Promise.all(
    order.map((item) =>
      prisma.player.update({
        where: { id: item.playerId },
        data: { battingOrder: item.battingOrder },
      }),
    ),
  );

  return NextResponse.json({ success: true });
}
