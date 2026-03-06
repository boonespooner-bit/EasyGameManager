import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        where: { NOT: { isPoolPlayer: true } },
        include: { ratings: true },
        orderBy: { battingOrder: "asc" },
      },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      games: { orderBy: { date: "desc" } },
    },
  });

  return NextResponse.json(team);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role !== "head_coach") {
    return NextResponse.json({ error: "Only the head coach can delete a team" }, { status: 403 });
  }

  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ success: true });
}
