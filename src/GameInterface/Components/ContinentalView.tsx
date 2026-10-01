import { useTranslation } from "react-i18next";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { GroupRow } from "@/Domain/continental/groupTable";
import { finalWinner, tieWinner } from "@/Domain/continental/knockout";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";

/** Response shape of `GET /api/saves/:id/continental/:slug` (see Task 2 Step 5 of the UI plan). */
export interface ContinentalData {
  meta: LeagueSeasonMeta;
  fixtures: Fixture[];
  names: Record<string, string>;
  groups: { name: string; rows: GroupRow[] }[];
}

/** Knockout stages in bracket order — the group stage is rendered separately above. */
const KNOCKOUT_STAGE_NAMES = ["r16", "qf", "sf", "final"] as const;

/** Groups a stage's fixtures into legs of the same tie, sorted leg 1 then leg 2. Final has no tieId. */
function legsByTie(fixtures: Fixture[], rounds: number[]): Fixture[][] {
  const inStage = fixtures.filter((f) => rounds.includes(f.round));
  const byTie = new Map<string, Fixture[]>();
  for (const f of inStage) {
    if (!f.tieId) continue;
    byTie.set(f.tieId, [...(byTie.get(f.tieId) ?? []), f]);
  }
  return [...byTie.values()].map((legs) => [...legs].sort((a, b) => (a.leg ?? 0) - (b.leg ?? 0)));
}

/** Aggregate totals in leg1's home/away order (so "agg. 3–2" always reads the same two clubs). */
function tieAggregate(leg1: Fixture, leg2: Fixture): { home: number; away: number } | null {
  if (!leg1.result || !leg2.result) return null;
  const goalsBy = (team: string, f: Fixture) => (f.home === team ? f.result!.home : f.result!.away);
  return {
    home: goalsBy(leg1.home, leg1) + goalsBy(leg1.home, leg2),
    away: goalsBy(leg1.away, leg1) + goalsBy(leg1.away, leg2),
  };
}

function LegScore({
  f,
  winner,
  name,
  vsLabel,
}: {
  f: Fixture;
  winner: string | null;
  name: (id: string) => string;
  vsLabel: string;
}) {
  const played = f.played && !!f.result;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={winner === f.home ? "font-bold text-white" : ""}>{name(f.home)}</span>{" "}
      <span className="text-foreground">{played ? `${f.result!.home}–${f.result!.away}` : vsLabel}</span>{" "}
      <span className={winner === f.away ? "font-bold text-white" : ""}>{name(f.away)}</span>
    </span>
  );
}

/** Champion banner + group tables + knockout bracket for one continental competition. Mirrors CupBracket. */
export function ContinentalView({ data, myClubId }: { data: ContinentalData; myClubId: string }) {
  const { t } = useTranslation();
  const continental = data.meta.continental!;
  const name = (id: string) => data.names[id] ?? id;
  const vsLabel = t("leagues.vs");

  const knockoutStages = continental.stages.filter(
    (s): s is typeof s & { name: (typeof KNOCKOUT_STAGE_NAMES)[number] } =>
      (KNOCKOUT_STAGE_NAMES as readonly string[]).includes(s.name),
  );

  return (
    <div className="space-y-6">
      {continental.championId && (
        <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t("continental.champion")}: </span>
          <span className="font-bold text-chart-4">{name(continental.championId)}</span>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("continental.groups")}</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {data.groups.map((group) => (
            <div key={group.name} className="rounded-lg border border-border bg-foreground/5 overflow-hidden">
              <header className="px-3 py-2 border-b border-border text-sm font-semibold text-foreground">
                {t("continental.group", { name: group.name })}
              </header>
              <div className="grid grid-cols-[24px_1fr_32px_36px_36px] gap-2 px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
                <div />
                <div>{t("leagues.club")}</div>
                <div className="text-center">{t("leagues.matches")}</div>
                <div className="text-center">{t("leagues.goalDifference")}</div>
                <div className="text-center">{t("leagues.points")}</div>
              </div>
              <div className="divide-y divide-border">
                {group.rows.map((row, idx) => {
                  const qualified = idx < 2;
                  const mine = row.squadId === myClubId;
                  return (
                    <div
                      key={row.squadId}
                      className={`grid grid-cols-[24px_1fr_32px_36px_36px] gap-2 items-center px-3 py-1.5 text-sm border-l-2 ${
                        qualified ? "border-chart-2" : "border-transparent"
                      } ${mine ? "bg-primary/10" : ""}`}
                    >
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        {qualified && <Icon name="check-circle" size={12} className="text-chart-2" />}
                        <span>{idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <ClubLogo
                          logoUrl={squadLogoUrl(row.squadId)}
                          className="w-8 h-8 rounded-full shrink-0"
                          imgClassName="w-full h-full object-contain"
                        />
                        <span className="truncate font-semibold text-foreground">{name(row.squadId)}</span>
                      </div>
                      <div className="text-center text-muted-foreground">{row.mp}</div>
                      <div className={`text-center font-semibold ${row.gd >= 0 ? "text-primary" : "text-destructive"}`}>
                        {row.gd > 0 ? `+${row.gd}` : row.gd}
                      </div>
                      <div className="text-center font-black text-primary">{row.pts}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("continental.knockout")}</h3>
        <div className="space-y-4">
          {knockoutStages.map((stage) => {
            const isFinal = stage.name === "final";
            const ties = isFinal ? [] : legsByTie(data.fixtures, stage.rounds);
            const finalFixture = isFinal
              ? data.fixtures.find((f) => stage.rounds.includes(f.round)) ?? null
              : null;
            const hasContent = isFinal ? !!finalFixture : ties.length > 0;

            return (
              <section key={stage.name} className="rounded-lg border border-border bg-foreground/5">
                <header className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <h4 className="text-sm font-semibold">{t(`continental.stage.${stage.name}`)}</h4>
                </header>
                {!stage.drawn || !hasContent ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">{t("continental.notDrawn")}</p>
                ) : isFinal && finalFixture ? (
                  <ul className="divide-y divide-border">
                    <li
                      className={`px-4 py-2 text-sm ${
                        finalFixture.home === myClubId || finalFixture.away === myClubId ? "bg-primary/10" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <LegScore f={finalFixture} winner={finalWinner(finalFixture)} name={name} vsLabel={vsLabel} />
                        <span className="text-sm text-muted-foreground">{t("cups.neutral")}</span>
                      </div>
                      {finalFixture.decider && (
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {finalFixture.decider.penalties
                            ? t("cups.pens", {
                                home: finalFixture.decider.penalties.home,
                                away: finalFixture.decider.penalties.away,
                              })
                            : t("cups.aet")}
                        </div>
                      )}
                    </li>
                  </ul>
                ) : (
                  <ul className="divide-y divide-border">
                    {ties.map((legs) => {
                      const leg1 = legs[0]!;
                      const leg2 = legs[1];
                      const mine = legs.some((f) => f.home === myClubId || f.away === myClubId);
                      const winner = leg2 ? tieWinner(leg1, leg2) : null;
                      const agg = leg2 ? tieAggregate(leg1, leg2) : null;
                      const decider = leg2?.decider;
                      return (
                        <li key={leg1.tieId} className={`px-4 py-2 text-sm ${mine ? "bg-primary/10" : ""}`}>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <LegScore f={leg1} winner={winner} name={name} vsLabel={vsLabel} />
                            {leg2 && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <LegScore f={leg2} winner={winner} name={name} vsLabel={vsLabel} />
                              </>
                            )}
                            {agg && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">
                                  {t("continental.aggregateNamed", {
                                    homeName: name(leg1.home), home: agg.home,
                                    away: agg.away, awayName: name(leg1.away),
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                          {decider && (
                            <div className="text-sm text-muted-foreground mt-0.5">
                              {decider.penalties
                                ? t("continental.pensNamed", {
                                    homeName: name(leg2!.home), home: decider.penalties.home,
                                    away: decider.penalties.away, awayName: name(leg2!.away),
                                  })
                                : t("cups.aet")}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
