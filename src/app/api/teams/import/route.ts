import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ExportedRating {
  position: string;
  rating: number;
}

interface ExportedPlayer {
  name: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  battingOrder: number;
  hasPitched?: boolean;
  ratings: ExportedRating[];
}

interface ExportedGame {
  opponent: string;
  date: string;
  isLocked: boolean;
  heldPositions: unknown;
  sandlotRules: boolean;
  disabledPositions: unknown;
  extraOutfielder: boolean;
  poolPlayers: ExportedPlayer[];
  assignments: { playerName: string; inning: number; position: string }[];
  battingOrders: { playerName: string; order: number }[];
  exclusions: { playerName: string }[];
  gameBalls: { playerName: string; reason: string }[];
}

interface ExportData {
  version: number;
  team: {
    name: string;
    players: ExportedPlayer[];
    games: ExportedGame[];
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  let data: ExportData;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!data.version || !data.team?.name || !Array.isArray(data.team.players)) {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      name: data.team.name,
      members: {
        create: { userId, role: "head_coach" },
      },
    },
  });

  const playerIdMap: Record<string, string> = {};

  for (const p of data.team.players) {
    const player = await prisma.player.create({
      data: {
        name: p.name,
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        jerseyNumber: p.jerseyNumber,
        battingOrder: p.battingOrder,
        hasPitched: p.hasPitched ?? false,
        teamId: team.id,
        ratings: {
          create: p.ratings.map((r) => ({
            position: r.position,
            rating: r.rating,
          })),
        },
      },
    });
    playerIdMap[p.name] = player.id;
  }

  for (const g of data.team.games) {
    const game = await prisma.game.create({
      data: {
        teamId: team.id,
        opponent: g.opponent,
        date: new Date(g.date),
        isLocked: g.isLocked,
        heldPositions: g.heldPositions as undefined,
        sandlotRules: g.sandlotRules,
        disabledPositions: g.disabledPositions as undefined,
        extraOutfielder: g.extraOutfielder,
      },
    });

    if (g.poolPlayers?.length) {
      for (const pp of g.poolPlayers) {
        const poolPlayer = await prisma.player.create({
          data: {
            name: pp.name,
            firstName: pp.firstName || "",
            lastName: pp.lastName || "",
            jerseyNumber: pp.jerseyNumber,
            battingOrder: pp.battingOrder,
            teamId: team.id,
            isPoolPlayer: true,
            poolGameId: game.id,
            ratings: {
              create: pp.ratings.map((r) => ({
                position: r.position,
                rating: r.rating,
              })),
            },
          },
        });
        playerIdMap[pp.name] = poolPlayer.id;
      }
    }

    const assignmentData = g.assignments
      .filter((a) => playerIdMap[a.playerName])
      .map((a) => ({
        gameId: game.id,
        playerId: playerIdMap[a.playerName],
        inning: a.inning,
        position: a.position,
      }));

    if (assignmentData.length) {
      await prisma.inningAssignment.createMany({ data: assignmentData });
    }

    const battingOrderData = g.battingOrders
      .filter((bo) => playerIdMap[bo.playerName])
      .map((bo) => ({
        gameId: game.id,
        playerId: playerIdMap[bo.playerName],
        order: bo.order,
      }));

    if (battingOrderData.length) {
      await prisma.gameBattingOrder.createMany({ data: battingOrderData });
    }

    const exclusionData = g.exclusions
      .filter((ex) => playerIdMap[ex.playerName])
      .map((ex) => ({
        gameId: game.id,
        playerId: playerIdMap[ex.playerName],
      }));

    if (exclusionData.length) {
      await prisma.gameExclusion.createMany({ data: exclusionData });
    }

    const gameBallData = g.gameBalls
      .filter((gb) => playerIdMap[gb.playerName])
      .map((gb) => ({
        gameId: game.id,
        playerId: playerIdMap[gb.playerName],
        reason: gb.reason,
      }));

    if (gameBallData.length) {
      await prisma.gameBall.createMany({ data: gameBallData });
    }
  }

  return NextResponse.json({ teamId: team.id, name: team.name }, { status: 201 });
}
