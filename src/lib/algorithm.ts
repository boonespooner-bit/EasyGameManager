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
  lockedPitchers?: { playerId: string; inning: number }[],
  lockedPositions?: { playerId: string; inning: number; position: string }[],
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

  // Build locked positions map: inning -> Map<playerId, position>
  const allLockedByInning = new Map<number, Map<string, string>>();
  for (const inning of INNINGS) {
    allLockedByInning.set(inning, new Map());
  }
  if (lockedPositions && lockedPositions.length > 0) {
    for (const lp of lockedPositions) {
      allLockedByInning.get(lp.inning)?.set(lp.playerId, lp.position);
    }
  }

  // Build set of locked player+inning combos so bench scheduler avoids them
  const lockedPlayerInnings = new Map<number, Set<string>>(); // inning -> Set of playerIds
  for (const inning of INNINGS) {
    const playerIds = new Set<string>();
    const locked = allLockedByInning.get(inning)!;
    for (const playerId of locked.keys()) {
      playerIds.add(playerId);
    }
    lockedPlayerInnings.set(inning, playerIds);
  }

  // Also include locked pitchers in the locked set
  const lockedPitcherInnings = new Map<number, string>(); // inning -> playerId
  if (lockedPitchers && lockedPitchers.length > 0) {
    for (const lp of lockedPitchers) {
      lockedPitcherInnings.set(lp.inning, lp.playerId);
      lockedPlayerInnings.get(lp.inning)?.add(lp.playerId);
    }
  }

  // Pre-assign who is benched each inning (if more than 9 players)
  let benchSchedule: Map<number, string[]> = new Map();
  for (const inning of INNINGS) {
    benchSchedule.set(inning, []);
  }

  // Check for locked BENCH positions
  const lockedBenchByInning = new Map<number, string[]>();
  for (const inning of INNINGS) {
    lockedBenchByInning.set(inning, []);
  }
  if (lockedPositions) {
    for (const lp of lockedPositions) {
      if (lp.position === "BENCH") {
        lockedBenchByInning.get(lp.inning)?.push(lp.playerId);
      }
    }
  }

  // Players who started on bench last game cannot start on bench this game
  const previousGameBenchStarters = new Set<string>();
  for (const [, history] of historyMap) {
    if (history.startedOnBenchLastGame) {
      previousGameBenchStarters.add(history.playerId);
    }
  }

  if (numPlayers > numPositions) {
    const benchPerInning = numPlayers - numPositions;
    benchSchedule = assignBenchScheduleFlexible(
      players, historyMap, benchPerInning, lockedPitcherInnings,
      lockedPlayerInnings, lockedBenchByInning, previousGameBenchStarters,
    );
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

  // Extract locked pitcher positions from lockedPositions
  const lockedPitcherPositions = lockedPositions
    ?.filter((lp) => lp.position === "P")
    .map((lp) => ({ playerId: lp.playerId, inning: lp.inning })) || [];

  // Merge lockedPitchers (from pitching mode) with locked P positions (from general holds)
  const allLockedPitchers = [...(lockedPitchers || [])];
  for (const lp of lockedPitcherPositions) {
    if (!allLockedPitchers.some((p) => p.inning === lp.inning)) {
      allLockedPitchers.push(lp);
    }
  }

  // Phase 1: Use locked pitchers if any, otherwise auto-plan
  const pitchingSchedule = allLockedPitchers.length > 0
    ? allLockedPitchers
    : planPitchingSchedule(players, activeByInning, historyMap);

  // Extract locked catcher positions
  const lockedCatcherPositions = lockedPositions
    ?.filter((lp) => lp.position === "C")
    .map((lp) => ({ playerId: lp.playerId, inning: lp.inning })) || [];

  // Phase 2: Pre-plan catching schedule across all innings
  const catchingSchedule = planCatchingSchedule(
    players, activeByInning, pitchingSchedule, historyMap, lockedCatcherPositions,
  );

  // Phase 3: Assign remaining positions inning by inning
  // Lock in pitcher and catcher assignments first
  const phaseLockedAssignments = new Map<number, Map<string, string>>(); // inning -> playerId -> position
  for (const inning of INNINGS) {
    phaseLockedAssignments.set(inning, new Map());
  }

  for (const { playerId, inning } of pitchingSchedule) {
    phaseLockedAssignments.get(inning)!.set(playerId, "P");
  }
  for (const { playerId, inning } of catchingSchedule) {
    phaseLockedAssignments.get(inning)!.set(playerId, "C");
  }

  // Also add any other locked field positions (non-P, non-C, non-BENCH)
  if (lockedPositions) {
    for (const lp of lockedPositions) {
      if (lp.position !== "P" && lp.position !== "C" && lp.position !== "BENCH") {
        phaseLockedAssignments.get(lp.inning)?.set(lp.playerId, lp.position);
      }
    }
  }

  // Now assign remaining field positions for each inning
  for (const inning of INNINGS) {
    const active = activeByInning.get(inning) || [];
    const locked = phaseLockedAssignments.get(inning)!;

    // Add locked assignments
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

    // Collect positions already filled by locked assignments
    const assignedPlayers = new Set(locked.keys());
    const filledPositions = new Set(locked.values());
    const importance = inningImportance(inning);

    // Sort positions by number of eligible (non-DNP) players — most constrained first.
    // This prevents a greedy assignment from "stealing" the only eligible player
    // for a more constrained position.
    const unfilledPositions = POSITION_PRIORITY.filter((p) => !filledPositions.has(p));
    const sortedPositions = [...unfilledPositions].sort((posA, posB) => {
      const eligibleA = active.filter((p) =>
        !assignedPlayers.has(p.id) &&
        (p.ratings.find((r) => r.position === posA)?.rating ?? 1) !== 0,
      ).length;
      const eligibleB = active.filter((p) =>
        !assignedPlayers.has(p.id) &&
        (p.ratings.find((r) => r.position === posB)?.rating ?? 1) !== 0,
      ).length;
      return eligibleA - eligibleB;
    });

    // Fill positions with best available players (most constrained positions first)
    for (const position of sortedPositions) {
      let bestScore = -Infinity;
      let bestPlayer: PlayerWithRatings | null = null;

      for (const player of active) {
        if (assignedPlayers.has(player.id)) continue;

        const rating = player.ratings.find((r) => r.position === position)?.rating ?? 1;
        // DNP: rating 0 means player should never play this position
        if (rating === 0) continue;
        const history = historyMap.get(player.id);

        let score = rating * importance;

        // Strongly penalize placing players in positions they're very weak at
        if (rating <= 2) score -= 8;
        else if (rating <= 3) score -= 3;

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
        filledPositions.add(position);
        gamePositionCounts[bestPlayer.id][position] = (gamePositionCounts[bestPlayer.id][position] || 0) + 1;
      }
    }

    // Post-assignment: resolve any DNP violations via swaps.
    // If any player ended up at a DNP position (via last-resort), try swapping
    // them with a player at another position who CAN play both positions.
    const inningAssignments = assignments.filter((a) => a.inning === inning && a.position !== "BENCH");
    for (const assignment of inningAssignments) {
      const rating = players.find((p) => p.id === assignment.playerId)
        ?.ratings.find((r) => r.position === assignment.position)?.rating ?? 1;
      if (rating !== 0) continue; // No DNP violation

      // This player has DNP for their assigned position — try to swap
      for (const other of inningAssignments) {
        if (other.playerId === assignment.playerId) continue;
        const otherPlayer = players.find((p) => p.id === other.playerId);
        const thisPlayer = players.find((p) => p.id === assignment.playerId);
        if (!otherPlayer || !thisPlayer) continue;

        // Check: can otherPlayer play assignment.position (non-DNP)?
        const otherRatingForThisPos = otherPlayer.ratings.find((r) => r.position === assignment.position)?.rating ?? 1;
        if (otherRatingForThisPos === 0) continue;

        // Check: can thisPlayer play other.position (non-DNP)?
        const thisRatingForOtherPos = thisPlayer.ratings.find((r) => r.position === other.position)?.rating ?? 1;
        if (thisRatingForOtherPos === 0) continue;

        // Swap positions
        const tempPos = assignment.position;
        assignment.position = other.position;
        other.position = tempPos;
        break;
      }
    }

    // Safety: assign any remaining unassigned active players to unfilled positions
    // Respect DNP — skip positions where the player has rating 0
    const allPositions: (Position | "BENCH")[] = ["P", "C", ...POSITION_PRIORITY];
    for (const player of active) {
      if (assignedPlayers.has(player.id)) continue;
      for (const position of allPositions) {
        if (filledPositions.has(position)) continue;
        const rating = player.ratings.find((r) => r.position === position)?.rating ?? 1;
        if (rating === 0) continue; // Respect DNP
        assignments.push({
          playerId: player.id,
          playerName: player.name,
          inning,
          position: position as Position,
        });
        assignedPlayers.add(player.id);
        filledPositions.add(position);
        gamePositionCounts[player.id][position] = (gamePositionCounts[player.id][position] || 0) + 1;
        break;
      }
    }

    // Absolute last resort: if positions are STILL unfilled (all remaining players
    // have DNP for all remaining positions), override DNP to avoid blank spots
    for (const player of active) {
      if (assignedPlayers.has(player.id)) continue;
      for (const position of allPositions) {
        if (filledPositions.has(position)) continue;
        assignments.push({
          playerId: player.id,
          playerName: player.name,
          inning,
          position: position as Position,
        });
        assignedPlayers.add(player.id);
        filledPositions.add(position);
        gamePositionCounts[player.id][position] = (gamePositionCounts[player.id][position] || 0) + 1;
        break;
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

  // Score each player for pitching (exclude DNP players with rating 0)
  const pitchScores = players
    .filter((p) => (p.ratings.find((r) => r.position === "P")?.rating ?? 1) !== 0)
    .map((p) => {
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

    // Fallback: if all pitchers are DNP, pick any active player not yet used as pitcher
    if (!assigned) {
      const active = activeByInning.get(inning) || [];
      for (const player of active) {
        if (usedPitchers.has(player.id)) continue;
        schedule.push({ playerId: player.id, inning });
        usedPitchers.add(player.id);
        i += 1;
        assigned = true;
        break;
      }
    }

    // If truly no one available, advance
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
  lockedCatchers: { playerId: string; inning: number }[] = [],
): { playerId: string; inning: number }[] {
  const schedule: { playerId: string; inning: number }[] = [];
  const innings = [...INNINGS];
  const pitcherByInning = new Map<number, string>();
  for (const p of pitchingSchedule) {
    pitcherByInning.set(p.inning, p.playerId);
  }

  // Pre-fill locked catchers
  const lockedCatcherInnings = new Set<number>();
  const usedCatchers = new Set<string>();
  for (const lc of lockedCatchers) {
    schedule.push({ playerId: lc.playerId, inning: lc.inning });
    lockedCatcherInnings.add(lc.inning);
    usedCatchers.add(lc.playerId);
  }

  // Score each player for catching (exclude DNP players with rating 0)
  const catchScores = players
    .filter((p) => (p.ratings.find((r) => r.position === "C")?.rating ?? 1) !== 0)
    .map((p) => {
      const rating = p.ratings.find((r) => r.position === "C")?.rating ?? 1;
      const history = historyMap.get(p.id);
      const seasonCount = history?.positionCounts["C"] ?? 0;
      return { player: p, score: rating - seasonCount * 0.3 };
    }).sort((a, b) => b.score - a.score);

  let i = 0;
  while (i < innings.length) {
    const inning = innings[i];

    // Skip innings that have locked catchers
    if (lockedCatcherInnings.has(inning)) {
      i += 1;
      continue;
    }

    const nextInning = i + 1 < innings.length ? innings[i + 1] : null;
    const nextIsLocked = nextInning !== null && lockedCatcherInnings.has(nextInning);

    let assigned = false;

    // Try 2 consecutive innings first (preferred), only if next isn't locked
    if (nextInning !== null && !nextIsLocked) {
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

    // Fallback: if all catchers are DNP, pick any active non-pitcher player
    if (!assigned) {
      const active = activeByInning.get(inning) || [];
      for (const player of active) {
        if (usedCatchers.has(player.id)) continue;
        if (pitcherByInning.get(inning) === player.id) continue;
        schedule.push({ playerId: player.id, inning });
        usedCatchers.add(player.id);
        i += 1;
        assigned = true;
        break;
      }
    }

    // If truly no one available, advance
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
  lockedPitcherInnings: Map<number, string> = new Map(),
  lockedPlayerInnings: Map<number, Set<string>> = new Map(),
  lockedBenchByInning: Map<number, string[]> = new Map(),
  previousGameBenchStarters: Set<string> = new Set(),
): Map<number, string[]> {
  const totalBenchSlots = benchPerInning * INNINGS.length;

  // Calculate average rating for each player (used for bench priority)
  const playerAvgRating = new Map<string, number>();
  for (const p of players) {
    const avg = p.ratings.length > 0
      ? p.ratings.reduce((s, r) => s + r.rating, 0) / p.ratings.length
      : 5;
    playerAvgRating.set(p.id, avg);
  }

  // Sort by rating ascending: lowest-rated players should sit more
  // Break ties by season bench history (fewer benched = bench more)
  const sorted = [...players].sort((a, b) => {
    const aRating = playerAvgRating.get(a.id) || 5;
    const bRating = playerAvgRating.get(b.id) || 5;
    if (aRating !== bRating) return aRating - bRating; // lower rating first
    const aBench = historyMap.get(a.id)?.totalBenchInnings ?? 0;
    const bBench = historyMap.get(b.id)?.totalBenchInnings ?? 0;
    return aBench - bBench; // fewer season benches = bench more this game
  });

  // Assign bench targets based on rating:
  // - Lowest-rated players sit 2x (max), highest-rated sit 1x (min, if slots require it)
  // - sorted is already ordered low→high by rating
  // - No player sits more than 2 innings per game
  const maxBench = 2;
  let remaining = totalBenchSlots;
  const targetMap = new Map<string, number>();

  // Figure out minimum everyone must sit:
  // If totalBenchSlots >= numPlayers, everyone must sit at least 1
  const numPlayers = players.length;
  const guaranteedMin = totalBenchSlots >= numPlayers ? 1 : 0;

  // Initialize: if everyone must sit, give each player 1 first
  for (const p of sorted) {
    const base = Math.min(guaranteedMin, remaining);
    targetMap.set(p.id, base);
    remaining -= base;
  }

  // Distribute remaining slots to lowest-rated players first, up to maxBench
  for (const p of sorted) {
    if (remaining <= 0) break;
    const current = targetMap.get(p.id)!;
    const give = Math.min(maxBench - current, remaining);
    if (give > 0) {
      targetMap.set(p.id, current + give);
      remaining -= give;
    }
  }

  const allBenchPlayers = sorted.map((p) => ({
    id: p.id,
    target: targetMap.get(p.id) || 0,
  }));

  const benchSlots: Map<number, string[]> = new Map();
  for (const inning of INNINGS) {
    benchSlots.set(inning, []);
  }

  const playerBenchCount: Record<string, number> = {};
  allBenchPlayers.forEach((p) => {
    playerBenchCount[p.id] = 0;
  });

  // Pre-fill locked bench assignments
  for (const inning of INNINGS) {
    const lockedBench = lockedBenchByInning.get(inning) || [];
    const slots = benchSlots.get(inning)!;
    for (const playerId of lockedBench) {
      if (!slots.includes(playerId)) {
        slots.push(playerId);
        playerBenchCount[playerId] = (playerBenchCount[playerId] || 0) + 1;
      }
    }
  }

  // Assign bench in sequential inning order so we can enforce the
  // "no consecutive bench innings" rule
  for (const inning of INNINGS) {
    const slots = benchSlots.get(inning)!;
    const lockedInThisInning = lockedPlayerInnings.get(inning) || new Set<string>();

    while (slots.length < benchPerInning) {
      const prevBenched = inning > 1 ? (benchSlots.get(inning - 1) || []) : [];

      const eligible = allBenchPlayers
        .filter((p) => playerBenchCount[p.id] < p.target)
        .filter((p) => !slots.includes(p.id))
        // No consecutive bench innings: skip players benched in the previous inning
        .filter((p) => !prevBenched.includes(p.id))
        // Consecutive game bench start rule: if player started on bench last game,
        // they must start in the field this game (cannot be benched in inning 1)
        .filter((p) => !(inning === 1 && previousGameBenchStarters.has(p.id)))
        // Never bench a locked pitcher in their pitching inning
        .filter((p) => lockedPitcherInnings.get(inning) !== p.id)
        // Never bench a player locked into a field position in this inning
        .filter((p) => !lockedInThisInning.has(p.id))
        .sort((a, b) => {
          // Prefer benching lower-rated players first
          const aRating = playerAvgRating.get(a.id) || 5;
          const bRating = playerAvgRating.get(b.id) || 5;
          return aRating - bRating;
        });

      if (eligible.length === 0) {
        // Relax the no-consecutive constraint
        const fallback = allBenchPlayers
          .filter((p) => playerBenchCount[p.id] < p.target)
          .filter((p) => !slots.includes(p.id))
          .filter((p) => lockedPitcherInnings.get(inning) !== p.id)
          .filter((p) => !lockedInThisInning.has(p.id))
          .sort((a, b) => {
            const aRating = playerAvgRating.get(a.id) || 5;
            const bRating = playerAvgRating.get(b.id) || 5;
            return aRating - bRating;
          });
        if (fallback.length > 0) {
          const chosen = fallback[0];
          slots.push(chosen.id);
          playerBenchCount[chosen.id]++;
          continue;
        }

        // All players at target — allow over-target to fill the required bench count
        const overTarget = allBenchPlayers
          .filter((p) => !slots.includes(p.id))
          .filter((p) => lockedPitcherInnings.get(inning) !== p.id)
          .filter((p) => !lockedInThisInning.has(p.id))
          .sort((a, b) => playerBenchCount[a.id] - playerBenchCount[b.id]);
        if (overTarget.length === 0) break; // truly no one available
        const chosen = overTarget[0];
        slots.push(chosen.id);
        playerBenchCount[chosen.id]++;
        continue;
      }

      const chosen = eligible[0];
      slots.push(chosen.id);
      playerBenchCount[chosen.id]++;
    }
  }

  // Post-processing: ensure every player with target >= 1 actually sits at least once.
  // If a player was never benched (due to locked positions blocking them in every chosen inning),
  // swap them into a bench slot by replacing a player who has benched more than their minimum.
  const unbenchedPlayers = allBenchPlayers.filter(
    (p) => p.target >= 1 && playerBenchCount[p.id] === 0,
  );

  for (const unbenched of unbenchedPlayers) {
    let swapped = false;

    // Find an inning where this player is NOT locked into a field position
    for (const inning of INNINGS) {
      if (swapped) break;
      const lockedInThisInning = lockedPlayerInnings.get(inning) || new Set<string>();
      if (lockedInThisInning.has(unbenched.id)) continue;
      if (lockedPitcherInnings.get(inning) === unbenched.id) continue;

      const slots = benchSlots.get(inning)!;
      if (slots.includes(unbenched.id)) continue;

      // Find someone in this inning's bench who has benched > 1 times and can be swapped out
      for (let si = 0; si < slots.length; si++) {
        const swapCandidate = slots[si];
        if (playerBenchCount[swapCandidate] <= 1) continue;
        // Don't swap out a locked bench player
        const lockedBench = lockedBenchByInning.get(inning) || [];
        if (lockedBench.includes(swapCandidate)) continue;

        // Perform swap
        slots[si] = unbenched.id;
        playerBenchCount[unbenched.id]++;
        playerBenchCount[swapCandidate]--;
        swapped = true;
        break;
      }
    }

    // If no swap was possible (everyone only benched once), add to a slot
    // by replacing someone in an inning where neither player is locked
    if (!swapped) {
      for (const inning of INNINGS) {
        if (swapped) break;
        const lockedInThisInning = lockedPlayerInnings.get(inning) || new Set<string>();
        if (lockedInThisInning.has(unbenched.id)) continue;
        if (lockedPitcherInnings.get(inning) === unbenched.id) continue;

        const slots = benchSlots.get(inning)!;
        if (slots.includes(unbenched.id)) continue;

        for (let si = 0; si < slots.length; si++) {
          const swapCandidate = slots[si];
          const lockedBench = lockedBenchByInning.get(inning) || [];
          if (lockedBench.includes(swapCandidate)) continue;

          slots[si] = unbenched.id;
          playerBenchCount[unbenched.id]++;
          playerBenchCount[swapCandidate]--;
          swapped = true;
          break;
        }
      }
    }
  }

  return benchSlots;
}

export function buildSeasonHistory(
  pastGames: { playerId: string; inning: number; position: string }[][],
): SeasonHistory[] {
  const historyMap = new Map<string, SeasonHistory>();

  // Track who was benched in inning 1 of the most recent game
  const lastGameBenchStarters = new Set<string>();

  for (let gi = 0; gi < pastGames.length; gi++) {
    const gameAssignments = pastGames[gi];
    const isLastGame = gi === pastGames.length - 1;

    for (const a of gameAssignments) {
      if (!historyMap.has(a.playerId)) {
        historyMap.set(a.playerId, {
          playerId: a.playerId,
          positionCounts: {},
          totalBenchInnings: 0,
          hasPitched: false,
          startedOnBenchLastGame: false,
        });
      }
      const h = historyMap.get(a.playerId)!;
      if (a.position === "BENCH") {
        h.totalBenchInnings++;
        if (isLastGame && a.inning === 1) {
          lastGameBenchStarters.add(a.playerId);
        }
      } else {
        h.positionCounts[a.position] = (h.positionCounts[a.position] || 0) + 1;
        if (a.position === "P") h.hasPitched = true;
      }
    }
  }

  // Set the flag for players who started on bench in the last game
  for (const playerId of lastGameBenchStarters) {
    const h = historyMap.get(playerId);
    if (h) h.startedOnBenchLastGame = true;
  }

  return Array.from(historyMap.values());
}
