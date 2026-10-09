import { shirtName } from "@/Domain/shirtName";
import type { ReactNode } from "react";
import { RefereeBadge, type RefereeBadgeData } from "@/GameInterface/Referees/RefereeBadge";
import { useTranslation } from "react-i18next";
import type { TeamId } from "@/GameEngine/types";
import { ClubLogo } from "@/GameInterface/Components/ClubLogo";
import type { TeamMeta } from "@/GameInterface/ScoreBar";

/** Live team numbers shown in the "Resumo" panel (both sides). */
export interface SummaryTeamStats {
  shots: number;
  passesCompleted: number;
  passesAttempted: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  corners: number;
  /** Free kicks won from fouls. */
  freeKicks: number;
}

/** One line of the live match feed. */
export interface MatchFeedItem {
  minute: number;
  team: TeamId;
  kind: "goal" | "penaltyGoal" | "penaltyMissed" | "yellow" | "red" | "offside" | "sub" | "injury";
  player: string;
  /** Substitution only: the player coming on. */
  playerIn?: string;
}

const KIND_MARK: Record<MatchFeedItem["kind"], string> = {
  goal: "bg-primary",
  penaltyGoal: "bg-primary",
  penaltyMissed: "bg-muted-foreground",
  yellow: "bg-card-yellow",
  red: "bg-destructive",
  offside: "bg-muted-foreground",
  sub: "bg-chart-2",
  injury: "bg-destructive",
};

function StatRow({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-2 text-base">
      <span className="w-12 font-display font-bold tabular-nums text-foreground">{a}</span>
      <span className="font-display font-bold uppercase tracking-[0.08em] text-sm text-muted-foreground">{label}</span>
      <span className="w-12 text-right font-display font-bold tabular-nums text-foreground">{b}</span>
    </div>
  );
}

function TeamCrest({ team, fallback }: { team?: TeamMeta; fallback: string }) {
  const name = team?.name ?? fallback;
  return (
    <span title={name} className="flex shrink-0 items-center">
      <ClubLogo
        logoUrl={team?.logoUrl}
        primaryColor={team?.primaryColor}
        secondaryColor={team?.secondaryColor}
        className="w-8 h-8 rounded-full shrink-0"
        imgClassName="w-full h-full object-contain p-0.5"
      />
      <span className="sr-only">{name}</span>
    </span>
  );
}

/**
 * Live "Resumo" panel of the match screen (Etapa 12, #17/#19): team stats for both sides and the
 * event feed with minutes. Dumb component — `MatchScreen` collects the feed and the numbers.
 */
export function MatchSummaryPanel({
  teamA,
  teamB,
  statsA,
  statsB,
  possessionA,
  feed,
  extra,
  referee,
}: {
  /** Displayed left (home) and right sides: crest, colours and name (tooltip / screen readers). */
  teamA?: TeamMeta;
  teamB?: TeamMeta;
  statsA: SummaryTeamStats;
  statsB: SummaryTeamStats;
  /** Share of possession of team A, 0..1 (B = 1 − A). */
  possessionA: number;
  feed: MatchFeedItem[];
  /** Extra block below the feed (the live heat map, Etapa 35; below the feed since #127). */
  extra?: ReactNode;
  /** Referee of the match (`referees.md`): face, name and flag under the team names. */
  referee?: RefereeBadgeData | null;
}) {
  const { t } = useTranslation();
  const pA = Math.round(possessionA * 100);
  const cards = (s: SummaryTeamStats) => `${s.yellowCards} / ${s.redCards}`;
  return (
    <aside className="w-64 card-arcade border-l border-border flex flex-col shrink-0 min-h-0 overflow-y-auto">
      {/* Crests instead of the (often long) names (#128), home side on the left (#98): the name stays in
          the tooltip and for screen readers. */}
      <div className="px-4 pt-3 pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <TeamCrest team={teamA} fallback="A" />
          <h3 className="font-display font-black uppercase text-xl leading-none m-0 text-center">{t("match.summary.title")}</h3>
          <TeamCrest team={teamB} fallback="B" />
        </div>
        {referee && (
          <div className="mt-3" title={t("referees.referee")}>
            <RefereeBadge referee={referee} size={32} compact />
          </div>
        )}
      </div>
      <div className="px-4">
        <StatRow label={t("match.summary.possession")} a={`${pA}%`} b={`${100 - pA}%`} />
        <StatRow label={t("match.summary.shots")} a={statsA.shots} b={statsB.shots} />
        <StatRow label={t("match.summary.passes")} a={statsA.passesCompleted} b={statsB.passesCompleted} />
        <StatRow label={t("match.summary.fouls")} a={statsA.fouls} b={statsB.fouls} />
        <StatRow label={t("match.summary.cards")} a={cards(statsA)} b={cards(statsB)} />
        <StatRow label={t("match.summary.corners")} a={statsA.corners} b={statsB.corners} />
        <StatRow label={t("match.summary.freeKicks")} a={statsA.freeKicks} b={statsB.freeKicks} />
        <StatRow label={t("match.summary.offsides")} a={statsA.offsides} b={statsB.offsides} />
      </div>
      <div className="px-4 pt-4 pb-1">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("match.summary.events")}
        </span>
      </div>
      {/* The feed scrolls on its own and never shrinks below ~5 lines (#127): before, the panel scrolled
          as a whole and the feed (`min-h-0`) was squeezed to nothing under the heat map. */}
      <ol className="flex-1 min-h-[9rem] overflow-y-auto px-4 pb-3 m-0 list-none">
        {feed.length === 0 && <li className="text-sm text-muted-foreground py-2">{t("match.summary.noEvents")}</li>}
        {[...feed].reverse().map((e, i) => (
          <li
            key={`${e.minute}-${e.kind}-${i}`}
            className={`flex items-start gap-2 border-t border-border py-1.5 text-sm ${e.team === "B" ? "flex-row-reverse text-right" : ""}`}
          >
            <span className="w-8 shrink-0 font-display font-bold tabular-nums text-muted-foreground">{e.minute}'</span>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_MARK[e.kind]}`} aria-hidden />
            <span className="min-w-0 flex-1 text-foreground">
              {t(`match.summary.kind.${e.kind}`, { player: shirtName(e.player), playerIn: e.playerIn ? shirtName(e.playerIn) : "" })}
            </span>
          </li>
        ))}
      </ol>
      {extra && <div className="shrink-0 px-4 pt-3 pb-4 border-t border-border">{extra}</div>}
    </aside>
  );
}
