import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateExportData, buildImportPlan } from "@/lib/teamData";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id: string }).id;

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!validateExportData(data)) {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  }

  const plan = buildImportPlan(data);

  const team = await prisma.team.create({
    data: {
      name: plan.teamName,
      members: {
        create: { userId, role: "head_coach" },
      },
    },
  });

  const playerIdMap: Record<string, string> = {};

  for (const p of plan.players) {
    const player = await prisma.player.create({
      data: {
        name: p.name,
        firstName: p.firstName,
        lastName: p.lastName,
        jerseyNumber: p.jerseyNumber,
        battingOrder: p.battingOrder,
        hasPitched: p.hasPitched,
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

  for (const g of plan.games) {
    const game = await prisma.game.create({
      data: {
        teamId: team.id,
        opponent: g.opponent,
        date: g.date,
        isLocked: g.isLocked,
        heldPositions: g.heldPositions as undefined,
        sandlotRules: g.sandlotRules,
        disabledPositions: g.disabledPositions as undefined,
        extraOutfielder: g.extraOutfielder,
      },
    });

    for (const pp of g.poolPlayers) {
      const poolPlayer = await prisma.player.create({
        data: {
          name: pp.name,
          firstName: pp.firstName,
          lastName: pp.lastName,
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
