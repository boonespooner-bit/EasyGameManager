import { POSITIONS, INNINGS, type PlayerWithRatings, type GameAssignment, type SeasonHistory, type Position } from "@/types";

const POSITION_PRIORITY: Position[] = ["SS", "3B", "2B", "1B", "CF", "LF", "RF"];

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

  const assignments: GameAssignment[] = [];
  const gamePositionCounts: Record<string, Record<string, number>> = {};
  players.forEach((p) => {
    gamePositionCounts[p.id] = {};
  });

  // Pre-assign who is benched each inning (if more than 9 players)
  let benchSchedule: Map<number, string[]> = new Map();
  for (const inning of INNINGS) {
    benchSchedule.set(inning, []);
  }

  if (numPlayers > numPositions) {
    const benchPerInning = numPlayers - numPositions;
    benchSchedule = assignBenchScheduleFlexible(players, historyMap, benchPerInning);
  }

  // Add bench assignments
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
  }

  // Build active players per inning
  const activeByInning = new Map<number, PlayerWithRatings[]>();
  for (const inning of INNINGS) {
    const benchedIds = benchSchedule.get(inning) || [];
    activeByInning.set(inning, players.filter((p) => !benchedIds.includes(p.id)));
  }

  // Phase 1: Pre-plan pitching schedule across all innings
  // Rule: A pitcher can pitch 1 inning or 2 consecutive innings, max 2
  const pitchingSchedule = planPitchingSchedule(players, activeByInning, historyMap);

  // Phase 2: Pre-plan catching schedule across all innings
  // Preference: catchers should catch 2 consecutive innings when possible
  const catchingSchedule = planCatchingSchedule(players, activeByInning, pitchingSchedule, historyMap);

  // Phase 3: Assign remaining positions inning by inning
  // Lock in pitcher and catcher assignments first
  const lockedAssignments = new Map<number, Map<string, string>>(); // inning -> playerId -> position
  for (const inning of INNINGS) {
    lockedAssignments.set(inning, new Map());
  }

  for (const { playerId, inning } of pitchingSchedule) {
    lockedAssignments.get(inning)!.set(playerId, "P");
  }
  for (const { playerId, inning } of catchingSchedule) {
    lockedAssignments.get(inning)!.set(playerId, "C");
  }

  // Now assign remaining field positions for each inning
  for (const inning of INNINGS) {
    const active = activeByInning.get(inning) || [];
    const locked = lockedAssignments.get(inning)!;

    // Add locked (pitcher/catcher) assignments
    for (const [playerId, position] of locked) {
      const player = players.find((p) => p.id === playerId)!;
      assignments.push({
        playerId: player.id,
        playerName: player.name,
        inning,
        position: position as Position,
      });
      gamePositionCounts[player.id][position] = (gamePositionCounts[player.id][position] || 0) + 1;
    }

    // Assign remaining positions to remaining active players
    const assignedPlayers = new Set(locked.keys());
    const importance = inningImportance(inning);

    for (const position of POSITION_PRIORITY) {
      let bestScore = -Infinity;
      let bestPlayer: PlayerWithRatings | null = null;

      for (const player of active) {
        if (assignedPlayers.has(player.id)) continue;

        const rating = player.ratings.find((r) => r.position === position)?.rating ?? 1;
        const history = historyMap.get(player.id);

        let score = rating * importance;

        const seasonCount = history?.positionCounts[position] ?? 0;
        const gameCount = gamePositionCounts[player.id][position] ?? 0;
        score -= seasonCount * 0.3;
        score -= gameCount * 3;

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
        gamePositionCounts[bestPlayer.id][position] = (gamePositionCounts[bestPlayer.id][position] || 0) + 1;
      }
    }
  }

  return assignments;
}

/**
 * Plan pitching across 6 innings.
 * Rules:
 * - Each pitcher pitches 1 or 2 innings
 * - If 2 innings, they must be consecutive
 * - Try to use 3 pitchers x 2 innings for ideal coverage
 */
function planPitchingSchedule(
  players: PlayerWithRatings[],
  activeByInning: Map<number, PlayerWithRatings[]>,
  historyMap: Map<string, SeasonHistory>,
): { playerId: string; inning: number }[] {
  const schedule: { playerId: string; inning: number }[] = [];
  const innings = [...INNINGS]; // [1,2,3,4,5,6]
  const usedPitchers = new Set<string>();

  // Score each player for pitching
  const pitchScores = players.map((p) => {
    const rating = p.ratings.find((r) => r.position === "P")?.rating ?? 1;
    const history = historyMap.get(p.id);
    let score = rating;
    // Bonus for players who haven't pitched this season
    if (history && !history.hasPitched) score += 2;
    return { player: p, score };
  }).sort((a, b) => b.score - a.score);

  // Greedily fill innings in consecutive blocks of 2, then 1
  let i = 0;
  while (i < innings.length) {
    const inning = innings[i];
    const nextInning = i + 1 < innings.length ? innings[i + 1] : null;

    // Find best available pitcher who is active in these innings
    let assigned = false;

    // Try to assign a 2-inning block first
    if (nextInning !== null) {
      for (const { player } of pitchScores) {
        if (usedPitchers.has(player.id)) continue;
        const activeInCurrent = (activeByInning.get(inning) || []).some((p) => p.id === player.id);
        const activeInNext = (activeByInning.get(nextInning) || []).some((p) => p.id === player.id);
        if (activeInCurrent && activeInNext) {
          schedule.push({ playerId: player.id, inning });
          schedule.push({ playerId: player.id, inning: nextInning });
          usedPitchers.add(player.id);
          i += 2;
          assigned = true;
          break;
        }
      }
    }

    // Fall back to 1-inning assignment
    if (!assigned) {
      for (const { player } of pitchScores) {
        if (usedPitchers.has(player.id)) continue;
        const activeInCurrent = (activeByInning.get(inning) || []).some((p) => p.id === player.id);
        if (activeInCurrent) {
          schedule.push({ playerId: player.id, inning });
          usedPitchers.add(player.id);
          i += 1;
          assigned = true;
          break;
        }
      }
    }

    // If no pitcher available at all, skip this inning
    if (!assigned) {
      i += 1;
    }
  }

  return schedule;
}

/**
 * Plan catching across 6 innings.
 * Preference: catchers should catch 2 consecutive innings when possible.
 * Catchers cannot be the same player assigned to pitch that inning.
 */
function planCatchingSchedule(
  players: PlayerWithRatings[],
  activeByInning: Map<number, PlayerWithRatings[]>,
  pitchingSchedule: { playerId: string; inning: number }[],
  historyMap: Map<string, SeasonHistory>,
): { playerId: string; inning: number }[] {
  const schedule: { playerId: string; inning: number }[] = [];
  const innings = [...INNINGS];
  const pitcherByInning = new Map<number, string>();
  for (const p of pitchingSchedule) {
    pitcherByInning.set(p.inning, p.playerId);
  }

  const usedCatchers = new Set<string>();

  // Score each player for catching
  const catchScores = players.map((p) => {
    const rating = p.ratings.find((r) => r.position === "C")?.rating ?? 1;
    const history = historyMap.get(p.id);
    const seasonCount = history?.positionCounts["C"] ?? 0;
    return { player: p, score: rating - seasonCount * 0.3 };
  }).sort((a, b) => b.score - a.score);

  let i = 0;
  while (i < innings.length) {
    const inning = innings[i];
    const nextInning = i + 1 < innings.length ? innings[i + 1] : null;

    let assigned = false;

    // Try 2 consecutive innings first (preferred)
    if (nextInning !== null) {
      for (const { player } of catchScores) {
        if (usedCatchers.has(player.id)) continue;
        if (pitcherByInning.get(inning) === player.id) continue;
        if (pitcherByInning.get(nextInning) === player.id) continue;
        const activeInCurrent = (activeByInning.get(inning) || []).some((p) => p.id === player.id);
        const activeInNext = (activeByInning.get(nextInning) || []).some((p) => p.id === player.id);
        if (activeInCurrent && activeInNext) {
          schedule.push({ playerId: player.id, inning });
          schedule.push({ playerId: player.id, inning: nextInning });
          usedCatchers.add(player.id);
          i += 2;
          assigned = true;
          break;
        }
      }
    }

    // Fall back to 1-inning assignment
    if (!assigned) {
      for (const { player } of catchScores) {
        if (usedCatchers.has(player.id)) continue;
        if (pitcherByInning.get(inning) === player.id) continue;
        const activeInCurrent = (activeByInning.get(inning) || []).some((p) => p.id === player.id);
        if (activeInCurrent) {
          schedule.push({ playerId: player.id, inning });
          usedCatchers.add(player.id);
          i += 1;
          assigned = true;
          break;
        }
      }
    }

    if (!assigned) {
      i += 1;
    }
  }

  return schedule;
}

function assignBenchScheduleFlexible(
  players: PlayerWithRatings[],
  historyMap: Map<string, SeasonHistory>,
  benchPerInning: number,
): Map<number, string[]> {
  const totalBenchSlots = benchPerInning * INNINGS.length;

  const sorted = [...players].sort((a, b) => {
    const aBench = historyMap.get(a.id)?.totalBenchInnings ?? 0;
    const bBench = historyMap.get(b.id)?.totalBenchInnings ?? 0;
    return aBench - bBench;
  });

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
