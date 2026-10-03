import { useTranslation } from "react-i18next";
import type { TeamId } from "@/GameEngine/types";

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
  yellow: "bg-chart-4",
  red: "bg-destructive",
  offside: "bg-muted-foreground",
  sub: "bg-chart-2",
  injury: "bg-destructive",
};

function StatRow({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  return (
    <div className="flex items-center justify-between border-t border-border py-1.5 text-sm">
      <span className="w-12 font-display font-bold tabular-nums text-foreground">{a}</span>
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className="w-12 text-right font-display font-bold tabular-nums text-foreground">{b}</span>
    </div>
  );
}

/**
 * Live "Resumo" panel of the match screen (Etapa 12, #17/#19): team stats for both sides and the
 * event feed with minutes. Dumb component — `MatchScreen` collects the feed and the numbers.
 */
export function MatchSummaryPanel({
  nameA,
  nameB,
  colorA,
  colorB,
  statsA,
  statsB,
  possessionA,
  feed,
}: {
  nameA?: string;
  nameB?: string;
  colorA: string;
  colorB: string;
  statsA: SummaryTeamStats;
  statsB: SummaryTeamStats;
  /** Share of possession of team A, 0..1 (B = 1 − A). */
  possessionA: number;
  feed: MatchFeedItem[];
}) {
  const { t } = useTranslation();
  const pA = Math.round(possessionA * 100);
  const cards = (s: SummaryTeamStats) => `${s.yellowCards} / ${s.redCards}`;
  return (
    <aside className="w-72 border-l border-border bg-card/40 flex flex-col shrink-0 min-h-0">
      <div className="px-3 pt-3 pb-2">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("match.summary.title")}</h3>
        <div className="mt-2 flex items-center justify-between text-sm font-semibold">
          <span className="truncate" style={{ color: colorA }}>{nameA ?? "A"}</span>
          <span className="truncate text-right" style={{ color: colorB }}>{nameB ?? "B"}</span>
        </div>
      </div>
      <div className="px-3">
        <StatRow label={t("match.summary.possession")} a={`${pA}%`} b={`${100 - pA}%`} />
        <StatRow label={t("match.summary.shots")} a={statsA.shots} b={statsB.shots} />
        <StatRow label={t("match.summary.passes")} a={statsA.passesCompleted} b={statsB.passesCompleted} />
        <StatRow label={t("match.summary.fouls")} a={statsA.fouls} b={statsB.fouls} />
        <StatRow label={t("match.summary.cards")} a={cards(statsA)} b={cards(statsB)} />
        <StatRow label={t("match.summary.corners")} a={statsA.corners} b={statsB.corners} />
        <StatRow label={t("match.summary.freeKicks")} a={statsA.freeKicks} b={statsB.freeKicks} />
        <StatRow label={t("match.summary.offsides")} a={statsA.offsides} b={statsB.offsides} />
      </div>
      <div className="px-3 pt-4 pb-1">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("match.summary.events")}
        </span>
      </div>
      <ol className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 m-0 list-none">
        {feed.length === 0 && <li className="text-sm text-muted-foreground py-2">{t("match.summary.noEvents")}</li>}
        {[...feed].reverse().map((e, i) => (
          <li
            key={`${e.minute}-${e.kind}-${i}`}
            className={`flex items-start gap-2 border-t border-border py-1.5 text-sm ${e.team === "B" ? "flex-row-reverse text-right" : ""}`}
          >
            <span className="w-8 shrink-0 font-display font-bold tabular-nums text-muted-foreground">{e.minute}'</span>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_MARK[e.kind]}`} aria-hidden />
            <span className="min-w-0 flex-1 text-foreground">
              {t(`match.summary.kind.${e.kind}`, { player: e.player, playerIn: e.playerIn ?? "" })}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
