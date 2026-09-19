export interface ExportedRating {
  position: string;
  rating: number;
}

export interface ExportedPlayer {
  name: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  battingOrder: number;
  hasPitched?: boolean;
  ratings: ExportedRating[];
}

export interface ExportedGame {
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

export interface ExportData {
  version: number;
  exportedAt: string;
  team: {
    name: string;
    players: ExportedPlayer[];
    games: ExportedGame[];
  };
}

interface DbRating {
  id: string;
  playerId: string;
  position: string;
  rating: number;
}

interface DbPlayer {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  battingOrder: number;
  hasPitched: boolean;
  isPoolPlayer: boolean;
  poolGameId: string | null;
  ratings: DbRating[];
}

interface DbAssignment {
  id: string;
  gameId: string;
  playerId: string;
  inning: number;
  position: string;
}

interface DbBattingOrder {
  id: string;
  gameId: string;
  playerId: string;
  order: number;
}

interface DbExclusion {
  id: string;
  gameId: string;
  playerId: string;
}

interface DbGameBall {
  id: string;
  gameId: string;
  playerId: string;
  reason: string;
}

interface DbGame {
  id: string;
  opponent: string;
  date: Date;
  isLocked: boolean;
  heldPositions: unknown;
  sandlotRules: boolean;
  disabledPositions: unknown;
  extraOutfielder: boolean;
  innings: DbAssignment[];
  battingOrders: DbBattingOrder[];
  exclusions: DbExclusion[];
  gameBalls: DbGameBall[];
}

interface DbTeam {
  name: string;
  players: DbPlayer[];
  games: DbGame[];
}

export function buildExportData(team: DbTeam): ExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    team: {
      name: team.name,
      players: team.players
        .filter((p) => !p.isPoolPlayer)
        .map((p) => ({
          name: p.name,
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber,
          battingOrder: p.battingOrder,
          hasPitched: p.hasPitched,
          ratings: p.ratings.map((r) => ({
            position: r.position,
            rating: r.rating,
          })),
        })),
      games: team.games.map((g) => ({
        opponent: g.opponent,
        date: g.date.toISOString(),
        isLocked: g.isLocked,
        heldPositions: g.heldPositions,
        sandlotRules: g.sandlotRules,
        disabledPositions: g.disabledPositions,
        extraOutfielder: g.extraOutfielder,
        poolPlayers: team.players
          .filter((p) => p.isPoolPlayer && p.poolGameId === g.id)
          .map((p) => ({
            name: p.name,
            firstName: p.firstName,
            lastName: p.lastName,
            jerseyNumber: p.jerseyNumber,
            battingOrder: p.battingOrder,
            ratings: p.ratings.map((r) => ({
              position: r.position,
              rating: r.rating,
            })),
          })),
        assignments: g.innings.map((a) => ({
          playerName: team.players.find((p) => p.id === a.playerId)?.name || "",
          inning: a.inning,
          position: a.position,
        })),
        battingOrders: g.battingOrders.map((bo) => ({
          playerName: team.players.find((p) => p.id === bo.playerId)?.name || "",
          order: bo.order,
        })),
        exclusions: g.exclusions.map((ex) => ({
          playerName: team.players.find((p) => p.id === ex.playerId)?.name || "",
        })),
        gameBalls: g.gameBalls.map((gb) => ({
          playerName: team.players.find((p) => p.id === gb.playerId)?.name || "",
          reason: gb.reason,
        })),
      })),
    },
  };
}

export function validateExportData(data: unknown): data is ExportData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (!d.version || typeof d.version !== "number") return false;
  if (!d.team || typeof d.team !== "object") return false;
  const team = d.team as Record<string, unknown>;
  if (!team.name || typeof team.name !== "string") return false;
  if (!Array.isArray(team.players)) return false;
  if (!Array.isArray(team.games)) return false;
  return true;
}

export interface ImportPlayerRecord {
  name: string;
  firstName: string;
  lastName: string;
  jerseyNumber: string | null;
  battingOrder: number;
  hasPitched: boolean;
  ratings: { position: string; rating: number }[];
}

export interface ImportGameRecord {
  opponent: string;
  date: Date;
  isLocked: boolean;
  heldPositions: unknown;
  sandlotRules: boolean;
  disabledPositions: unknown;
  extraOutfielder: boolean;
  poolPlayers: ImportPlayerRecord[];
  assignments: { playerName: string; inning: number; position: string }[];
  battingOrders: { playerName: string; order: number }[];
  exclusions: { playerName: string }[];
  gameBalls: { playerName: string; reason: string }[];
}

export interface ImportPlan {
  teamName: string;
  players: ImportPlayerRecord[];
  games: ImportGameRecord[];
}

export function buildImportPlan(data: ExportData): ImportPlan {
  return {
    teamName: data.team.name,
    players: data.team.players.map((p) => ({
      name: p.name,
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      jerseyNumber: p.jerseyNumber,
      battingOrder: p.battingOrder,
      hasPitched: p.hasPitched ?? false,
      ratings: p.ratings.map((r) => ({
        position: r.position,
        rating: r.rating,
      })),
    })),
    games: data.team.games.map((g) => ({
      opponent: g.opponent,
      date: new Date(g.date),
      isLocked: g.isLocked,
      heldPositions: g.heldPositions,
      sandlotRules: g.sandlotRules,
      disabledPositions: g.disabledPositions,
      extraOutfielder: g.extraOutfielder,
      poolPlayers: (g.poolPlayers || []).map((pp) => ({
        name: pp.name,
        firstName: pp.firstName || "",
        lastName: pp.lastName || "",
        jerseyNumber: pp.jerseyNumber,
        battingOrder: pp.battingOrder,
        hasPitched: pp.hasPitched ?? false,
        ratings: pp.ratings.map((r) => ({
          position: r.position,
          rating: r.rating,
        })),
      })),
      assignments: g.assignments,
      battingOrders: g.battingOrders,
      exclusions: g.exclusions,
      gameBalls: g.gameBalls,
    })),
  };
}

export function resolvePlayerNames(
  assignments: { playerName: string }[],
  playerIdMap: Record<string, string>,
): string[] {
  const unresolved: string[] = [];
  for (const a of assignments) {
    if (a.playerName && !playerIdMap[a.playerName] && !unresolved.includes(a.playerName)) {
      unresolved.push(a.playerName);
    }
  }
  return unresolved;
}
