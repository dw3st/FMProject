import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { JobOfferCard } from "@/GameInterface/Components/JobOfferCard";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import type { JobOffer, Unemployment } from "@/types/jobTypes";
import type { LeagueData } from "@/types/playerTypes";

interface JobsResponse {
  reputation: number;
  offers: JobOffer[];
  unemployed: Unemployment | null;
}

/**
 * The manager has no club (`.claude/rules/game/jobs.md`): every club screen shows this instead —
 * the club he left, his reputation, the pending offers (Accept / Decline) and when the next batch
 * arrives. Continue ("Wait for offers") keeps advancing the days.
 */
export function NoClubScreen() {
  const { t, i18n } = useTranslation();
  const { session, save, currentDate } = useGameSave();
  const [jobs, setJobs] = useState<JobsResponse | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const saveId = session?.saveId;

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/jobs`)
      .then((r) => (r.ok ? (r.json() as Promise<JobsResponse>) : null))
      .catch(() => null)
      .then((d) => { if (!cancelled) setJobs(d); });
    return () => { cancelled = true; };
  }, [saveId, currentDate]);

  const unemployed = save?.unemployed ?? null;
  const label = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

  return (
    <ScreenContainer>
      <ScreenTitle
        accent={t("screenTitles.noClub.accent")}
        subtitle={unemployed
          ? t("jobs.noClub.subtitle", { club: unemployed.lastClubName, date: formatDay(unemployed.since, i18n.language, "year") })
          : undefined}
      >
        {t("screenTitles.noClub.main")}
      </ScreenTitle>

      <section className="flex flex-wrap gap-8">
        <div className="flex flex-col gap-1">
          <span className={label}>{t("jobs.reputation")}</span>
          <span className="font-display font-bold text-2xl tabular-nums leading-none">{jobs ? Math.round(jobs.reputation) : "—"}</span>
        </div>
        {unemployed && (
          <div className="flex flex-col gap-1">
            <span className={label}>{t("jobs.noClub.nextOffers")}</span>
            <span className="font-display font-bold text-2xl tabular-nums leading-none">
              {formatDay(unemployed.nextOfferDate, i18n.language, "year")}
            </span>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>{t("jobs.noClub.offers")}</SectionTitle>
        {!jobs ? (
          <p className="text-sm text-muted-foreground m-0">{t("jobs.loading")}</p>
        ) : jobs.offers.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("jobs.noClub.none")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {jobs.offers.map((offer) => (
              <div key={offer.id} className="border border-border rounded-md p-4">
                <JobOfferCard
                  saveId={saveId!}
                  offer={offer}
                  leagues={leagues}
                  pending
                  currentClubName={null}
                />
              </div>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground m-0">{t("jobs.noClub.hint")}</p>
      </section>
    </ScreenContainer>
  );
}
