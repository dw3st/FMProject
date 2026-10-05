import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import { formatEuros } from "@/Domain/money";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Display texts of a club record (`clubHistory.*`): its name, the headline value and the context line. */
export function clubRecordTexts(r: ClubRecordBroken, t: T, leagueName: (slug: string) => string): {
  label: string; value: string; detail: string;
} {
  const label = t(`clubHistory.record.${r.kind}`);
  switch (r.kind) {
    case "biggestWin":
    case "biggestLoss":
      return {
        label, value: `${r.value.gf}–${r.value.ga}`,
        detail: t("clubHistory.detail.match", { opponent: r.value.opponentName, season: r.value.season }),
      };
    case "mostGoalsSeason":
      return { label, value: String(r.value.goals), detail: t("clubHistory.detail.goals", { name: r.value.name, season: r.value.season }) };
    case "highestFinish":
      return {
        label, value: `${r.value.position}º`,
        detail: t("clubHistory.detail.finish", { league: leagueName(r.value.league), season: r.value.season }),
      };
    case "unbeaten":
      return { label, value: String(r.value.matches), detail: t("clubHistory.detail.unbeaten", { season: r.value.season }) };
    case "recordSigning":
      return {
        label, value: formatEuros(r.value.fee),
        detail: t("clubHistory.detail.signing", { name: r.value.name, club: r.value.clubName, season: r.value.season }),
      };
    case "recordSale":
      return {
        label, value: formatEuros(r.value.fee),
        detail: t("clubHistory.detail.sale", { name: r.value.name, club: r.value.clubName, season: r.value.season }),
      };
  }
}
