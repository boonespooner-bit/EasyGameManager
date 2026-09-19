import { describe, it, expect } from "vitest";
import {
  buildExportData,
  validateExportData,
  buildImportPlan,
  resolvePlayerNames,
  type ExportData,
} from "@/lib/teamData";

function makeDbTeam() {
  return {
    name: "Tigers",
    players: [
      {
        id: "p1",
        name: "Alex Smith",
        firstName: "Alex",
        lastName: "Smith",
        jerseyNumber: "7",
        battingOrder: 1,
        hasPitched: true,
        isPoolPlayer: false,
        poolGameId: null,
        ratings: [
          { id: "r1", playerId: "p1", position: "P", rating: 8 },
          { id: "r2", playerId: "p1", position: "1B", rating: 6 },
        ],
      },
      {
        id: "p2",
        name: "Jordan Lee",
        firstName: "Jordan",
        lastName: "Lee",
        jerseyNumber: "12",
        battingOrder: 2,
        hasPitched: false,
        isPoolPlayer: false,
        poolGameId: null,
        ratings: [
          { id: "r3", playerId: "p2", position: "SS", rating: 7 },
        ],
      },
      {
        id: "p3",
        name: "Pool Player Pat",
        firstName: "Pat",
        lastName: "Pool Player",
        jerseyNumber: null,
        battingOrder: 11,
        hasPitched: false,
        isPoolPlayer: true,
        poolGameId: "g1",
        ratings: [
          { id: "r4", playerId: "p3", position: "RF", rating: 3 },
        ],
      },
    ],
    games: [
      {
        id: "g1",
        opponent: "Bears",
        date: new Date("2026-09-10T18:00:00Z"),
        isLocked: true,
        heldPositions: null,
        sandlotRules: false,
        disabledPositions: null,
        extraOutfielder: false,
        innings: [
          { id: "a1", gameId: "g1", playerId: "p1", inning: 1, position: "P" },
          { id: "a2", gameId: "g1", playerId: "p2", inning: 1, position: "SS" },
          { id: "a3", gameId: "g1", playerId: "p3", inning: 1, position: "RF" },
        ],
        battingOrders: [
          { id: "bo1", gameId: "g1", playerId: "p1", order: 1 },
          { id: "bo2", gameId: "g1", playerId: "p2", order: 2 },
        ],
        exclusions: [
          { id: "ex1", gameId: "g1", playerId: "p2" },
        ],
        gameBalls: [
          { id: "gb1", gameId: "g1", playerId: "p1", reason: "Great pitching" },
        ],
      },
    ],
  };
}

describe("buildExportData", () => {
  it("exports team name and version", () => {
    const result = buildExportData(makeDbTeam());
    expect(result.version).toBe(1);
    expect(result.team.name).toBe("Tigers");
    expect(result.exportedAt).toBeTruthy();
  });

  it("exports roster players and excludes pool players", () => {
    const result = buildExportData(makeDbTeam());
    expect(result.team.players).toHaveLength(2);
    expect(result.team.players.map((p) => p.name)).toEqual(["Alex Smith", "Jordan Lee"]);
  });

  it("exports player ratings", () => {
    const result = buildExportData(makeDbTeam());
    const alex = result.team.players.find((p) => p.name === "Alex Smith")!;
    expect(alex.ratings).toEqual([
      { position: "P", rating: 8 },
      { position: "1B", rating: 6 },
    ]);
  });

  it("exports player fields correctly", () => {
    const result = buildExportData(makeDbTeam());
    const alex = result.team.players.find((p) => p.name === "Alex Smith")!;
    expect(alex.firstName).toBe("Alex");
    expect(alex.lastName).toBe("Smith");
    expect(alex.jerseyNumber).toBe("7");
    expect(alex.battingOrder).toBe(1);
    expect(alex.hasPitched).toBe(true);
  });

  it("exports pool players within their game", () => {
    const result = buildExportData(makeDbTeam());
    expect(result.team.games[0].poolPlayers).toHaveLength(1);
    expect(result.team.games[0].poolPlayers[0].name).toBe("Pool Player Pat");
  });

  it("maps assignments by player name instead of ID", () => {
    const result = buildExportData(makeDbTeam());
    const game = result.team.games[0];
    expect(game.assignments).toEqual([
      { playerName: "Alex Smith", inning: 1, position: "P" },
      { playerName: "Jordan Lee", inning: 1, position: "SS" },
      { playerName: "Pool Player Pat", inning: 1, position: "RF" },
    ]);
  });

  it("maps batting orders by player name", () => {
    const result = buildExportData(makeDbTeam());
    const game = result.team.games[0];
    expect(game.battingOrders).toEqual([
      { playerName: "Alex Smith", order: 1 },
      { playerName: "Jordan Lee", order: 2 },
    ]);
  });

  it("maps exclusions by player name", () => {
    const result = buildExportData(makeDbTeam());
    const game = result.team.games[0];
    expect(game.exclusions).toEqual([{ playerName: "Jordan Lee" }]);
  });

  it("maps game balls by player name", () => {
    const result = buildExportData(makeDbTeam());
    const game = result.team.games[0];
    expect(game.gameBalls).toEqual([{ playerName: "Alex Smith", reason: "Great pitching" }]);
  });

  it("exports game fields correctly", () => {
    const result = buildExportData(makeDbTeam());
    const game = result.team.games[0];
    expect(game.opponent).toBe("Bears");
    expect(game.isLocked).toBe(true);
    expect(game.sandlotRules).toBe(false);
    expect(game.extraOutfielder).toBe(false);
  });
});

describe("validateExportData", () => {
  it("accepts valid export data", () => {
    const data = buildExportData(makeDbTeam());
    expect(validateExportData(data)).toBe(true);
  });

  it("rejects null", () => {
    expect(validateExportData(null)).toBe(false);
  });

  it("rejects missing version", () => {
    expect(validateExportData({ team: { name: "X", players: [], games: [] } })).toBe(false);
  });

  it("rejects missing team name", () => {
    expect(validateExportData({ version: 1, team: { players: [], games: [] } })).toBe(false);
  });

  it("rejects missing players array", () => {
    expect(validateExportData({ version: 1, team: { name: "X", games: [] } })).toBe(false);
  });

  it("rejects missing games array", () => {
    expect(validateExportData({ version: 1, team: { name: "X", players: [] } })).toBe(false);
  });

  it("rejects non-object", () => {
    expect(validateExportData("hello")).toBe(false);
    expect(validateExportData(42)).toBe(false);
  });
});

describe("buildImportPlan", () => {
  it("preserves team name", () => {
    const exportData = buildExportData(makeDbTeam());
    const plan = buildImportPlan(exportData);
    expect(plan.teamName).toBe("Tigers");
  });

  it("maps players correctly", () => {
    const exportData = buildExportData(makeDbTeam());
    const plan = buildImportPlan(exportData);
    expect(plan.players).toHaveLength(2);
    expect(plan.players[0].name).toBe("Alex Smith");
    expect(plan.players[0].hasPitched).toBe(true);
    expect(plan.players[1].name).toBe("Jordan Lee");
    expect(plan.players[1].hasPitched).toBe(false);
  });

  it("preserves player ratings through round trip", () => {
    const exportData = buildExportData(makeDbTeam());
    const plan = buildImportPlan(exportData);
    expect(plan.players[0].ratings).toEqual([
      { position: "P", rating: 8 },
      { position: "1B", rating: 6 },
    ]);
  });

  it("converts date strings back to Date objects", () => {
    const exportData = buildExportData(makeDbTeam());
    const plan = buildImportPlan(exportData);
    expect(plan.games[0].date).toBeInstanceOf(Date);
    expect(plan.games[0].date.toISOString()).toBe("2026-09-10T18:00:00.000Z");
  });

  it("preserves game assignments", () => {
    const exportData = buildExportData(makeDbTeam());
    const plan = buildImportPlan(exportData);
    expect(plan.games[0].assignments).toHaveLength(3);
    expect(plan.games[0].assignments[0]).toEqual({
      playerName: "Alex Smith",
      inning: 1,
      position: "P",
    });
  });

  it("preserves pool players on their game", () => {
    const exportData = buildExportData(makeDbTeam());
    const plan = buildImportPlan(exportData);
    expect(plan.games[0].poolPlayers).toHaveLength(1);
    expect(plan.games[0].poolPlayers[0].name).toBe("Pool Player Pat");
  });

  it("defaults hasPitched to false when missing", () => {
    const exportData = buildExportData(makeDbTeam());
    delete (exportData.team.players[1] as Record<string, unknown>).hasPitched;
    const plan = buildImportPlan(exportData);
    expect(plan.players[1].hasPitched).toBe(false);
  });
});

describe("round trip: export then import", () => {
  it("preserves all data through export and import", () => {
    const dbTeam = makeDbTeam();
    const exported = buildExportData(dbTeam);
    const plan = buildImportPlan(exported);

    expect(plan.teamName).toBe(dbTeam.name);
    expect(plan.players).toHaveLength(2);
    expect(plan.games).toHaveLength(1);

    const game = plan.games[0];
    expect(game.opponent).toBe("Bears");
    expect(game.assignments).toHaveLength(3);
    expect(game.battingOrders).toHaveLength(2);
    expect(game.exclusions).toHaveLength(1);
    expect(game.gameBalls).toHaveLength(1);
    expect(game.poolPlayers).toHaveLength(1);

    for (const player of dbTeam.players.filter((p) => !p.isPoolPlayer)) {
      const imported = plan.players.find((p) => p.name === player.name)!;
      expect(imported).toBeTruthy();
      expect(imported.firstName).toBe(player.firstName);
      expect(imported.lastName).toBe(player.lastName);
      expect(imported.jerseyNumber).toBe(player.jerseyNumber);
      expect(imported.battingOrder).toBe(player.battingOrder);
      expect(imported.ratings).toHaveLength(player.ratings.length);
    }
  });
});

describe("resolvePlayerNames", () => {
  it("returns empty when all names match", () => {
    const map = { "Alex Smith": "id1", "Jordan Lee": "id2" };
    const assignments = [{ playerName: "Alex Smith" }, { playerName: "Jordan Lee" }];
    expect(resolvePlayerNames(assignments, map)).toEqual([]);
  });

  it("returns unresolved names", () => {
    const map = { "Alex Smith": "id1" };
    const assignments = [{ playerName: "Alex Smith" }, { playerName: "Unknown Player" }];
    expect(resolvePlayerNames(assignments, map)).toEqual(["Unknown Player"]);
  });

  it("deduplicates unresolved names", () => {
    const map = {};
    const assignments = [{ playerName: "Missing" }, { playerName: "Missing" }];
    expect(resolvePlayerNames(assignments, map)).toEqual(["Missing"]);
  });

  it("ignores empty player names", () => {
    const map = {};
    const assignments = [{ playerName: "" }];
    expect(resolvePlayerNames(assignments, map)).toEqual([]);
  });
});
