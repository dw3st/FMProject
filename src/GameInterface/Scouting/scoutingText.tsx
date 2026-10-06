import { useTranslation } from "react-i18next";
import type { ScoutingInboxMessage } from "@/types/inboxTypes";
import type { ScoutTarget } from "@/types/scoutingTypes";
import type { LeagueData } from "@/types/playerTypes";
import { competitionName } from "@/Domain/world/labels";
import { formatFee } from "@/Domain/money";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** A mission target as text (country, league name, continent, player). */
export function targetLabel(target: ScoutTarget | undefined, t: T, leagues: LeagueData[], lang: string): string {
  if (!target) return "";
  if (target.kind === "player") return target.playerName ?? "";
  if (target.kind === "league") return competitionName(target.league ?? "", leagues, lang);
  if (target.kind === "continent") return t(`scouting.continents.${target.continent ?? ""}`, { defaultValue: target.continent ?? "" });
  const country = target.country ?? "";
  return target.kind === "youth" ? t("scouting.target.youthOf", { country }) : country;
}

/** Translated subject and body of a scouting message (`.claude/rules/game/scouting.md`). */
export function scoutingTexts(message: ScoutingInboxMessage, t: T, leagues: LeagueData[] = [], lang = "en"): { subject: string; body: string } {
  const target = targetLabel(message.target, t, leagues, lang);
  const players = (message.players ?? []).map((p) => `${p.name} (${p.grade}${p.gem ? ", " + t("scouting.gem") : ""})`).join(", ");
  const vars = {
    target, players, count: message.count ?? 0, player: message.playerName ?? "", club: message.clubName ?? "",
    grade: message.grade ?? "", fee: formatFee(message.fee ?? 0), expires: message.expires ?? "",
    reason: message.reason ? t(`inbox.scouting.reason.${message.reason}`) : "",
  };
  return {
    subject: t(`inbox.scouting.subject.${message.kind}`, vars),
    body: t(`inbox.scouting.body.${message.kind}`, vars),
  };
}

export function ScoutingInboxBody({ message, leagues }: { message: ScoutingInboxMessage; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const tab = message.kind === "prospect" || message.kind === "gem" ? "gems" : message.kind === "shortlist" ? "shortlist" : "reports";
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground m-0">{scoutingTexts(message, t as T, leagues, i18n.language).body}</p>
      <a href={`/scout?tab=${tab}`} className="inline-flex items-center h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold no-underline">
        {t("inbox.scouting.open")}
      </a>
    </div>
  );
}
