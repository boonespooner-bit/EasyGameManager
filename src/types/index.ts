export const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
export type Position = (typeof POSITIONS)[number];
export type FieldPosition = Position | "BENCH";

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
}
