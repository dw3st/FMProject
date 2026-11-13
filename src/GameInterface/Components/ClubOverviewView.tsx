import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { stadiumArtFile } from "@/Domain/facilities/stadiumArt";
import { formatEurosDetailed } from "@/Domain/money";
import { toDisplayPlayer } from "@/Domain/scout/displayPlayer";
import { attrDisplay } from "@/Domain/attributes";
import { competitionName } from "@/Domain/world/labels";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { PlayerNameLink } from "@/GameInterface/Inbox/PlayerNameText";
import { managerHref } from "@/GameInterface/ManagerScreen";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import type { ClubOverview } from "@/types/clubOverviewTypes";
import { SponsorPlate } from "@/GameInterface/Sponsors/SponsorPlate";
import type { LeagueData, Squad } from "@/types/playerTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** Job security badge colours: 1 very secure … 5 under heavy threat, vacant = an interim. */
const LEVEL_CLASS: Record<string, string> = {
  "1": "bg-primary/15 text-primary",
  "2": "bg-primary/10 text-primary",
  "3": "bg-secondary text-muted-foreground",
  "4": "bg-chart-4/15 text-chart-4",
  "5": "bg-destructive/15 text-destructive",
  vacant: "bg-chart-2/15 text-chart-2",
};

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-md border border-border bg-card p-5 flex flex-col gap-3 min-w-0 ${className}`}>{children}</section>;
}

function ConditionBar({ label, value }: { label: string; value: number }) {
  const color = value >= 40 ? "bg-primary" : value >= 15 ? "bg-chart-4" : "bg-destructive";
  return (
    <div className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 text-sm">
      <span>{label}</span>
      <span className="h-1.5 rounded bg-border overflow-hidden"><span className={`block h-full ${color}`} style={{ width: `${value}%` }} /></span>
      <span className="text-right font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

/**
 * Overview tab of any club's page (tester report, 8.9.30, mock option A): the manager with the job security and the
 * application, the stadium, the money, the season, the squad highlights and the honours.
 */
export function ClubOverviewView({ saveId, squad, onSquadTab }: { saveId: string; squad: Squad; onSquadTab: () => void }) {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const [data, setData] = useState<ClubOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [artFailed, setArtFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/saves/${saveId}/clubs/${encodeURIComponent(squad.id)}/overview`)
      .then((r) => (r.ok ? (r.json() as Promise<ClubOverview>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId, squad.id, reload]);

  useEffect(() => {
    void fetch("/api/leagues").then((r) => (r.ok ? r.json() : [])).then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const highlights = useMemo(() => squad.players
    .map((p) => toDisplayPlayer(p, squad.name, { currentDate: session?.currentDate }))
    .sort((a, b) => b.avg - a.avg || b.valueMillions - a.valueMillions)
    .slice(0, 5), [squad, session?.currentDate]);

  if (failed) return <p className="text-sm text-muted-foreground m-0">{t("warnings.errors.loadFailed")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>;

  const name = (slug: string) => competitionName(slug, leagues, i18n.language);
  const titleName = (title: string) => {
    const [kind, slug = ""] = title.split(":");
    return kind === "promotion" ? t("clubHistory.promotion", { league: name(slug) }) : name(slug);
  };
  const playerHref = (id: string) => `/player/${encodeURIComponent(data.leagueSlug)}/${encodeURIComponent(squad.id)}/${encodeURIComponent(id)}`;

  async function apply() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch(`/api/saves/${saveId}/job-applications`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ squadId: squad.id }),
      });
      if (r.ok) setNotice(t("jobPosts.sent"));
      else {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setNotice(t(`jobPosts.errors.${body.error ?? "generic"}`, { defaultValue: t("jobPosts.errors.generic") }));
      }
    } catch {
      setNotice(t("jobPosts.errors.generic"));
    }
    setBusy(false);
    setReload((n) => n + 1);
  }

  const job = data.job;
  const appliedHere = data.application?.squadId === squad.id;
  const canApply = !!job && job.level !== null && job.blocked === null && !data.application;
  const m = data.money;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
      <div className="flex flex-col gap-6 min-w-0">
        <Card>
          <SectionTitle>{t("clubOverview.manager")}</SectionTitle>
          {data.manager ? (
            <div className="flex items-center gap-4 min-w-0">
              <ManagerFaceImage manager={{ id: data.manager.id, name: data.manager.name, nationality: data.manager.nationality }} clubColors={squad.colors} size={64} />
              <div className="flex flex-col min-w-0">
                <a href={managerHref(data.manager.id)} className="font-display font-bold text-xl text-primary no-underline hover:underline truncate">{data.manager.name}</a>
                <span className="text-sm text-muted-foreground">
                  {data.manager.interim ? t("clubOverview.interim") : data.manager.since ? t("clubOverview.since", { date: formatDay(data.manager.since, i18n.language) }) : ""}
                </span>
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground m-0">{t("clubOverview.noManager")}</p>}
          {job && (
            <div className="flex flex-col gap-2">
              <span className={LABEL}>{t("jobPosts.security")}</span>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {job.level === null
                  ? <span className="text-muted-foreground">{t("jobPosts.humanManager")}</span>
                  : <span className={`inline-flex px-2 py-0.5 rounded text-sm ${LEVEL_CLASS[String(job.level)]}`}>{t(`jobPosts.level.${job.level}`)}</span>}
                {job.target !== null && <span className="text-muted-foreground">{t("clubOverview.target", { target: job.target })}</span>}
              </div>
            </div>
          )}
          {job && job.level !== null && job.blocked !== "own" && (
            <div className="flex flex-col gap-2 pt-1">
              {appliedHere ? (
                <p className="text-sm m-0">{t("clubOverview.applied", { date: formatDay(data.application!.answerOn, i18n.language) })}</p>
              ) : (
                <Button onClick={() => void apply()} disabled={busy || !canApply}>{t("clubOverview.apply")}</Button>
              )}
              {!appliedHere && (
                <p className="text-sm text-muted-foreground m-0">
                  {job.blocked === "refused" ? t("jobPosts.refusedRecently")
                    : data.application ? t("jobPosts.errors.alreadyApplied")
                    : t("clubOverview.applyHint")}
                </p>
              )}
              {notice && <p className="text-sm m-0" role="status">{notice}</p>}
            </div>
          )}
        </Card>

        {data.masterSponsor && (
          <Card>
            <SectionTitle>{t("sponsors.master.title")}</SectionTitle>
            <SponsorPlate company={data.masterSponsor} size="lg" className="max-w-full" linked />
            <span className="text-sm text-muted-foreground">{t(`sponsors.sector.${data.masterSponsor.sector}`, { defaultValue: "" })}</span>
          </Card>
        )}

        {m && (
          <Card>
            <SectionTitle>{t("clubOverview.money")}</SectionTitle>
            <div className="flex items-center gap-3">
              {m.tier && <span className="inline-flex px-2 py-0.5 rounded text-sm bg-chart-4/15 text-chart-4 font-semibold">{t(`leagues.finances.tiers.${m.tier}`)}</span>}
              <span className="text-sm text-muted-foreground">{t("clubOverview.tier")}</span>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm m-0 tabular-nums">
              {m.transferBudget !== null && <>
                <dt className="text-muted-foreground">{t("clubOverview.transferBudget")}</dt>
                <dd className="m-0 text-right font-semibold">
                  {formatEurosDetailed(m.transferBudget)}{m.seasonalTransferBudget !== null ? ` / ${formatEurosDetailed(m.seasonalTransferBudget)}` : ""}
                </dd>
              </>}
              <dt className="text-muted-foreground">{t("clubOverview.wageBill")}</dt>
              <dd className="m-0 text-right font-semibold">{formatEurosDetailed(m.wageBill)}</dd>
              {m.maxWageBudget !== null && <>
                <dt className="text-muted-foreground">{t("clubOverview.wageCap")}</dt>
                <dd className="m-0 text-right font-semibold">{formatEurosDetailed(m.maxWageBudget)}</dd>
              </>}
              {m.hiring && <>
                <dt className="text-muted-foreground">{t("clubOverview.hiring")}</dt>
                <dd className={`m-0 text-right font-semibold ${m.hiring === "open" ? "text-primary" : m.hiring === "tight" ? "text-chart-4" : "text-destructive"}`}>
                  {t(`leagues.finances.hiringState.${m.hiring}`)}
                </dd>
              </>}
            </dl>
            <span className={LABEL}>{t("clubOverview.popularity")}</span>
            <span className="h-1.5 rounded bg-border overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${Math.round(m.popularity)}%` }} /></span>
          </Card>
        )}

        <Card>
          <SectionTitle>{t("clubOverview.honours")}</SectionTitle>
          {data.titles.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0">{t("clubOverview.noTitles")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {data.titles.slice(0, 6).map((g) => (
                <div key={g.title} className="flex flex-col">
                  <span className="font-display font-bold text-3xl tabular-nums text-chart-4">{g.count}</span>
                  <span className="text-sm text-muted-foreground">{titleName(g.title)}</span>
                </div>
              ))}
            </div>
          )}
          {data.legends.length > 0 && (
            <p className="text-sm m-0">
              <span className="text-muted-foreground">{t("clubOverview.legends")} </span>
              {data.legends.map((l, i) => (
                <span key={l.playerId}>{i > 0 ? ", " : ""}<PlayerNameLink player={{ id: l.playerId, name: l.name }} /></span>
              ))}
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-6 min-w-0">
        <Card className="p-0 overflow-hidden">
          {newVisualOn() && !artFailed && (
            <img src={gameArtUrl(stadiumArtFile(data.stadium.level))} alt="" aria-hidden onError={() => setArtFailed(true)}
              className="w-full aspect-[960/330] object-cover select-none pointer-events-none" draggable={false} />
          )}
          <div className="px-5 pb-5 pt-4 flex flex-col gap-3">
            <span className={LABEL}>{t("clubOverview.stadium")}</span>
            <span className="font-display font-black uppercase text-2xl leading-none">{data.venue?.name ?? t("clubOverview.stadium")}</span>
            {data.venue && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("clubOverview.capacity", { city: data.venue.city, seats: data.venue.capacity.toLocaleString(i18n.language) })}
              </span>
            )}
            <ConditionBar label={t("clubOverview.pitch")} value={data.stadium.pitch} />
            <ConditionBar label={t("clubOverview.seats")} value={data.stadium.seats} />
            <ConditionBar label={t("clubOverview.structure")} value={data.stadium.structure} />
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <SectionTitle>{t("clubOverview.season")}</SectionTitle>
            {data.season ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="font-display font-black text-4xl tabular-nums leading-none">{data.season.position}º</span>
                  <span className="text-sm text-muted-foreground">
                    {t("clubOverview.table", { league: name(data.leagueSlug), points: data.season.points, played: data.season.played })}
                  </span>
                </div>
                {data.season.form.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className={LABEL}>{t("clubOverview.form")}</span>
                    {data.season.form.map((r, i) => (
                      <span key={i} className={`inline-flex w-7 h-7 items-center justify-center rounded border text-sm font-semibold ${
                        r === "W" ? "border-primary text-primary bg-primary/10" : r === "L" ? "border-destructive text-destructive bg-destructive/10" : "border-border text-muted-foreground"}`}>
                        {t(`clubOverview.result.${r}`)}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : <p className="text-sm text-muted-foreground m-0">{t("clubOverview.noSeason")}</p>}
          </Card>

          <Card>
            <SectionTitle>{t("clubOverview.highlights")}</SectionTitle>
            <ul className="flex flex-col gap-2 m-0 p-0 list-none">
              {highlights.map((p) => (
                <li key={p.id} className="grid grid-cols-[3rem_1fr_auto_auto] items-center gap-3 text-sm tabular-nums">
                  <span className={`font-semibold ${getDetailedPositionColor(p.natural ?? p.pos)}`}>{t(`roles.detailedAbbr.${p.natural ?? p.pos}`, { defaultValue: p.natural ?? p.pos })}</span>
                  <a href={playerHref(p.id)} className="font-semibold text-foreground hover:text-primary no-underline truncate">{p.name}</a>
                  <span className="font-display font-bold text-primary">{attrDisplay(p.avg)}</span>
                  <span className="text-right min-w-[4.5rem]">{p.value}</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" flush className="self-start" onClick={onSquadTab}>
              {t("clubOverview.fullSquad", { count: squad.players.length })}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
