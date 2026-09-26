import { describe, it, expect } from "vitest";
import { activePositionsFor, getInningsArray } from "@/types";

describe("activePositionsFor", () => {
  it("returns 9 standard positions by default", () => {
    const positions = activePositionsFor(false);
    expect(positions).toEqual(["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]);
  });

  it("replaces CF with LCF/RCF when extraOutfielder is true", () => {
    const positions = activePositionsFor(true);
    expect(positions).toContain("LCF");
    expect(positions).toContain("RCF");
    expect(positions).not.toContain("CF");
    expect(positions).toHaveLength(10);
  });

  it("removes disabled positions", () => {
    const positions = activePositionsFor(false, ["P", "C"]);
    expect(positions).not.toContain("P");
    expect(positions).not.toContain("C");
    expect(positions).toHaveLength(7);
  });

  it("handles extraOutfielder with disabled positions", () => {
    const positions = activePositionsFor(true, ["LCF"]);
    expect(positions).not.toContain("LCF");
    expect(positions).toContain("RCF");
    expect(positions).toHaveLength(9);
  });
});

describe("getInningsArray", () => {
  it("returns [1] for 1 inning", () => {
    expect(getInningsArray(1)).toEqual([1]);
  });

  it("returns [1..6] for 6 innings", () => {
    expect(getInningsArray(6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns [1..9] for 9 innings", () => {
    expect(getInningsArray(9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
