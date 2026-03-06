import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const teams = await prisma.team.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: { include: { user: { select: { name: true, email: true } } } },
      players: true,
      _count: { select: { games: true } },
    },
  });

  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { name } = await req.json();

  const team = await prisma.team.create({
    data: {
      name,
      members: {
        create: { userId, role: "head_coach" },
      },
    },
  });

  return NextResponse.json(team, { status: 201 });
}
