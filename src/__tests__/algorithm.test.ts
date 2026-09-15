import { describe, it, expect } from "vitest";
import { generateGamePlan, buildSeasonHistory } from "@/lib/algorithm";
import { INNINGS, POSITIONS, type PlayerWithRatings, type SeasonHistory } from "@/types";

function makePlayer(
  id: string,
  name: string,
  overrides?: Partial<PlayerWithRatings> & { ratingOverrides?: Record<string, number> },
): PlayerWithRatings {
  const ratingOverrides = overrides?.ratingOverrides ?? {};
  return {
    id,
    name,
    battingOrder: overrides?.battingOrder ?? 1,
    ratings: POSITIONS.map((pos) => ({
      position: pos,
      rating: ratingOverrides[pos] ?? 5,
    })),
  };
}

function makeRoster(count: number): PlayerWithRatings[] {
  return Array.from({ length: count }, (_, i) =>
    makePlayer(`p${i + 1}`, `Player ${i + 1}`, { battingOrder: i + 1 }),
  );
}

function emptyHistory(): SeasonHistory[] {
  return [];
}

function assignmentsForPlayer(
  assignments: ReturnType<typeof generateGamePlan>,
  playerId: string,
) {
  return assignments.filter((a) => a.playerId === playerId);
}

function benchInningsForPlayer(
  assignments: ReturnType<typeof generateGamePlan>,
  playerId: string,
): number[] {
  return assignments
    .filter((a) => a.playerId === playerId && a.position === "BENCH")
    .map((a) => a.inning);
}

// ---------------------------------------------------------------------------
// Basic generation
// ---------------------------------------------------------------------------

describe("generateGamePlan", () => {
  it("returns empty for no players", () => {
    expect(generateGamePlan([], [])).toEqual([]);
  });

  it("assigns every player to exactly one position per inning with 9 players", () => {
    const players = makeRoster(9);
    const assignments = generateGamePlan(players, emptyHistory());

    for (const inning of INNINGS) {
      const inningAssignments = assignments.filter((a) => a.inning === inning);
      const playerIds = inningAssignments.map((a) => a.playerId);
      expect(new Set(playerIds).size).toBe(9);
      expect(inningAssignments).toHaveLength(9);
    }
  });

  it("fills every active position each inning", () => {
    const players = makeRoster(9);
    const assignments = generateGamePlan(players, emptyHistory());

    for (const inning of INNINGS) {
      const positions = assignments
        .filter((a) => a.inning === inning)
        .map((a) => a.position)
        .sort();
      expect(positions).toEqual([...POSITIONS].sort());
    }
  });

  // -------------------------------------------------------------------------
  // Bench constraints
  // -------------------------------------------------------------------------

  describe("bench scheduling", () => {
    it("benches players when roster exceeds 9", () => {
      const players = makeRoster(11);
      const assignments = generateGamePlan(players, emptyHistory());

      for (const inning of INNINGS) {
        const benched = assignments.filter(
          (a) => a.inning === inning && a.position === "BENCH",
        );
        expect(benched).toHaveLength(2);
      }
    });

    it("limits each player to at most 2 bench innings", () => {
      const players = makeRoster(12);
      const assignments = generateGamePlan(players, emptyHistory());

      for (const player of players) {
        const benchCount = benchInningsForPlayer(assignments, player.id).length;
        expect(benchCount).toBeLessThanOrEqual(2);
      }
    });

    it("does not bench a player in consecutive innings", () => {
      const players = makeRoster(11);
      const assignments = generateGamePlan(players, emptyHistory());

      for (const player of players) {
        const benchInnings = benchInningsForPlayer(assignments, player.id).sort();
        for (let i = 1; i < benchInnings.length; i++) {
          expect(benchInnings[i] - benchInnings[i - 1]).toBeGreaterThan(1);
        }
      }
    });

    it("respects cross-game bench rotation", () => {
      const players = makeRoster(11);

      const game1Assignments = [
        { playerId: "p1", inning: 1, position: "BENCH" },
        { playerId: "p1", inning: 3, position: "BENCH" },
        { playerId: "p2", inning: 1, position: "BENCH" },
        { playerId: "p2", inning: 4, position: "BENCH" },
      ];
      const history = buildSeasonHistory([game1Assignments]);

      const assignments = generateGamePlan(players, history);

      const p1Bench = benchInningsForPlayer(assignments, "p1");
      const p2Bench = benchInningsForPlayer(assignments, "p2");
      expect(p1Bench).not.toContain(1);
      expect(p2Bench).not.toContain(1);
    });

    it("gives every player an assignment in every inning (no gaps)", () => {
      const players = makeRoster(12);
      const assignments = generateGamePlan(players, emptyHistory());

      for (const player of players) {
        const playerInnings = assignmentsForPlayer(assignments, player.id).map(
          (a) => a.inning,
        );
        expect(playerInnings.sort()).toEqual([...INNINGS]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // DNP enforcement
  // -------------------------------------------------------------------------

  describe("DNP enforcement", () => {
    it("does not place a player at a position with rating 0", () => {
      const players = makeRoster(9);
      players[0] = makePlayer("p1", "Player 1", {
        battingOrder: 1,
        ratingOverrides: { SS: 0, "3B": 0 },
      });

      const assignments = generateGamePlan(players, emptyHistory());
      const p1Assignments = assignmentsForPlayer(assignments, "p1");

      for (const a of p1Assignments) {
        expect(a.position).not.toBe("SS");
        expect(a.position).not.toBe("3B");
      }
    });

    it("handles multiple players with overlapping DNPs", () => {
      const players = makeRoster(9);
      players[0] = makePlayer("p1", "Player 1", {
        battingOrder: 1,
        ratingOverrides: { P: 0, C: 0 },
      });
      players[1] = makePlayer("p2", "Player 2", {
        battingOrder: 2,
        ratingOverrides: { P: 0, C: 0 },
      });
      players[2] = makePlayer("p3", "Player 3", {
        battingOrder: 3,
        ratingOverrides: { P: 0, C: 0 },
      });

      const assignments = generateGamePlan(players, emptyHistory());

      for (const pid of ["p1", "p2", "p3"]) {
        const playerAssignments = assignmentsForPlayer(assignments, pid);
        for (const a of playerAssignments) {
          expect(a.position).not.toBe("P");
          expect(a.position).not.toBe("C");
        }
      }

      for (const inning of INNINGS) {
        const positions = assignments
          .filter((a) => a.inning === inning)
          .map((a) => a.position)
          .sort();
        expect(positions).toEqual([...POSITIONS].sort());
      }
    });
  });

  // -------------------------------------------------------------------------
  // Infield guarantee
  // -------------------------------------------------------------------------

  describe("infield guarantee", () => {
    it("gives every player at least one infield inning", () => {
      const INFIELD = ["1B", "2B", "3B", "SS"];
      const players = makeRoster(9);
      const assignments = generateGamePlan(players, emptyHistory());

      for (const player of players) {
        const playerPositions = assignmentsForPlayer(assignments, player.id).map(
          (a) => a.position,
        );
        const hasInfield = playerPositions.some((p) => INFIELD.includes(p));
        expect(hasInfield).toBe(true);
      }
    });

    it("skips infield guarantee for players with DNP on all infield positions", () => {
      const players = makeRoster(9);
      players[0] = makePlayer("p1", "Player 1", {
        battingOrder: 1,
        ratingOverrides: { "1B": 0, "2B": 0, "3B": 0, SS: 0 },
      });

      const assignments = generateGamePlan(players, emptyHistory());

      for (const inning of INNINGS) {
        const positions = assignments
          .filter((a) => a.inning === inning)
          .map((a) => a.position)
          .sort();
        expect(positions).toEqual([...POSITIONS].sort());
      }
    });
  });

  // -------------------------------------------------------------------------
  // Locked positions
  // -------------------------------------------------------------------------

  describe("locked positions", () => {
    it("respects locked pitcher assignments", () => {
      const players = makeRoster(9);
      const lockedPitchers = [
        { playerId: "p5", inning: 1 },
        { playerId: "p5", inning: 2 },
      ];

      const assignments = generateGamePlan(
        players,
        emptyHistory(),
        lockedPitchers,
      );

      const p5Inning1 = assignments.find(
        (a) => a.playerId === "p5" && a.inning === 1,
      );
      const p5Inning2 = assignments.find(
        (a) => a.playerId === "p5" && a.inning === 2,
      );
      expect(p5Inning1?.position).toBe("P");
      expect(p5Inning2?.position).toBe("P");
    });

    it("respects locked field positions", () => {
      const players = makeRoster(9);
      const lockedPositions = [
        { playerId: "p3", inning: 4, position: "SS" },
      ];

      const assignments = generateGamePlan(
        players,
        emptyHistory(),
        undefined,
        lockedPositions,
      );

      const p3Inning4 = assignments.find(
        (a) => a.playerId === "p3" && a.inning === 4,
      );
      expect(p3Inning4?.position).toBe("SS");
    });

    it("respects locked bench positions", () => {
      const players = makeRoster(11);
      const lockedPositions = [
        { playerId: "p1", inning: 2, position: "BENCH" },
      ];

      const assignments = generateGamePlan(
        players,
        emptyHistory(),
        undefined,
        lockedPositions,
      );

      const p1Inning2 = assignments.find(
        (a) => a.playerId === "p1" && a.inning === 2,
      );
      expect(p1Inning2?.position).toBe("BENCH");
    });
  });

  // -------------------------------------------------------------------------
  // Sandlot / extra outfielder
  // -------------------------------------------------------------------------

  describe("sandlot mode", () => {
    it("uses 10 field positions with extraOutfielder", () => {
      const players = makeRoster(10);
      const assignments = generateGamePlan(
        players,
        emptyHistory(),
        undefined,
        undefined,
        undefined,
        { extraOutfielder: true },
      );

      for (const inning of INNINGS) {
        const positions = assignments
          .filter((a) => a.inning === inning)
          .map((a) => a.position);
        expect(positions).toContain("LCF");
        expect(positions).toContain("RCF");
        expect(positions).not.toContain("CF");
        expect(positions).toHaveLength(10);
      }
    });

    it("skips disabled positions", () => {
      const players = makeRoster(8);
      const assignments = generateGamePlan(
        players,
        emptyHistory(),
        undefined,
        undefined,
        undefined,
        { disabledPositions: ["P"] },
      );

      for (const inning of INNINGS) {
        const positions = assignments
          .filter((a) => a.inning === inning)
          .map((a) => a.position);
        expect(positions).not.toContain("P");
        expect(positions).toHaveLength(8);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Position variety
  // -------------------------------------------------------------------------

  describe("position variety", () => {
    it("does not assign a player the same position all 6 innings (with 9 players)", () => {
      const players = makeRoster(9);
      const assignments = generateGamePlan(players, emptyHistory());

      for (const player of players) {
        const positions = assignmentsForPlayer(assignments, player.id).map(
          (a) => a.position,
        );
        const unique = new Set(positions);
        expect(unique.size).toBeGreaterThan(1);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// buildSeasonHistory
// ---------------------------------------------------------------------------

describe("buildSeasonHistory", () => {
  it("returns empty for no past games", () => {
    expect(buildSeasonHistory([])).toEqual([]);
  });

  it("counts positions across games", () => {
    const game1 = [
      { playerId: "p1", inning: 1, position: "P" },
      { playerId: "p1", inning: 2, position: "SS" },
    ];
    const game2 = [
      { playerId: "p1", inning: 1, position: "SS" },
    ];

    const history = buildSeasonHistory([game1, game2]);
    const p1 = history.find((h) => h.playerId === "p1")!;

    expect(p1.positionCounts["P"]).toBe(1);
    expect(p1.positionCounts["SS"]).toBe(2);
    expect(p1.hasPitched).toBe(true);
  });

  it("tracks bench innings", () => {
    const game = [
      { playerId: "p1", inning: 1, position: "BENCH" },
      { playerId: "p1", inning: 2, position: "SS" },
      { playerId: "p1", inning: 3, position: "BENCH" },
    ];
    const history = buildSeasonHistory([game]);
    const p1 = history.find((h) => h.playerId === "p1")!;

    expect(p1.totalBenchInnings).toBe(2);
  });

  it("marks players who started on bench in the last game", () => {
    const game1 = [
      { playerId: "p1", inning: 1, position: "BENCH" },
    ];
    const game2 = [
      { playerId: "p1", inning: 1, position: "SS" },
      { playerId: "p2", inning: 1, position: "BENCH" },
    ];

    const history = buildSeasonHistory([game1, game2]);
    const p1 = history.find((h) => h.playerId === "p1")!;
    const p2 = history.find((h) => h.playerId === "p2")!;

    expect(p1.startedOnBenchLastGame).toBe(false);
    expect(p2.startedOnBenchLastGame).toBe(true);
  });

  it("sets hasPitched false when player never pitched", () => {
    const game = [
      { playerId: "p1", inning: 1, position: "SS" },
      { playerId: "p1", inning: 2, position: "CF" },
    ];
    const history = buildSeasonHistory([game]);
    const p1 = history.find((h) => h.playerId === "p1")!;

    expect(p1.hasPitched).toBe(false);
  });
});
