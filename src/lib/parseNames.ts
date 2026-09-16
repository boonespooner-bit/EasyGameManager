export function parseNames(
  rawText: string,
): { firstName: string; lastName: string }[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const hasTab = lines.some((l) => l.includes("\t"));

  return lines.map((line) => {
    if (hasTab) {
      const parts = line.split("\t").map((s) => s.trim());
      return { firstName: parts[0] || "", lastName: parts[1] || "" };
    }
    const firstSpace = line.indexOf(" ");
    if (firstSpace === -1) {
      return { firstName: line, lastName: "" };
    }
    return {
      firstName: line.slice(0, firstSpace),
      lastName: line.slice(firstSpace + 1),
    };
  });
}
