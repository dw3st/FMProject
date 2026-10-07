import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { LeagueData } from "@/types/playerTypes";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { competitionName } from "@/Domain/world/labels";
import { matchHeading } from "@/Domain/world/matchHeading";

/** Fetches the league catalog and (for a cup / continental tie) its meta, and returns the match heading. */
export function useMatchHeading(saveId: string | undefined, fixture: Fixture | null, clubId: string | undefined): string | null {
  const { t, i18n } = useTranslation();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [meta, setMeta] = useState<LeagueSeasonMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leagues")
      .then((r) => (r.ok ? (r.json() as Promise<LeagueData[]>) : []))
      .catch(() => [] as LeagueData[])
      .then((data) => { if (!cancelled) setLeagues(data); });
    return () => { cancelled = true; };
  }, []);

  const competition = fixture?.competition;
  useEffect(() => {
    setMeta(null);
    if (!saveId || !competition) return;
    const path = isCupSlug(competition) ? "cups" : isContinentalSlug(competition) ? "continental" : null;
    if (!path) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/${path}/${competition}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ meta: LeagueSeasonMeta }>) : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setMeta(data?.meta ?? null); });
    return () => { cancelled = true; };
  }, [saveId, competition]);

  if (!fixture) return null;
  const cupStage = meta?.cup?.stages.find((s) => s.round === fixture.round)?.name;
  const continentalStage = meta?.continental?.stages.find((s) => s.rounds.includes(fixture.round))?.name;
  const continentalGroup = clubId ? meta?.continental?.groups.find((g) => g.clubs.includes(clubId))?.name : undefined;
  return matchHeading(
    { fixture, competition: competitionName(fixture.competition, leagues, i18n.language), cupStage, continentalStage, continentalGroup },
    t,
  );
}
