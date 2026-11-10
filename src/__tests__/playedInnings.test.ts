import { describe, it, expect } from "vitest";
import { lastPlayedInning, playedAssignments, countPlayedPositions } from "@/lib/playedInnings";

// One player's assignments for innings 1..n, in the given positions
function inningsFor(playerId: string, positions: string[]) {
  return positions.map((position, i) => ({ playerId, inning: i + 1, position }));
}

describe("lastPlayedInning", () => {
  it("uses inningsPlayed when the game ended early", () => {
    expect(lastPlayedInning({ inningsPlayed: 4, inningsPlanned: 6 })).toBe(4);
  });

  it("falls back to inningsPlanned when inningsPlayed is not set", () => {
    expect(lastPlayedInning({ inningsPlayed: null, inningsPlanned: 7 })).toBe(7);
  });

  it("defaults to 6 when neither is set", () => {
    expect(lastPlayedInning({ inningsPlayed: null, inningsPlanned: null })).toBe(6);
  });
});

describe("playedAssignments", () => {
  const innings = inningsFor("p1", ["SS", "3B", "P", "CF", "LF", "BENCH"]);

  it("drops innings after inningsPlayed", () => {
    const played = playedAssignments({ inningsPlayed: 4, inningsPlanned: 6, innings });
    expect(played.map((a) => a.inning)).toEqual([1, 2, 3, 4]);
  });

  it("keeps every planned inning when the game went the distance", () => {
    const played = playedAssignments({ inningsPlayed: null, inningsPlanned: 6, innings });
    expect(played).toHaveLength(6);
  });
});

describe("countPlayedPositions", () => {
  it("does not count pitching in innings that were never played", () => {
    const counts = countPlayedPositions([
      { inningsPlayed: 4, inningsPlanned: 6, innings: inningsFor("p1", ["C", "C", "SS", "SS", "P", "P"]) },
    ]);
    expect(counts.p1.P).toBeUndefined();
    expect(counts.p1.C).toBe(2);
    expect(counts.p1.SS).toBe(2);
  });

  it("does not count bench innings that were never played", () => {
    const counts = countPlayedPositions([
      { inningsPlayed: 5, inningsPlanned: 6, innings: inningsFor("p1", ["SS", "BENCH", "SS", "SS", "SS", "BENCH"]) },
    ]);
    expect(counts.p1.BENCH).toBe(1);
  });

  it("adds up innings pitched across games, each trimmed to its own innings played", () => {
    const counts = countPlayedPositions([
      { inningsPlayed: null, inningsPlanned: 6, innings: inningsFor("p1", ["P", "P", "SS", "SS", "SS", "SS"]) },
      { inningsPlayed: 4, inningsPlanned: 6, innings: inningsFor("p1", ["SS", "SS", "SS", "P", "P", "P"]) },
      { inningsPlayed: 5, inningsPlanned: 6, innings: inningsFor("p1", ["SS", "SS", "SS", "SS", "P", "P"]) },
    ]);
    expect(counts.p1.P).toBe(4);
  });

  it("counts each player separately and leaves out players with no played innings", () => {
    const counts = countPlayedPositions([
      {
        inningsPlayed: 2,
        inningsPlanned: 6,
        innings: [
          ...inningsFor("p1", ["P", "P"]),
          ...inningsFor("p2", ["C", "C"]),
          { playerId: "p3", inning: 3, position: "P" },
        ],
      },
    ]);
    expect(counts.p1).toEqual({ P: 2 });
    expect(counts.p2).toEqual({ C: 2 });
    expect(counts.p3).toBeUndefined();
  });
});
