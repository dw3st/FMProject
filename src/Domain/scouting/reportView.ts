// The scout reports tab (report): filter by mission, scout and grade, one row per player (the newest report), and
// sort by any column. Pure: the screen passes the reports and the missions it already has.
import { positionIndex } from "@/Domain/positions/positionSort";
import { RECOMMENDATION_ORIGIN, type ScoutGrade, type ScoutReport } from "@/types/scoutingTypes";

export const REPORT_GRADES: readonly ScoutGrade[] = ["A", "B", "C", "D", "E"];
const GRADE_RANK: Record<ScoutGrade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export type ReportSortKey = "grade" | "age" | "overall" | "potential" | "value" | "wage" | "knowledge" | "date" | "pos" | "player" | "club" | "verdict";
export type SortDir = "asc" | "desc";

export interface ReportFilter {
  /** Mission id, or "all". */
  mission: string;
  /** Scout id ("chief" or a field scout's member id), or "all". */
  scout: string;
  /** Grades shown; empty = all. */
  grades: readonly ScoutGrade[];
}

/** Who wrote a report: its own `scoutId`, else the mission's scout (still listed), else the chief for a recommendation. */
export function reportScoutId(r: ScoutReport, missions: readonly { id: string; scoutId: string }[]): string | null {
  if (r.scoutId) return r.scoutId;
  if (r.missionId === RECOMMENDATION_ORIGIN) return "chief";
  return missions.find((m) => m.id === r.missionId)?.scoutId ?? null;
}

/** The reports that pass the filter, one per player: the newest (several scouts often report the same player). */
export function filterReports(
  reports: readonly ScoutReport[], filter: ReportFilter, missions: readonly { id: string; scoutId: string }[],
): ScoutReport[] {
  const grades = new Set(filter.grades);
  const newest = new Map<string, ScoutReport>();
  for (const r of reports) {
    if (filter.mission !== "all" && r.missionId !== filter.mission) continue;
    if (filter.scout !== "all" && reportScoutId(r, missions) !== filter.scout) continue;
    if (grades.size > 0 && !grades.has(r.grade)) continue;
    const key = r.prospectId ?? r.playerId;
    const seen = newest.get(key);
    if (!seen || r.date > seen.date) newest.set(key, r);
  }
  return [...newest.values()];
}

const mid = (r: [number, number]) => (r[0] + r[1]) / 2;

/** Value of the column a row sorts by (bigger = better, except the grade, where A ranks first). */
function sortValue(r: ScoutReport, key: ReportSortKey): number | string {
  switch (key) {
    case "grade": return GRADE_RANK[r.grade];
    case "age": return r.age;
    case "overall": return mid(r.overall);
    case "potential": return mid(r.potential);
    case "value": return mid(r.value);
    case "wage": return r.wageDemand;
    case "knowledge": return r.k;
    case "date": return r.date;
    case "pos": return positionIndex(r.position);
    case "player": return r.name.toLocaleLowerCase();
    case "club": return r.club.toLocaleLowerCase();
    case "verdict": return VERDICT_RANK[r.text];
  }
}

/** Best verdict first: ready for the side, then for the future, then squad cover, then no upgrade. */
const VERDICT_RANK: Record<ScoutReport["text"], number> = { ready: 0, future: 1, squad: 2, no_upgrade: 3 };

/** First click on a column: grade, age, position, name, club and verdict go up (A first, youngest first, goalkeeper
 * first, A to Z, best verdict first), the rest down (best first). */
export function defaultDir(key: ReportSortKey): SortDir {
  return key === "grade" || key === "age" || key === "pos" || key === "player" || key === "club" || key === "verdict" ? "asc" : "desc";
}

/** Sorted copy; ties by grade, then the seen level, then the name. */
export function sortReports(rows: readonly ScoutReport[], key: ReportSortKey, dir: SortDir): ScoutReport[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va !== vb) return (va < vb ? -1 : 1) * sign;
    return GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || mid(b.overall) - mid(a.overall) || a.name.localeCompare(b.name);
  });
}
