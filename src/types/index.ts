export const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
export const SANDLOT_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "LCF", "RCF"] as const;
export type Position = (typeof SANDLOT_POSITIONS)[number];
export type FieldPosition = Position | "BENCH";

// Compute the set of active positions for a game given sandlot settings.
// - Base: 9 standard positions
// - extraOutfielder: drop CF, add LCF+RCF (4 outfielders)
// - disabledPositions: remove any positions the coach turned off
export function activePositionsFor(
  extraOutfielder: boolean,
  disabledPositions: string[] = [],
): Position[] {
  const base: Position[] = extraOutfielder
    ? ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"]
    : ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  const disabled = new Set(disabledPositions);
  return base.filter((p) => !disabled.has(p));
}

export const INNINGS = [1, 2, 3, 4, 5, 6] as const;
export type Inning = (typeof INNINGS)[number];

export interface PlayerWithRatings {
  id: string;
  name: string;
  battingOrder: number;
  ratings: { position: string; rating: number }[];
}

export interface GameAssignment {
  playerId: string;
  playerName: string;
  inning: number;
  position: FieldPosition;
}

export interface GamePlan {
  gameId: string;
  opponent: string;
  date: string;
  assignments: GameAssignment[];
  battingOrder: { playerId: string; playerName: string; order: number }[];
}

export interface SeasonHistory {
  playerId: string;
  positionCounts: Record<string, number>;
  totalBenchInnings: number;
  hasPitched: boolean;
  startedOnBenchLastGame: boolean;
}

export interface HistoricalFrequency {
  playerId: string;
  position: string;
  inning: number;
  count: number;
}
