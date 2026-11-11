import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { groupAwards } from "@/Domain/awards/awardGroups";
import { titlesByPassage } from "@/Domain/managers/careerTitles";
import { competitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { autoBioParts } from "@/Domain/managers/autoBio";
import { pickJoke } from "@/Domain/managers/bioJokes";
import { autoBioText } from "@/GameInterface/managerBio";
import { AwardBadge } from "@/GameInterface/Awards/AwardBadge";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { HumanBadge } from "@/GameInterface/World/HumanBadge";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { ManagerFace } from "@/Domain/faces/managerFace";
import { fameBand, legendaryCount, type ManagerAssets } from "@/Domain/managers/assets";
import type { ManagerRecord } from "@/types/managerTypes";
import type { LeagueData } from "@/types/playerTypes";

/** `GET /api/saves/:id/managers/:managerId` (8.9.31). */
type ManagerPage = Omit<ManagerRecord, "clubs"> & {
  rank: number;
  total: number;
  isPlayer: boolean;
  human?: string;
  clubName: string | null;
  leagueSlug: string | null;
  clubs: { squadId: string; from: string; to?: string; left?: string; clubName: string | null; leagueSlug: string | null }[];
  clubColors: [string, string] | null;
  nationality: string | null;
  face?: ManagerFace | null;
  national?: boolean;
  /** A human manager's bio (8.9.38): another seat's in `bio`, the asking seat's inside `profile`. */
  bio?: string;
  profile?: { bio?: string };
  /** A human manager's belongings: their fame shows on the page (8.9.39). */
  assets?: ManagerAssets;
  decor?: string[];
  job: { level: 1 | 2 | 3 | 4 | 5 | "vacant" | null; target: number | null; position: number | null } | null;
};

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const CAREER_COLS = "md:grid-cols-[minmax(0,1.3fr)_150px_170px_minmax(0,2fr)]";
const LEVEL_CLASS: Record<string, string> = {
  "1": "bg-primary/15 text-primary",
  "2": "bg-primary/10 text-primary",
  "3": "bg-secondary text-muted-foreground",
  "4": "bg-chart-4/15 text-chart-4",
  "5": "bg-destructive/15 text-destructive",
  vacant: "bg-chart-2/15 text-chart-2",
};

/** Link to a manager's page (ids like `seat:x` are URL-encoded). */
export const managerHref = (id: string) => `/manager/${encodeURIComponent(id)}`;

const clubHref = (league: string | null, squadId: string) =>
  league && squadId && !squadId.startsWith("nat_") ? `/squad/${encodeURIComponent(league)}/${encodeURIComponent(squadId)}` : null;

/** A manager's page (tester report, 8.9.31, mock option A): numbers, current job, honours and the career with links. */
export function ManagerScreen({ managerId }: { managerId: string }) {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const [data, setData] = useState<ManagerPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setData(null);
    setFailed(false);
    void fetch(`/api/saves/${session.saveId}/managers/${encodeURIComponent(managerId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ManagerPage>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [session, managerId]);

  useEffect(() => {
    void fetch("/api/leagues").then((r) => (r.ok ? r.json() : [])).then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const career = useMemo(() => (data ? titlesByPassage(data.clubs, data.titles) : { byPassage: [], rest: [] }), [data]);
  const titleGroups = useMemo(() => {
    const map = new Map<string, { kind: ManagerRecord["titles"][number]["kind"]; competition: string; count: number }>();
    for (const ti of data?.titles ?? []) {
      const key = `${ti.kind}:${ti.competition}`;
      const g = map.get(key) ?? { kind: ti.kind, competition: ti.competition, count: 0 };
      g.count++;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [data]);

  if (failed) return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("managerPage.notFound")}</p></ScreenContainer>;
  if (!data) return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p></ScreenContainer>;

  const titleLabel = (kind: ManagerRecord["titles"][number]["kind"], competition: string) => {
    const name = competitionName(competition, leagues, i18n.language);
    return kind === "promotion" ? t("statsScreen.managers.promotion", { league: name }) : name;
  };
  const words = data.name.trim().split(/\s+/);
  const accent = words.length > 1 ? words.pop()! : data.name;
  const main = words.length > 0 && accent !== data.name ? words.join(" ") : "";
  const current = data.clubs.length > 0 ? data.clubs[data.clubs.length - 1] : null;
  const currentSince = current && !current.to && current.squadId === data.squadId ? current.from : null;
  const currentHref = clubHref(data.leagueSlug, data.squadId);
  const seasons = data.seasons;
  const autoBio = autoBioText(autoBioParts(data), {
    t,
    country: data.nationality ? nationalityDisplayName(data.nationality, i18n.language, t) : null,
    competition: (slug) => competitionName(slug, leagues, i18n.language),
    titleName: (kind, competition) => titleLabel(kind, competition),
    clubName: (id) => data.clubs.find((c) => c.squadId === id)?.clubName ?? null,
  });
  // Now and then a funny line (8.9.41): a fixed draw by the manager's id.
  const joke = pickJoke({
    record: data,
    clubName: data.clubName,
    today: session?.currentDate ?? null,
    rank: data.rank,
    total: data.total,
    jobLevel: typeof data.job?.level === "number" ? data.job.level : null,
    assets: data.assets,
    national: data.national,
  });
  const autoBioFull = joke ? `${autoBio} ${t(`managerPage.bio.joke.${joke.id}`, joke.params ?? {})}` : autoBio;

  return (
    <ScreenContainer>
      <ScreenTitle accent={accent}>{main}</ScreenTitle>

      <div className="flex flex-wrap items-center gap-5">
        <ManagerFaceImage manager={data} clubColors={data.clubColors} size={96} />
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-sm text-muted-foreground">
            {[data.nationality, data.isPlayer ? t("managerPage.you") : data.human ? null : t("managerPage.ai")].filter(Boolean).join(" · ")}
            {data.human && <span className="ml-2"><HumanBadge nickname={data.human} /></span>}
          </span>
          {fameBand(data.assets, data.decor) > 0 && (
            <span className="text-sm text-muted-foreground">{t("fame.label")}: <span className="font-semibold text-chart-4">{t(`fame.band.${fameBand(data.assets, data.decor)}`)}</span></span>
          )}
          {legendaryCount(data.assets) > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-star-gold">
              <Icon name="crown" size={16} />{t("fame.legendary", { count: legendaryCount(data.assets) })}
            </span>
          )}
          {data.squadId ? (
            <span className="flex items-center gap-2 min-w-0">
              <ClubLogo logoUrl={squadLogoUrl(data.squadId)} className="w-6 h-6 shrink-0" imgClassName="w-full h-full object-contain" />
              {currentHref
                ? <a href={currentHref} className="font-semibold text-primary no-underline hover:underline truncate">{data.clubName}</a>
                : <span className="font-semibold truncate">{data.clubName}</span>}
              {data.interim && <span className="text-sm text-muted-foreground">· {t("statsScreen.managers.interim")}</span>}
            </span>
          ) : <span className="text-sm text-muted-foreground">{t("statsScreen.managers.noClub")}</span>}
        </div>
      </div>
      {/* His own bio, else one written from his record (8.9.40). */}
      <p className="text-sm text-foreground m-0 max-w-3xl whitespace-pre-line">{data.bio ?? data.profile?.bio ?? autoBioFull}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {([
          ["points", String(data.points)],
          ["rank", t("managerPage.rankOf", { rank: data.rank, total: data.total })],
          ["titles", String(data.titles.length)],
          ["awards", String(data.awards?.length ?? 0)],
          ["seasons", String(seasons)],
        ] as const).map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-card px-4 py-3">
            <p className={LABEL}>{t(`managerPage.stat.${k}`)}</p>
            <p className="font-display font-bold text-3xl leading-none tabular-nums m-0 mt-1.5">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <section className="rounded-md border border-border bg-card p-5 flex flex-col gap-3">
            <SectionTitle>{t("managerPage.currentJob")}</SectionTitle>
            {data.squadId ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <ClubLogo logoUrl={squadLogoUrl(data.squadId)} className="w-12 h-12 shrink-0" imgClassName="w-full h-full object-contain" />
                  <div className="flex flex-col min-w-0">
                    {currentHref
                      ? <a href={currentHref} className="font-display font-bold text-xl text-primary no-underline hover:underline truncate">{data.clubName}</a>
                      : <span className="font-display font-bold text-xl truncate">{data.clubName}</span>}
                    <span className="text-sm text-muted-foreground">
                      {[data.leagueSlug ? competitionName(data.leagueSlug, leagues, i18n.language) : null,
                        currentSince ? t("clubOverview.since", { date: formatDay(currentSince, i18n.language) }) : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </div>
                {data.job && data.job.level !== null && (
                  <div className="flex flex-col gap-2">
                    <p className={LABEL}>{t("jobPosts.security")}</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className={`inline-flex px-2 py-0.5 rounded text-sm ${LEVEL_CLASS[String(data.job.level)]}`}>{t(`jobPosts.level.${data.job.level}`)}</span>
                      {data.job.position !== null && data.job.target !== null && (
                        <span className="text-muted-foreground">{t("managerPage.positionVsTarget", { position: data.job.position, target: data.job.target })}</span>
                      )}
                    </div>
                  </div>
                )}
                {currentHref && !data.isPlayer && data.job && data.job.level !== null && (
                  <a href={currentHref} className="text-sm font-semibold text-primary no-underline hover:underline">{t("managerPage.applyAtClub")}</a>
                )}
              </>
            ) : <p className="text-sm text-muted-foreground m-0">{t("statsScreen.managers.noClub")}</p>}
          </section>

          <section className="rounded-md border border-border bg-card p-5 flex flex-col gap-3">
            <SectionTitle>{t("managerPage.honours")}</SectionTitle>
            {titleGroups.length === 0 && (data.awards?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground m-0">{t("managerPage.noHonours")}</p>}
            {titleGroups.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {titleGroups.slice(0, 6).map((g) => (
                  <div key={g.kind + g.competition} className="flex flex-col">
                    <span className="font-display font-bold text-3xl tabular-nums text-chart-4">{g.count}</span>
                    <span className="text-sm text-muted-foreground">{titleLabel(g.kind, g.competition)}</span>
                  </div>
                ))}
              </div>
            )}
            {data.awards && data.awards.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {groupAwards([...data.awards].reverse().map((a) => ({
                  kind: a.kind,
                  title: a.kind === "world_manager" ? String(a.year ?? a.season) : `${competitionName(a.competition, leagues, i18n.language)} ${a.season}`,
                }))).map((g) => <AwardBadge key={g.kind} kind={g.kind} count={g.count} title={g.titles.join(", ")} />)}
              </div>
            )}
          </section>
        </div>

        <section className="flex flex-col gap-2.5 min-w-0">
          <SectionTitle>{t("statsScreen.managers.career")}</SectionTitle>
          {data.clubs.length === 0 ? <p className="text-sm text-muted-foreground m-0">{t("managerPage.noCareer")}</p> : (
            <div className={TABLE_STYLE.shell}>
              <div className={`${TABLE_STYLE.head} hidden md:grid ${CAREER_COLS} gap-3 px-4 py-3`}>
                <span>{t("statsScreen.managers.detail.club")}</span>
                <span>{t("statsScreen.managers.detail.period")}</span>
                <span>{t("statsScreen.managers.detail.left")}</span>
                <span>{t("statsScreen.managers.detail.titles")}</span>
              </div>
              <div className={TABLE_STYLE.body}>
                {data.clubs.map((c, i) => ({ c, groups: career.byPassage[i] ?? [] })).reverse().map(({ c, groups }, i) => {
                  const href = clubHref(c.leagueSlug, c.squadId);
                  return (
                    <div key={i} className={`grid grid-cols-1 ${CAREER_COLS} gap-x-3 gap-y-1 px-4 py-2.5 items-center`}>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <ClubLogo logoUrl={squadLogoUrl(c.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
                        {href
                          ? <a href={href} className={`${TABLE_STYLE.name} no-underline hover:text-primary`}>{c.clubName ?? "-"}</a>
                          : <span className={TABLE_STYLE.name}>{c.clubName ?? "-"}</span>}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatDay(c.from, i18n.language, "year")} – {c.to ? formatDay(c.to, i18n.language, "year") : t("statsScreen.managers.current")}
                      </span>
                      <span className={`text-sm ${c.left === "sacked" ? "text-chart-4" : "text-muted-foreground"}`}>{c.left ? t(`statsScreen.managers.leftReason.${c.left}`) : "—"}</span>
                      <span className="flex flex-col gap-1 text-sm">
                        {groups.length === 0 && <span className="text-muted-foreground">—</span>}
                        {groups.map((g) => (
                          <span key={g.kind + g.competition} className="inline-flex items-center gap-1.5 text-foreground" title={g.seasons.join(", ")}>
                            <Icon name="trophy" size={16} className="text-chart-4 shrink-0" />
                            {titleLabel(g.kind, g.competition)}
                            {g.count > 1 && <span className="font-semibold tabular-nums">×{g.count}</span>}
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {career.rest.length > 0 && (
            <ul className="m-0 p-0 list-none space-y-1 mt-2">
              {[...career.rest].reverse().map((ti, i) => (
                <li key={i} className="text-sm">
                  <span className="text-muted-foreground tabular-nums mr-2">{ti.season}</span>
                  {titleLabel(ti.kind, ti.competition)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ScreenContainer>
  );
}
