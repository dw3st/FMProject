import type { TFunction } from "i18next";
import type { BetPick } from "@/types/betTypes";

/** "Bahia vence", "Empate", "Placar 2-1", "Pedro marca". */
export function pickLabel(t: TFunction, pick: BetPick, homeName: string, awayName: string): string {
  if (pick.market === "score") return t("bets.pick.score", { home: pick.home, away: pick.away });
  if (pick.market === "scorer") return t("bets.pick.scorer", { player: pick.playerName });
  if (pick.side === "draw") return t("bets.draw");
  return t("bets.pick.win", { team: pick.side === "home" ? homeName : awayName });
}
