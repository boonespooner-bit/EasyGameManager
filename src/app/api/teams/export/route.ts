import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

  const userId = (session.user as { id: string }).id;

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        include: {
          ratings: true,
          exclusions: true,
          gameBalls: true,
        },
      },
      games: {
        include: {
          innings: true,
          battingOrders: true,
          exclusions: true,
          gameBalls: true,
        },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    team: {
      name: team.name,
      players: team.players
        .filter((p) => !p.isPoolPlayer)
        .map((p) => ({
          name: p.name,
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber,
          battingOrder: p.battingOrder,
          hasPitched: p.hasPitched,
          ratings: p.ratings.map((r) => ({
            position: r.position,
            rating: r.rating,
          })),
        })),
      games: team.games.map((g) => ({
        opponent: g.opponent,
        date: g.date.toISOString(),
        isLocked: g.isLocked,
        heldPositions: g.heldPositions,
        sandlotRules: g.sandlotRules,
        disabledPositions: g.disabledPositions,
        extraOutfielder: g.extraOutfielder,
        poolPlayers: team.players
          .filter((p) => p.isPoolPlayer && p.poolGameId === g.id)
          .map((p) => ({
            name: p.name,
            firstName: p.firstName,
            lastName: p.lastName,
            jerseyNumber: p.jerseyNumber,
            battingOrder: p.battingOrder,
            ratings: p.ratings.map((r) => ({
              position: r.position,
              rating: r.rating,
            })),
          })),
        assignments: g.innings.map((a) => ({
          playerName: team.players.find((p) => p.id === a.playerId)?.name || "",
          inning: a.inning,
          position: a.position,
        })),
        battingOrders: g.battingOrders.map((bo) => ({
          playerName: team.players.find((p) => p.id === bo.playerId)?.name || "",
          order: bo.order,
        })),
        exclusions: g.exclusions.map((ex) => ({
          playerName: team.players.find((p) => p.id === ex.playerId)?.name || "",
        })),
        gameBalls: g.gameBalls.map((gb) => ({
          playerName: team.players.find((p) => p.id === gb.playerId)?.name || "",
          reason: gb.reason,
        })),
      })),
    },
  };

  const filename = `${team.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
