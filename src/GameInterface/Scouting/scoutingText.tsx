import { useTranslation } from "react-i18next";
import type { ScoutingInboxMessage } from "@/types/inboxTypes";
import type { ScoutTarget } from "@/types/scoutingTypes";
import type { LeagueData } from "@/types/playerTypes";
import { competitionName } from "@/Domain/world/labels";
import { formatFee } from "@/Domain/money";
import { GemBadge, GradeBadge } from "@/GameInterface/Scouting/Badges";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";

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
  // The chief's picks: each one opens the player's page (knowledge block with his report), like the
  // names in the reports table; the button below opens the reports, where every pick has one.
  const picks = message.kind === "recommendation" ? (message.players ?? []).filter((p) => p.playerId && p.squadId) : [];
  return (
    <div className="space-y-3">
      {picks.length > 0 ? (
        <>
          <p className="text-sm text-foreground m-0">{t("inbox.scouting.recommendationLead")}</p>
          <ul className="m-0 p-0 list-none space-y-2">
            {picks.map((p) => (
              <li key={p.playerId} className="flex items-center gap-2 text-sm">
                <GradeBadge grade={p.grade} />
                <a href={playerHref(p.playerId, p.squadId!, p.league)} className="font-semibold text-foreground no-underline hover:text-primary">{p.name}</a>
                {p.club && <span className="text-muted-foreground">· {p.club}</span>}
                {p.gem && <GemBadge />}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-foreground m-0">{scoutingTexts(message, t as T, leagues, i18n.language).body}</p>
      )}
      <a href={`/scout?tab=${tab}`} className="inline-flex items-center h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold no-underline">
        {t("inbox.scouting.open")}
      </a>
    </div>
  );
}
