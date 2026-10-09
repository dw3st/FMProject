import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { Flag } from "@/GameInterface/Components/Flag";
import { RefereeBandLabel, RefereeFace } from "@/GameInterface/Referees/RefereeBadge";
import { fetchReferees } from "@/GameInterface/Referees/refereesApi";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import { ALL_COMPETITIONS } from "@/Domain/stats/rankings";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { RefereesResponse } from "@/backend/refereeRoutes";
import type { CountryEntry } from "@/types/worldTypes";
import type { LeagueData } from "@/types/playerTypes";

const CURRENT = "current";

/** "Árbitros" tab of the Stats screen (`.claude/rules/game/referees.md`): cards per match by referee. */
export function RefereesTab({ saveId, leagues, countryByName, refreshKey }: {
  saveId: string;
  leagues: LeagueData[];
  countryByName: Map<string, CountryEntry>;
  refreshKey?: string;
}) {
  const { t, i18n } = useTranslation();
  const [competition, setCompetition] = useState<string>(ALL_COMPETITIONS);
  const [season, setSeason] = useState<string>(CURRENT);
  const [data, setData] = useState<RefereesResponse | null | undefined>(undefined);
  const [error, setError] = useState(false);

  const competitions = useMemo(
    () => (leagues.length > 0 ? statsCompetitionOptions(leagues, countryByName, i18n.language, t) : []),
    [leagues, countryByName, i18n.language, t],
  );

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setError(false);
    fetchReferees(saveId, competition, season === CURRENT ? null : season)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [saveId, competition, season, refreshKey]);

  const seasons = [{ value: CURRENT, label: t("referees.currentSeason") }, ...(data?.seasons ?? []).map((s) => ({ value: s, label: s }))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {competitions.length > 0 && (
          <SelectCombobox
            label={t("statsScreen.competition")}
            labelId="referees-competition"
            value={competition}
            onChange={setCompetition}
            options={competitions}
            placeholder={t("leagues.searchLeaguesPlaceholder")}
            className="w-full max-w-sm"
          />
        )}
        <SelectCombobox
          label={t("referees.season")}
          labelId="referees-season"
          value={season}
          onChange={setSeason}
          options={seasons}
          className="w-full max-w-[12rem]"
        />
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p>
      ) : data === undefined ? (
        <p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("referees.empty")}</p>
      ) : (
        <StatsTable
          head={
            <>
              <StatsHead align="center">#</StatsHead>
              <StatsHead className="w-12"><span className="sr-only">{t("referees.face")}</span></StatsHead>
              <StatsHead>{t("referees.referee")}</StatsHead>
              <StatsHead>{t("referees.rigor")}</StatsHead>
              <StatsHead align="center" title={t("referees.matchesLong")}>{t("referees.matches")}</StatsHead>
              <StatsHead align="center" title={t("referees.foulsLong")}>{t("referees.fouls")}</StatsHead>
              <StatsHead align="center" title={t("referees.yellowsLong")}>{t("referees.yellows")}</StatsHead>
              <StatsHead align="center" title={t("referees.redsLong")}>{t("referees.reds")}</StatsHead>
              <StatsHead align="center" title={t("referees.penaltiesLong")}>{t("referees.penalties")}</StatsHead>
            </>
          }
        >
          {data.items.map((r, i) => {
            const flag = nationalityFlagCode(r.country);
            const mine = r.id === data.nextRefereeId;
            return (
              <StatsRow key={r.id} highlight={mine}>
                <RankCell rank={i + 1} />
                <StatsCell className="w-12"><RefereeFace referee={r} size={32} /></StatsCell>
                <NameCell highlight={mine}>
                  <span className="truncate">{r.name}</span>
                  {flag && <Flag code={flag} />}
                </NameCell>
                <StatsCell><RefereeBandLabel band={r.band} /></StatsCell>
                <NumberCell>{r.matches}</NumberCell>
                <NumberCell>{r.foulsPerMatch.toFixed(1)}</NumberCell>
                <NumberCell strong>{r.yellowsPerMatch.toFixed(2)}</NumberCell>
                <NumberCell>{r.reds}</NumberCell>
                <NumberCell>{r.penalties}</NumberCell>
              </StatsRow>
            );
          })}
        </StatsTable>
      )}
      {data?.nextRefereeId && <p className="text-sm text-muted-foreground m-0">{t("referees.nextHighlighted")}</p>}
    </div>
  );
}
