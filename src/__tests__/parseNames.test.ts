import { describe, it, expect } from "vitest";
import { parseNames } from "@/lib/parseNames";

describe("parseNames", () => {
  it("returns empty for empty input", () => {
    expect(parseNames("")).toEqual([]);
    expect(parseNames("   \n  \n  ")).toEqual([]);
  });

  describe("tab-separated (two columns)", () => {
    it("parses first and last name columns", () => {
      expect(parseNames("John\tSmith\nJane\tDoe")).toEqual([
        { firstName: "John", lastName: "Smith" },
        { firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("trims whitespace around names", () => {
      expect(parseNames("  John \t Smith  ")).toEqual([
        { firstName: "John", lastName: "Smith" },
      ]);
    });

    it("handles missing last name column", () => {
      expect(parseNames("John\t")).toEqual([
        { firstName: "John", lastName: "" },
      ]);
    });

    it("uses tab mode for all lines if any line has a tab", () => {
      expect(parseNames("John\tSmith\nMadonna")).toEqual([
        { firstName: "John", lastName: "Smith" },
        { firstName: "Madonna", lastName: "" },
      ]);
    });
  });

  describe("single column (full names)", () => {
    it("splits on the first space", () => {
      expect(parseNames("John Smith\nJane Doe")).toEqual([
        { firstName: "John", lastName: "Smith" },
        { firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("puts multi-word remainder in last name", () => {
      expect(parseNames("Henry Di Spaltro")).toEqual([
        { firstName: "Henry", lastName: "Di Spaltro" },
      ]);
    });

    it("handles single-word names", () => {
      expect(parseNames("Madonna")).toEqual([
        { firstName: "Madonna", lastName: "" },
      ]);
    });

    it("skips blank lines", () => {
      expect(parseNames("John Smith\n\n\nJane Doe\n")).toEqual([
        { firstName: "John", lastName: "Smith" },
        { firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("trims whitespace", () => {
      expect(parseNames("  John Smith  \n  Jane Doe  ")).toEqual([
        { firstName: "John", lastName: "Smith" },
        { firstName: "Jane", lastName: "Doe" },
      ]);
    });
  });
});
