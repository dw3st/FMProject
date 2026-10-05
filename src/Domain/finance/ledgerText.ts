import type { LedgerEntry } from "@/Domain/finance/ledger";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";

/**
 * Language-free description of a ledger line: an i18n key (under `financesScreen.ledgerText`)
 * plus the raw pieces the UI turns into names. `null` means "not enough data, show `entry.label`".
 */
export interface LedgerDescription {
  key: string;
  competition?: string;
  /** Stage name; translate with `cups.stage.*` (scope "cup") or `continental.stage.*` ("continental"). */
  stage?: string;
  stageScope?: "cup" | "continental";
  position?: number;
  club?: string;
  /** Sell-on / loan lines: the player's name. */
  player?: string;
  /** Facilities lines: the project kind (`facilities.kind.*`). */
  facility?: string;
}

export function describeLedgerEntry(entry: Pick<LedgerEntry, "kind" | "ref">): LedgerDescription | null {
  const ref = entry.ref;
  switch (entry.kind) {
    case "broadcasting":
    case "commercial":
    case "wages":
    case "operational":
    case "staff":
      return { key: entry.kind };
    case "gate":
      return ref?.competition ? { key: "gate", competition: ref.competition } : null;
    case "transfer_in":
    case "transfer_out":
      // Etapa 21 (`.claude/rules/game/negotiation.md`): sell-on clauses and loan fees.
      if (ref?.stage === "sell_on" && ref.clubName) {
        return { key: entry.kind === "transfer_in" ? "sellOnIn" : "sellOnOut", club: ref.clubName, ...(ref.playerName ? { player: ref.playerName } : {}) };
      }
      if (ref?.stage === "loan_fee" && ref.clubName) {
        return { key: entry.kind === "transfer_in" ? "loanFeeIn" : "loanFeeOut", club: ref.clubName, ...(ref.playerName ? { player: ref.playerName } : {}) };
      }
      return ref?.clubName
        ? { key: entry.kind === "transfer_in" ? "transferIn" : "transferOut", club: ref.clubName }
        : null;
    case "facilities":
    case "board_funding":
      // `.claude/rules/game/facilities.md`: the project kind (and stand) of an instalment.
      return ref?.facility ? { key: entry.kind === "facilities" ? "facilityInstalment" : "boardFunding", facility: ref.facility } : null;
    case "facilities_upkeep":
      return { key: "facilitiesUpkeep" };
    case "club_change":
      return ref?.clubName ? { key: ref.stage === "leave" ? "clubLeave" : "clubArrive", club: ref.clubName } : null;
    case "prize": {
      // End-of-season board bonus (`.claude/rules/game/board-fans.md`): no competition.
      if (ref?.stage === "board_bonus") return { key: "boardBonus" };
      const competition = ref?.competition;
      if (!competition) return null;
      if (ref.position !== undefined) return { key: "leaguePrize", competition, position: ref.position };
      const stage = ref.stage;
      if (!stage) return null;
      if (isCupSlug(competition)) {
        return stage === "runner_up"
          ? { key: "cupRunnerUp", competition }
          : { key: "cupStage", competition, stage, stageScope: "cup" };
      }
      if (isContinentalSlug(competition)) {
        if (stage === "participation") return { key: "contParticipation", competition };
        if (stage === "group_draw") return { key: "contGroupDraw", competition };
        if (stage === "group_win") return { key: "contGroupWin", competition };
        if (stage === "title") return { key: "contTitle", competition };
        return { key: "contStage", competition, stage, stageScope: "continental" };
      }
      return null;
    }
  }
}
