interface InningsSetting {
  inningsPlayed: number | null;
  inningsPlanned: number | null;
}

interface GameAssignment {
  playerId: string;
  inning: number;
  position: string;
}

// Last inning actually played: inningsPlayed when a game ended early, otherwise the planned count
export function lastPlayedInning(game: InningsSetting): number {
  return game.inningsPlayed ?? game.inningsPlanned ?? 6;
}

// A game's assignments with innings that were never played dropped
export function playedAssignments<T extends { inning: number }>(
  game: InningsSetting & { innings: T[] },
): T[] {
  const last = lastPlayedInning(game);
  return game.innings.filter((i) => i.inning <= last);
}

// Per player, how many played innings they spent at each position (BENCH included)
export function countPlayedPositions(
  games: (InningsSetting & { innings: GameAssignment[] })[],
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const g of games) {
    for (const a of playedAssignments(g)) {
      const playerCounts = (counts[a.playerId] ??= {});
      playerCounts[a.position] = (playerCounts[a.position] || 0) + 1;
    }
  }
  return counts;
}
