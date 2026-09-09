import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwner } from "@/lib/admin";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isOwner(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      teamMembers: {
        select: {
          role: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  const teams = await prisma.team.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: {
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      players: {
        where: { isPoolPlayer: false },
        select: { id: true },
      },
      games: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          opponent: true,
          date: true,
          isLocked: true,
          _count: { select: { innings: true } },
        },
      },
    },
  });

  const shapedUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt.toISOString(),
    teams: u.teamMembers.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      role: m.role,
    })),
  }));

  const shapedTeams = teams.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt.toISOString(),
    playerCount: t.players.length,
    members: t.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
    games: t.games.map((g) => ({
      id: g.id,
      opponent: g.opponent,
      date: g.date.toISOString(),
      isLocked: g.isLocked,
      inningCount: g._count.innings,
    })),
  }));

  return NextResponse.json({
    users: shapedUsers,
    teams: shapedTeams,
    stats: {
      totalUsers: shapedUsers.length,
      totalTeams: shapedTeams.length,
      totalGames: shapedTeams.reduce((s, t) => s + t.games.length, 0),
      lockedGames: shapedTeams.reduce(
        (s, t) => s + t.games.filter((g) => g.isLocked).length,
        0,
      ),
    },
  });
}
