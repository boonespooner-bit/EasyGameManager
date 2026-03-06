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
  if (players.length !== 12) {
    throw new Error("Exactly 12 players are required");
  }

  const historyMap = new Map(seasonHistory.map((h) => [h.playerId, h]));

  // Step 1: Determine bench schedule
  // 6 innings × 3 bench spots = 18 bench-innings
  // 12 players: 6 sit 2 innings, 6 sit 1 inning
  const benchSchedule = assignBenchSchedule(players, historyMap);

  // Step 2: For each inning, assign active players to positions
  const assignments: GameAssignment[] = [];
  const gamePositionCounts: Record<string, Record<string, number>> = {};
  players.forEach((p) => {
    gamePositionCounts[p.id] = {};
  });

  for (const inning of INNINGS) {
    const benchedPlayerIds = benchSchedule.get(inning) || [];

    // Add bench assignments
    for (const playerId of benchedPlayerIds) {
      const player = players.find((p) => p.id === playerId)!;
      assignments.push({
        playerId: player.id,
        playerName: player.name,
        inning,
        position: "BENCH",
      });
    }

    // Active players for this inning
    const activePlayers = players.filter((p) => !benchedPlayerIds.includes(p.id));

    // Assign positions using scoring
    const inningAssignments = assignPositions(
      activePlayers,
      inning,
      historyMap,
      gamePositionCounts,
    );

    for (const a of inningAssignments) {
      assignments.push(a);
      const pos = a.position;
      if (pos !== "BENCH") {
        gamePositionCounts[a.playerId][pos] = (gamePositionCounts[a.playerId][pos] || 0) + 1;
      }
    }
  }

  return assignments;
}

function assignBenchSchedule(
  players: PlayerWithRatings[],
  historyMap: Map<string, SeasonHistory>,
): Map<number, string[]> {
  // Sort players by total bench innings in season (most bench time first = sit less this game)
  const sorted = [...players].sort((a, b) => {
    const aHist = historyMap.get(a.id);
    const bHist = historyMap.get(b.id);
    const aBench = aHist?.totalBenchInnings ?? 0;
    const bBench = bHist?.totalBenchInnings ?? 0;
    return aBench - bBench; // those who sat less should sit more this game
  });

  // First 6 players (least bench time) sit 2 innings, next 6 sit 1 inning
  const sitTwo = sorted.slice(0, 6).map((p) => p.id);
  const sitOne = sorted.slice(6).map((p) => p.id);

  // Distribute across innings
  // Try to avoid benching best players in important innings (1,2,5,6)
  const benchSlots: Map<number, string[]> = new Map();
  for (const inning of INNINGS) {
    benchSlots.set(inning, []);
  }

  const playerBenchCount: Record<string, number> = {};
  const allBenchPlayers = [
    ...sitTwo.map((id) => ({ id, target: 2 })),
    ...sitOne.map((id) => ({ id, target: 1 })),
  ];

  // Sort so weaker overall players bench during important innings
  const playerAvgRating = new Map<string, number>();
  for (const p of players) {
    const avg = p.ratings.length > 0
      ? p.ratings.reduce((s, r) => s + r.rating, 0) / p.ratings.length
      : 5;
    playerAvgRating.set(p.id, avg);
  }

  allBenchPlayers.forEach((p) => {
    playerBenchCount[p.id] = 0;
  });

  // Assign bench slots: prefer benching weaker players in important innings
  const inningOrder = [1, 2, 5, 6, 3, 4]; // important innings first
  for (const inning of inningOrder) {
    const slots = benchSlots.get(inning)!;
    while (slots.length < 3) {
      // Find eligible player (hasn't reached target bench count)
      const eligible = allBenchPlayers
        .filter((p) => playerBenchCount[p.id] < p.target)
        .filter((p) => !slots.includes(p.id))
        .sort((a, b) => {
          // In important innings, bench weaker players first
          const importance = inningImportance(inning);
          const aRating = playerAvgRating.get(a.id) || 5;
          const bRating = playerAvgRating.get(b.id) || 5;
          if (importance > 1) {
            return aRating - bRating; // weaker first for important innings
          }
          return bRating - aRating; // stronger first for easy innings (save them)
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
