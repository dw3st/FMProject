import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture, IccConfed, IccEntrant, IccMatch, IntercontinentalMetaData } from "@/types/calendarTypes";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { formatGameDate } from "@/GameInterface/formatDate";
import { competitionName } from "@/Domain/world/labels";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";

/** Response of `GET /api/saves/:id/intercontinental` (`IntercontinentalView`, src/backend/intercontinentalWorld.ts). */
interface IccData {
  years: number[];
  year: number;
  meta: IntercontinentalMetaData;
  fixtures: Fixture[];
  names: Record<string, string>;
  entrants: Record<IccConfed, IccEntrant & { name: string | null }>;
  current: boolean;
}

const CONFED_ORDER: IccConfed[] = ["UEFA", "CONMEBOL", "CONCACAF", "CAF", "AFC", "OFC"];

/** The Intercontinental Cup: year picker, champion, the six entrants and the five-match bracket. */
export function IntercontinentalView({ saveId, myClubId }: { saveId: string; myClubId: string }) {
  const { t } = useTranslation();
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<IccData | null>(null);
  const [state, setState] = useState<"loading" | "none" | "error" | "ok">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/saves/${saveId}/intercontinental${year ? `?year=${year}` : ""}`)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 404) { setState("none"); return; }
        if (!res.ok) { setState("error"); return; }
        setData(await res.json() as IccData);
        setState("ok");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [saveId, year]);

  if (state === "none") return <p className="text-muted-foreground text-sm p-6">{t("intercontinental.none")}</p>;
  if (state === "error") return <p className="text-destructive text-sm p-6">{t("warnings.errors.loadFailed")}</p>;
  if (state === "loading" || !data) return <p className="text-muted-foreground text-sm p-6">…</p>;

  const name = (id: string | null | undefined) => (id ? data.names[id] ?? id : "");
  return (
    <div className="space-y-6">
      {data.years.length > 1 && (
        <div>
          <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">{t("intercontinental.year")}</p>
          <SegmentedTabs
            compact wrap
            tabs={data.years.map((y) => ({ key: String(y), label: String(y) }))}
            active={String(data.year)}
            onChange={(k) => setYear(Number(k))}
          />
        </div>
      )}

      {data.meta.championId && (
        <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 px-4 py-3 text-sm flex items-center gap-3">
          <ClubLogo logoUrl={squadLogoUrl(data.meta.championId)} className="w-8 h-8 rounded-full shrink-0" imgClassName="w-full h-full object-contain" />
          <span className="text-muted-foreground">{t("intercontinental.champion")} {data.year}:</span>
          <span className="font-bold text-chart-4">{name(data.meta.championId)}</span>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("intercontinental.entrants")}</h3>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {CONFED_ORDER.map((c) => <EntrantCard key={c} confed={c} entrant={data.entrants[c]} mine={data.entrants[c]?.clubId === myClubId} />)}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("continental.knockout")}</h3>
        <div className={TABLE_STYLE.shell}>
          <div className={TABLE_STYLE.body}>
            {[...data.meta.matches].sort((a, b) => a.n - b.n).map((m) => (
              <MatchRow key={m.n} match={m} fixture={data.fixtures.find((f) => f.round === m.round)} name={name} myClubId={myClubId} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function EntrantCard({ confed, entrant, mine }: { confed: IccConfed; entrant?: IccEntrant & { name: string | null }; mine: boolean }) {
  const { t, i18n } = useTranslation();
  const leagues = useLeagueCatalog();
  const source = entrant?.source;
  const via = !entrant?.clubId || !source ? t("intercontinental.bye")
    : entrant.position && entrant.position > 1 ? t("intercontinental.via.runnerUp", { source: competitionName(source, leagues, i18n.language) })
    : source === "ucl" || source === "lib" ? t(`intercontinental.via.${source}`)
    : t("intercontinental.via.league", { league: competitionName(source, leagues, i18n.language) });
  return (
    <div className={`rounded-md border p-3 flex items-center gap-3 ${mine ? "border-primary ring-1 ring-primary bg-primary/10" : "border-border bg-card"}`}>
      {entrant?.clubId
        ? <ClubLogo logoUrl={squadLogoUrl(entrant.clubId)} className="w-10 h-10 rounded-full shrink-0" imgClassName="w-full h-full object-contain" />
        : <div className="w-10 h-10 rounded-full border border-dashed border-border shrink-0" />}
      <div className="min-w-0">
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t(`intercontinental.confed.${confed}`)}</p>
        <p className={`m-0 font-semibold truncate ${mine ? "text-primary" : "text-foreground"}`}>{entrant?.name ?? t("intercontinental.bye")}</p>
        <p className="m-0 text-sm text-muted-foreground truncate">{via}</p>
      </div>
    </div>
  );
}

function MatchRow({ match, fixture, name, myClubId }: {
  match: IccMatch; fixture?: Fixture; name: (id: string | null | undefined) => string; myClubId: string;
}) {
  const { t, i18n } = useTranslation();
  const side = (id: string | null | undefined) =>
    id === undefined ? <span className="text-muted-foreground">{t("intercontinental.notDrawn")}</span>
    : id === null ? <span className="text-muted-foreground">{t("intercontinental.bye")}</span>
    : (
      <span className={`flex items-center gap-2 min-w-0 ${match.winner === id ? "font-bold text-foreground" : "text-foreground"}`}>
        <ClubLogo logoUrl={squadLogoUrl(id)} className="w-8 h-8 rounded-full shrink-0" imgClassName="w-full h-full object-contain" />
        <span className="truncate">{name(id)}</span>
      </span>
    );
  const played = fixture?.played && fixture.result;
  const mine = match.home === myClubId || match.away === myClubId;
  const decider = fixture?.decider;
  return (
    <div className={`px-4 py-3 ${mine ? TABLE_STYLE.rowHighlight : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 mb-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t(`intercontinental.stage.${match.name}`)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{formatGameDate(match.date, i18n.language, "dayMonthLong")} · {t("intercontinental.neutral")}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0">{side(match.home)}</div>
        <div className="font-display font-bold text-xl tabular-nums text-center min-w-[4rem]">
          {played ? `${fixture!.result!.home}–${fixture!.result!.away}` : t("leagues.vs")}
        </div>
        <div className="min-w-0 flex justify-end">{side(match.away)}</div>
      </div>
      {decider && (
        <p className="m-0 mt-1 text-sm text-muted-foreground text-center">
          {decider.penalties ? t("cups.pens", { home: decider.penalties.home, away: decider.penalties.away }) : t("cups.aet")}
        </p>
      )}
    </div>
  );
}
