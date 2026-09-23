/**
 * Parse "2025-26" → { start: "2025-08-15", end: "2026-05-20", year: 2025 }
 */
export function parseSeasonDates(season: string): { start: string; end: string; year: number } {
  const year = parseInt(season.split("-")[0]!, 10);
  return {
    year,
    start: `${year}-08-15`,
    end: `${year + 1}-05-20`,
  };
}
