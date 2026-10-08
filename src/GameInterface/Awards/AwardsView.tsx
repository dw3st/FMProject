import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { AwardBadge } from "@/GameInterface/Awards/AwardBadge";
import { goalOfSeasonText, managerResultText } from "@/GameInterface/Awards/awardsText";
import { useAwards } from "@/GameInterface/Awards/awardsApi";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import { competitionName } from "@/Domain/world/labels";
import type { AwardedPlayer, LeagueAwardKind, LeagueSeasonAwards, WorldAwardEntry, WorldAwards } from "@/types/awardTypes";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";


/** Card of one individual award: badge, crest + player (link) + club, the number that won it. */
function AwardCard({ kind, p, league, value, mine }: { kind: LeagueAwardKind; p: AwardedPlayer; league: string; value: string; mine: boolean }) {
  return (
    <section className={`card-arcade rounded-md p-4 flex flex-col gap-3 min-w-0 ${mine ? "ring-1 ring-primary" : ""}`}>
      <div><AwardBadge kind={kind} /></div>
      <div className="flex items-center gap-3 min-w-0">
        <ClubLogo logoUrl={squadLogoUrl(p.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
        <div className="min-w-0">
          <a
            href={playerHref(p.playerId, p.squadId, league)}
            className={`block truncate font-semibold no-underline hover:underline ${mine ? "text-primary" : "text-foreground"}`}
          >
            {p.name}
          </a>
          <span className="block truncate text-sm text-muted-foreground">{p.clubName}</span>
        </div>
        <span className="ml-auto font-display font-bold tabular-nums text-2xl text-primary">{value}</span>
      </div>
    </section>
  );
}

function WorldTable({ kind, rows, isPlayer }: { kind: "world_player" | "world_manager"; rows: WorldAwardEntry[]; isPlayer: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div><AwardBadge kind={kind} /></div>
      <StatsTable
        head={<>
          <StatsHead align="center">#</StatsHead>
          <StatsHead />
          <StatsHead>{isPlayer ? t("statsScreen.awards.player") : t("statsScreen.managers.name")}</StatsHead>
          <StatsHead>{t("statsScreen.awards.club")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.managers.points")}</StatsHead>
        </>}
      >
        {rows.slice(0, 3).map((e, i) => (
          <StatsRow key={e.id}>
            <RankCell rank={i + 1} />
            <CrestCell squadId={e.squadId} />
            <NameCell href={isPlayer ? playerHref(e.id, e.squadId, e.league) : undefined}>{e.name}</NameCell>
            <ClubCell>{e.clubName}</ClubCell>
            <NumberCell strong={i === 0}>{e.score.toFixed(2)}</NumberCell>
          </StatsRow>
        ))}
      </StatsTable>
    </div>
  );
}

function WorldBlock({ world, year, pending }: { world: WorldAwards | null; year: number; pending: boolean }) {
  const { t } = useTranslation();
  if (!world) {
    return pending ? <p className="text-sm text-muted-foreground m-0">{t("statsScreen.awards.worldPending", { year })}</p> : null;
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("statsScreen.awards.worldTitle", { year: world.year })}</SectionTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <WorldTable kind="world_player" rows={world.player} isPlayer />
        <WorldTable kind="world_manager" rows={world.manager} isPlayer={false} />
      </div>
    </section>
  );
}

function LeagueBlock({ a, leagueName, myClubId }: { a: LeagueSeasonAwards; leagueName: string; myClubId: string }) {
  const { t } = useTranslation();
  const mine = (squadId: string) => !!myClubId && squadId === myClubId;
  const singles: [LeagueAwardKind, AwardedPlayer | undefined][] = [
    ["best_player", a.bestPlayer], ["young_player", a.youngPlayer], ["top_scorer", a.topScorer], ["best_goalkeeper", a.bestGoalkeeper],
  ];
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>{leagueName} <span className="text-primary">{a.season}</span></SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {singles.map(([kind, p]) => p && (
          <AwardCard
            key={kind} kind={kind} p={p} league={a.league} mine={mine(p.squadId)}
            value={kind === "top_scorer" ? String(p.value) : p.value.toFixed(2)}
          />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {a.teamOfSeason.length > 0 && (
          <div className="flex flex-col gap-2 min-w-0">
            <div><AwardBadge kind="team_of_season" /></div>
            <StatsTable
              head={<>
                <StatsHead align="center">{t("statsScreen.awards.slot")}</StatsHead>
                <StatsHead />
                <StatsHead>{t("statsScreen.awards.player")}</StatsHead>
                <StatsHead>{t("statsScreen.awards.club")}</StatsHead>
                <StatsHead align="center">{t("statsScreen.awards.rating")}</StatsHead>
              </>}
            >
              {a.teamOfSeason.map((p, i) => (
                <StatsRow key={`${p.playerId}-${i}`} highlight={mine(p.squadId)}>
                  <StatsCell align="center" className={`font-bold ${getDetailedPositionColor(p.slot ?? "")}`}>
                    {p.slot ? t(`roles.detailedAbbr.${p.slot}`, { defaultValue: p.slot }) : "—"}
                  </StatsCell>
                  <CrestCell squadId={p.squadId} />
                  <NameCell href={playerHref(p.playerId, p.squadId, a.league)} highlight={mine(p.squadId)}>{p.name}</NameCell>
                  <ClubCell>{p.clubName}</ClubCell>
                  <NumberCell strong>{p.value.toFixed(2)}</NumberCell>
                </StatsRow>
              ))}
            </StatsTable>
          </div>
        )}
        <div className="flex flex-col gap-4 min-w-0">
          {a.bestManager && (
            <section className={`card-arcade rounded-md p-4 flex flex-col gap-3 ${mine(a.bestManager.squadId) ? "ring-1 ring-primary" : ""}`}>
              <div><AwardBadge kind="best_manager" /></div>
              <div className="flex items-center gap-3 min-w-0">
                <ClubLogo logoUrl={squadLogoUrl(a.bestManager.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
                <div className="min-w-0">
                  <span className={`block truncate font-semibold ${mine(a.bestManager.squadId) ? "text-primary" : "text-foreground"}`}>{a.bestManager.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{a.bestManager.clubName} · {managerResultText(a.bestManager, t)}</span>
                </div>
              </div>
            </section>
          )}
          {a.goalOfSeason && (
            <section className={`card-arcade rounded-md p-4 flex flex-col gap-3 ${mine(a.goalOfSeason.squadId) ? "ring-1 ring-primary" : ""}`}>
              <div><AwardBadge kind="goal_of_season" /></div>
              <div className="flex items-center gap-3 min-w-0">
                <ClubLogo logoUrl={squadLogoUrl(a.goalOfSeason.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
                <a
                  href={playerHref(a.goalOfSeason.playerId, a.goalOfSeason.squadId, a.league)}
                  className="text-sm text-foreground no-underline hover:underline"
                >
                  {goalOfSeasonText(a.goalOfSeason, t)}
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

/** Stats → Awards tab (`.claude/rules/game/awards.md` → Telas). */
export function AwardsView({
  saveId, leagues, countryByName, myClubId, ownLeague, currentDate,
}: {
  saveId: string;
  leagues: LeagueData[];
  countryByName: ReadonlyMap<string, CountryEntry>;
  myClubId: string;
  ownLeague: string;
  currentDate: string;
}) {
  const { t, i18n } = useTranslation();
  const [year, setYear] = useState<number | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  const state = useAwards(saveId, year, currentDate);

  const data = state.status === "ok" ? state.data : null;
  const available = useMemo(() => new Set(data?.leagues.map((l) => l.league) ?? []), [data]);
  const leagueOptions = useMemo(() => {
    if (!data) return [];
    const opts = leagues.length > 0
      ? statsCompetitionOptions(leagues, countryByName, i18n.language, t).filter((o) => available.has(o.value))
      : [];
    // A league no longer in the catalogue still shows, at the end.
    const listed = new Set(opts.map((o) => o.value));
    for (const l of data.leagues) if (!listed.has(l.league)) opts.push({ value: l.league, label: competitionName(l.league, leagues, i18n.language) });
    return opts;
  }, [data, leagues, countryByName, i18n.language, t, available]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground m-0">{t("statsScreen.loading")}</p>;
  if (state.status === "error") return <p className="text-sm text-muted-foreground m-0">{t("statsScreen.awards.loadFailed")}</p>;
  if (state.status === "empty" || !data) return <p className="text-sm text-muted-foreground m-0">{t("statsScreen.awards.empty")}</p>;

  const activeLeague = league && available.has(league) ? league
    : available.has(ownLeague) ? ownLeague
    : leagueOptions[0]?.value ?? data.leagues[0]?.league ?? "";
  const entries = data.leagues.filter((l) => l.league === activeLeague);
  const yearOptions = [...data.years].reverse().map((y) => ({ value: String(y), label: String(y) }));
  const currentYear = Number(currentDate.slice(0, 4));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <SelectCombobox
          label={t("statsScreen.awards.year")}
          labelId="awards-year"
          value={String(data.year)}
          onChange={(v) => setYear(Number(v))}
          options={yearOptions}
          className="w-40"
        />
        {leagueOptions.length > 0 && (
          <SelectCombobox
            label={t("statsScreen.awards.league")}
            labelId="awards-league"
            value={activeLeague}
            onChange={setLeague}
            options={leagueOptions}
            placeholder={t("leagues.searchLeaguesPlaceholder")}
            className="w-full max-w-sm"
          />
        )}
      </div>
      <WorldBlock world={data.world} year={data.year} pending={data.year >= currentYear} />
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("statsScreen.awards.noLeague", { year: data.year })}</p>
      ) : (
        entries.map((a) => (
          <LeagueBlock
            key={`${a.league}-${a.season}`}
            a={a}
            leagueName={competitionName(a.league, leagues, i18n.language)}
            myClubId={myClubId}
          />
        ))
      )}
    </div>
  );
}
