import { POSITIONS, INNINGS, type PlayerWithRatings, type GameAssignment, type SeasonHistory, type Position } from "@/types";

const POSITION_PRIORITY: Position[] = ["P", "C", "SS", "3B", "2B", "1B", "CF", "LF", "RF"];

// Innings 1-2 and 5-6 face the best hitters; innings 3-4 face the weakest
function inningImportance(inning: number): number {
  if (inning <= 2 || inning >= 5) return 1.5;
  return 0.8;
}

export function generateGamePlan(
  players: PlayerWithRatings[],
  seasonHistory: SeasonHistory[],
): GameAssignment[] {
  if (players.length === 0) {
    return [];
  }

  const historyMap = new Map(seasonHistory.map((h) => [h.playerId, h]));
  const numPlayers = players.length;
  const numPositions = POSITIONS.length; // 9

  // Step 1: Determine bench schedule
  // Only assign bench if we have more than 9 players (more players than positions)
  const assignments: GameAssignment[] = [];
  const gamePositionCounts: Record<string, Record<string, number>> = {};
  players.forEach((p) => {
    gamePositionCounts[p.id] = {};
  });

  if (numPlayers > numPositions) {
    // We have extra players that need to bench each inning
    const benchPerInning = numPlayers - numPositions;
    const benchSchedule = assignBenchScheduleFlexible(players, historyMap, benchPerInning);

    for (const inning of INNINGS) {
      const benchedPlayerIds = benchSchedule.get(inning) || [];

      for (const playerId of benchedPlayerIds) {
        const player = players.find((p) => p.id === playerId)!;
        assignments.push({
          playerId: player.id,
          playerName: player.name,
          inning,
          position: "BENCH",
        });
      }

      const activePlayers = players.filter((p) => !benchedPlayerIds.includes(p.id));
      const inningAssignments = assignPositions(activePlayers, inning, historyMap, gamePositionCounts);

      for (const a of inningAssignments) {
        assignments.push(a);
        const pos = a.position;
        if (pos !== "BENCH") {
          gamePositionCounts[a.playerId][pos] = (gamePositionCounts[a.playerId][pos] || 0) + 1;
        }
      }
    }
  } else {
    // 9 or fewer players: everyone plays every inning, no bench
    for (const inning of INNINGS) {
      const inningAssignments = assignPositions(players, inning, historyMap, gamePositionCounts);

      for (const a of inningAssignments) {
        assignments.push(a);
        const pos = a.position;
        if (pos !== "BENCH") {
          gamePositionCounts[a.playerId][pos] = (gamePositionCounts[a.playerId][pos] || 0) + 1;
        }
      }
    }
  }

  return assignments;
}

function assignBenchScheduleFlexible(
  players: PlayerWithRatings[],
  historyMap: Map<string, SeasonHistory>,
  benchPerInning: number,
): Map<number, string[]> {
  // Total bench slots across all innings
  const totalBenchSlots = benchPerInning * INNINGS.length;

  // Sort players by total bench innings in season (those who sat less should sit more)
  const sorted = [...players].sort((a, b) => {
    const aBench = historyMap.get(a.id)?.totalBenchInnings ?? 0;
    const bBench = historyMap.get(b.id)?.totalBenchInnings ?? 0;
    return aBench - bBench;
  });

  // Distribute bench innings fairly: each player gets floor or ceil of average
  const avgBench = totalBenchSlots / players.length;
  const baseBench = Math.floor(avgBench);
  let extraSlots = totalBenchSlots - baseBench * players.length;

  const allBenchPlayers = sorted.map((p) => {
    const target = baseBench + (extraSlots > 0 ? 1 : 0);
    if (extraSlots > 0) extraSlots--;
    return { id: p.id, target };
  });

  const benchSlots: Map<number, string[]> = new Map();
  for (const inning of INNINGS) {
    benchSlots.set(inning, []);
  }

  const playerAvgRating = new Map<string, number>();
  for (const p of players) {
    const avg = p.ratings.length > 0
      ? p.ratings.reduce((s, r) => s + r.rating, 0) / p.ratings.length
      : 5;
    playerAvgRating.set(p.id, avg);
  }

  const playerBenchCount: Record<string, number> = {};
  allBenchPlayers.forEach((p) => {
    playerBenchCount[p.id] = 0;
  });

  // Assign bench slots: prefer benching weaker players in important innings
  const inningOrder = [1, 2, 5, 6, 3, 4];
  for (const inning of inningOrder) {
    const slots = benchSlots.get(inning)!;
    while (slots.length < benchPerInning) {
      const eligible = allBenchPlayers
        .filter((p) => playerBenchCount[p.id] < p.target)
        .filter((p) => !slots.includes(p.id))
        .sort((a, b) => {
          const importance = inningImportance(inning);
          const aRating = playerAvgRating.get(a.id) || 5;
          const bRating = playerAvgRating.get(b.id) || 5;
          if (importance > 1) {
            return aRating - bRating;
          }
          return bRating - aRating;
        });

      if (eligible.length === 0) break;
      const chosen = eligible[0];
      slots.push(chosen.id);
      playerBenchCount[chosen.id]++;
    }
  }

  return benchSlots;
}

function assignPositions(
  activePlayers: PlayerWithRatings[],
  inning: number,
  historyMap: Map<string, SeasonHistory>,
  gamePositionCounts: Record<string, Record<string, number>>,
): GameAssignment[] {
  const assignments: GameAssignment[] = [];
  const assignedPlayers = new Set<string>();
  const assignedPositions = new Set<string>();
  const importance = inningImportance(inning);

  // For each position (in priority order), find best available player
  for (const position of POSITION_PRIORITY) {
    let bestScore = -Infinity;
    let bestPlayer: PlayerWithRatings | null = null;

    for (const player of activePlayers) {
      if (assignedPlayers.has(player.id)) continue;

      const rating = player.ratings.find((r) => r.position === position)?.rating ?? 1;
      const history = historyMap.get(player.id);

      // Base score from rating
      let score = rating * importance;

      // Variety bonus: prefer positions the player hasn't played much
      const seasonCount = history?.positionCounts[position] ?? 0;
      const gameCount = gamePositionCounts[player.id][position] ?? 0;
      score -= seasonCount * 0.3;
      score -= gameCount * 3; // strongly discourage same position in same game

      // Pitching bonus: if player hasn't pitched this season and this is pitching
      if (position === "P" && history && !history.hasPitched) {
        score += 2;
      }

      // For less important innings, slightly prefer weaker players at key positions
      // This gives them a chance to play those positions
      if (importance < 1 && rating < 5) {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPlayer = player;
      }
    }

    if (bestPlayer) {
      assignments.push({
        playerId: bestPlayer.id,
        playerName: bestPlayer.name,
        inning,
        position,
      });
      assignedPlayers.add(bestPlayer.id);
      assignedPositions.add(position);
    }
  }

  return assignments;
}

export function buildSeasonHistory(
  pastGames: { playerId: string; inning: number; position: string }[][],
): SeasonHistory[] {
  const historyMap = new Map<string, SeasonHistory>();

  for (const gameAssignments of pastGames) {
    for (const a of gameAssignments) {
      if (!historyMap.has(a.playerId)) {
        historyMap.set(a.playerId, {
          playerId: a.playerId,
          positionCounts: {},
          totalBenchInnings: 0,
          hasPitched: false,
        });
      }
      const h = historyMap.get(a.playerId)!;
      if (a.position === "BENCH") {
        h.totalBenchInnings++;
      } else {
        h.positionCounts[a.position] = (h.positionCounts[a.position] || 0) + 1;
        if (a.position === "P") h.hasPitched = true;
      }
    }
  }

  return Array.from(historyMap.values());
}
