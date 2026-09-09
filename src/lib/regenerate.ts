import { prisma } from "@/lib/prisma";
import { generateGamePlan, buildSeasonHistory } from "@/lib/algorithm";

// Regenerate the lineup for every unlocked game on the team.
// Called after any roster mutation (add/edit/delete) so unlocked games reflect
// the current roster. Locked games are untouched. Respects each game's sandlot
// settings and per-game roster exclusions/pool players.
export async function regenerateFutureGames(teamId: string) {
  const futureGames = await prisma.game.findMany({
    where: { teamId, isLocked: false },
    orderBy: { date: "asc" },
    include: { innings: true },
  });

  const lockedGames = await prisma.game.findMany({
    where: { teamId, isLocked: true },
    include: { innings: true },
  });

  const allPlayers = await prisma.player.findMany({
    where: { teamId },
    include: { ratings: true },
  });
  const rosterPlayers = allPlayers.filter((p) => !p.isPoolPlayer);

  if (rosterPlayers.length === 0) return;

  const pastAssignments = lockedGames.map((g) =>
    g.innings.map((i) => ({ playerId: i.playerId, inning: i.inning, position: i.position })),
  );

  let cumulativeHistory = pastAssignments;

  for (const game of futureGames) {
    let exclusions: { playerId: string }[] = [];
    let gamePoolPlayers: typeof rosterPlayers = [];
    try {
      exclusions = await prisma.gameExclusion.findMany({
        where: { gameId: game.id },
        select: { playerId: true },
      });
    } catch { /* table may not exist */ }
    try {
      gamePoolPlayers = await prisma.player.findMany({
        where: { poolGameId: game.id },
        include: { ratings: true },
      });
    } catch { /* column may not exist */ }

    const excludedIds = new Set(exclusions.map((e) => e.playerId));
    const availablePlayers = rosterPlayers.filter((p) => !excludedIds.has(p.id));
    const gamePlayers = [...availablePlayers, ...gamePoolPlayers];

    const seasonHistory = buildSeasonHistory(cumulativeHistory);
    const playersWithRatings = gamePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      battingOrder: p.battingOrder,
      ratings: p.ratings.map((r) => ({ position: r.position, rating: r.rating })),
    }));

    const gameWithSandlot = game as unknown as {
      sandlotRules?: boolean;
      extraOutfielder?: boolean;
      disabledPositions?: string[] | null;
    };
    const sandlotOn = !!gameWithSandlot.sandlotRules;

    const newAssignments = generateGamePlan(
      playersWithRatings,
      seasonHistory,
      undefined,
      undefined,
      undefined,
      {
        disabledPositions: sandlotOn ? (gameWithSandlot.disabledPositions ?? []) : [],
        extraOutfielder: sandlotOn ? !!gameWithSandlot.extraOutfielder : false,
      },
    );

    await prisma.inningAssignment.deleteMany({ where: { gameId: game.id } });
    await prisma.inningAssignment.createMany({
      data: newAssignments.map((a) => ({
        gameId: game.id,
        playerId: a.playerId,
        inning: a.inning,
        position: a.position,
      })),
    });

    // Also clear held positions — roster change invalidates them
    try {
      await prisma.game.update({
        where: { id: game.id },
        data: { heldPositions: [] },
      });
    } catch { /* ignore */ }

    cumulativeHistory = [
      ...cumulativeHistory,
      newAssignments.map((a) => ({ playerId: a.playerId, inning: a.inning, position: a.position })),
    ];
  }
}
