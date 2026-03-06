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
      players: { include: { ratings: true }, orderBy: { battingOrder: "asc" } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      games: { orderBy: { date: "desc" } },
    },
  });

  return NextResponse.json(team);
}
