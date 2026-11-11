import { ASSET_KINDS, type ManagerAssets } from "@/Domain/managers/assets";
import { titlesByPassage } from "@/Domain/managers/careerTitles";
import { Icon } from "@/GameInterface/Icons";
import { BADGE_ICON, FRAME_RING } from "@/GameInterface/Achievements/achievementsApi";
import type { ManagerProfile } from "@/types/achievementTypes";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, LoadMoreButton, StatsDetailRow, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { competitionName } from "@/Domain/world/labels";
import type { ManagerRecord } from "@/types/managerTypes";
import type { LeagueData } from "@/types/playerTypes";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { formatFee } from "@/Domain/money";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import type { ManagerFace } from "@/Domain/faces/managerFace";
import { AwardBadge } from "@/GameInterface/Awards/AwardBadge";
import { HumanBadge } from "@/GameInterface/World/HumanBadge";
import { managerHref } from "@/GameInterface/ManagerScreen";
import { groupAwards } from "@/Domain/awards/awardGroups";

type Row = Omit<ManagerRecord, "clubs"> & {
  rank: number;
  /** The asking seat's own manager (computed by the route). */
  isPlayer: boolean;
  /** Another human's manager in this world: his nickname. */
  human?: string;
  clubName: string | null;
  /** Every manager's passages through clubs, with the reason he left (Etapa 25). */
  clubs?: { squadId: string; from: string; to?: string; left?: string; clubName: string | null }[];
  free?: boolean;
  /** The human manager: wages and severance received in the career. */
  earnings?: number;
  /** Bank loans he left unpaid at a club. */
  assets?: ManagerAssets;
  cards?: { yellow: number; red: number };
  unpaidDebts?: { squadId: string; clubName: string; amount: number; date: string; penalty: number }[];
  /** Face (Etapa 31b): current club's colours, nationality, and the human manager's saved avatar. */
  clubColors?: [string, string] | null;
  nationality?: string | null;
  face?: ManagerFace | null;
  /** The human manager's profile items (`achievements.md`): frame, title, badges. */
  profile?: ManagerProfile;
};
type Page = {
  humans?: number; total: number; playerRank: number | null; items: Row[] };
type Scope = "world" | "country" | "free" | "humans";

const PAGE = 50;

const DETAIL_LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
/** Club · period · how he left · titles. */
const CAREER_COLS = "md:grid-cols-[minmax(0,1.3fr)_150px_170px_minmax(0,2fr)]";
const hasAssets = (m: Row) => (m.isPlayer && m.earnings !== undefined) || (!!m.assets && Object.keys(m.assets).length > 0);
const showCards = (m: Row) => m.isPlayer || (!!m.cards && (m.cards.yellow > 0 || m.cards.red > 0));

/** "Técnicos" tab of the Stats screen (`.claude/rules/game/managers.md`). */
export function ManagerRanking({ saveId, leagues, refreshKey, openMe }: {
  saveId: string; leagues: LeagueData[]; refreshKey?: string;
  /** Opens the asking manager's profile on load (`/stats?tab=managers&open=me`, from the Dashboard). */
  openMe?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<Scope>("world");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [humans, setHumans] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Bumped on every scope change, so a "load more" answer for the old scope is dropped.
  const generation = useRef(0);
  const meOpened = useRef(false);

  const fetchPage = (offset: number) =>
    fetch(`/api/saves/${saveId}/managers?scope=${scope}&offset=${offset}&limit=${PAGE}${openMe && offset === 0 ? "&me=1" : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<Page>) : Promise.reject(new Error(String(r.status)))));

  useEffect(() => {
    let cancelled = false;
    generation.current++;
    setRows(null);
    setError(false);
    setOpen(null);
    setLoadingMore(false);
    setMoreFailed(false);
    fetchPage(0)
      .then((d) => {
        if (cancelled) return;
        setRows(d.items); setTotal(d.total); setPlayerRank(d.playerRank); setHumans(d.humans ?? 0);
        const me = openMe && !meOpened.current ? d.items.find((m) => m.isPlayer) : undefined;
        if (me) {
          meOpened.current = true;
          setOpen(me.id);
          requestAnimationFrame(() => document.getElementById("manager-detail-open")?.scrollIntoView({ block: "center" }));
        }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveId, scope, refreshKey]);

  const loadMore = () => {
    if (!rows || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    setMoreFailed(false);
    fetchPage(rows.length)
      .then((d) => { if (gen === generation.current) { setRows([...rows, ...d.items.filter((m) => !rows.some((r) => r.id === m.id))]); setTotal(d.total); } })
      .catch(() => { if (gen === generation.current) setMoreFailed(true); })
      .finally(() => { if (gen === generation.current) setLoadingMore(false); });
  };

  const header = (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <OptionChips<Scope>
        options={[
          { key: "world", label: t("statsScreen.managers.world") },
          { key: "country", label: t("statsScreen.managers.country") },
          { key: "free", label: t("statsScreen.managers.free") },
          ...(humans > 1 ? [{ key: "humans" as const, label: t("statsScreen.managers.humans") }] : []),
        ]}
        value={scope}
        onChange={setScope}
      />
      {playerRank !== null && (
        <span className="text-sm text-muted-foreground">{t("statsScreen.managers.yourRank", { rank: playerRank, total })}</span>
      )}
    </div>
  );

  if (error) return <>{header}<p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p></>;
  if (!rows) return <>{header}<p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p></>;
  if (rows.length === 0) return <>{header}<p className="text-sm text-muted-foreground">{t("statsScreen.managers.empty")}</p></>;

  const titleLabel = (kind: ManagerRecord["titles"][number]["kind"], competition: string) => {
    const name = competitionName(competition, leagues, i18n.language);
    return kind === "promotion" ? t("statsScreen.managers.promotion", { league: name }) : name;
  };

  return (
    <div className="max-w-4xl">
      {header}
      <StatsTable
        head={<>
          <StatsHead align="center">#</StatsHead>
          <StatsHead />
          <StatsHead>{t("statsScreen.managers.name")}</StatsHead>
          <StatsHead>{t("statsScreen.club")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.managers.points")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.managers.titles")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.managers.awards")}</StatsHead>
        </>}
      >
        {rows.map((m) => {
          const isOpen = open === m.id;
          const career = isOpen ? titlesByPassage(m.clubs ?? [], m.titles) : { byPassage: [], rest: [] };
          return [
            <StatsRow
              key={m.id}
              highlight={m.isPlayer}
              onActivate={m.titles.length > 0 || (m.clubs?.length ?? 0) > 0 || (m.unpaidDebts?.length ?? 0) > 0 || !!m.cards || !!m.assets || (m.awards?.length ?? 0) > 0 ? () => setOpen(isOpen ? null : m.id) : undefined}
              expanded={isOpen}
            >
              <RankCell rank={m.rank} />
              <CrestCell squadId={m.squadId} />
              <NameCell highlight={m.isPlayer}>
                <ManagerFaceImage manager={m} clubColors={m.clubColors} size={32} ringClassName={m.profile && m.profile.frame !== "none" ? FRAME_RING[m.profile.frame] : "border border-border"} className="mr-1.5" {...(m.profile ? { frame: m.profile.frame } : {})} />
                <span className={`truncate ${m.human ? "text-chart-2" : ""}`}>{m.name}</span>
                {m.human && <span className="ml-1.5"><HumanBadge nickname={m.human} /></span>}
                {m.profile?.title && <span className="text-sm font-semibold text-primary truncate ml-1.5">{t(`achievements.titles.${m.profile.title}`)}</span>}
              </NameCell>
              <ClubCell>
                {m.clubName ?? t("statsScreen.managers.noClub")}
                {m.interim && <span className="text-muted-foreground"> · {t("statsScreen.managers.interim")}</span>}
              </ClubCell>
              <NumberCell strong>{m.points}</NumberCell>
              <NumberCell>{m.titles.length}</NumberCell>
              <NumberCell>{m.awards?.length ? m.awards.length : ""}</NumberCell>
            </StatsRow>,
            isOpen && (
              <StatsDetailRow key={`${m.id}-titles`} colSpan={7}>
                {/* The manager's profile: header, numbers, career table, assets and cards (tester report, option B, 8.9.5). */}
                <div className="flex flex-col gap-4 py-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div id="manager-detail-open" className="flex items-center gap-3 min-w-0 scroll-mt-24">
                      <ManagerFaceImage manager={m} clubColors={m.clubColors} size={64} {...(m.profile ? { ringClassName: FRAME_RING[m.profile.frame], frame: m.profile.frame } : {})} />
                      <div className="min-w-0">
                        <p className="font-display font-black uppercase text-xl leading-none m-0 truncate">{m.name}</p>
                        <a href={managerHref(m.id)} className="text-sm font-semibold text-primary no-underline hover:underline">{t("managerPage.open")}</a>
                        {m.isPlayer && m.profile && (
                          <a href="/achievements" className="flex items-center gap-1.5 text-sm font-semibold text-primary no-underline hover:underline mt-1">
                            {m.profile.badges.map((b) => (
                              <span key={b} title={t(`achievements.badges.${b}`)} aria-label={t(`achievements.badges.${b}`)} className="inline-flex"><Icon name={BADGE_ICON[b]} size={16} /></span>
                            ))}
                            {m.profile.title ? t(`achievements.titles.${m.profile.title}`) : t("achievements.link")}
                          </a>
                        )}
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground m-0 mt-1 tabular-nums">
                          {m.squadId && <ClubLogo logoUrl={squadLogoUrl(m.squadId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />}
                          {m.clubName ?? t("statsScreen.managers.noClub")} · {t("statsScreen.managers.pointsLine", { points: m.points })}
                        </p>
                      </div>
                    </div>
                    {m.awards && m.awards.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {groupAwards([...m.awards].reverse().map((a) => ({
                          kind: a.kind,
                          title: a.kind === "world_manager" ? String(a.year ?? a.season) : `${competitionName(a.competition, leagues, i18n.language)} ${a.season}`,
                        }))).map((g) => <AwardBadge key={g.kind} kind={g.kind} count={g.count} title={g.titles.join(", ")} />)}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      ["points", m.points],
                      ["titles", m.titles.length],
                      ["awards", m.awards?.length ?? 0],
                      ["clubs", m.clubs?.length ?? 0],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="rounded-md border border-border bg-card px-4 py-3">
                        <p className={DETAIL_LABEL}>{t(`statsScreen.managers.detail.${k}`)}</p>
                        <p className="font-display font-bold text-3xl leading-none tabular-nums m-0 mt-1.5">{v}</p>
                      </div>
                    ))}
                  </div>

                  {m.clubs && m.clubs.length > 0 && (
                    <section>
                      <p className="font-display font-black uppercase text-xl leading-none m-0 mb-2.5">{t("statsScreen.managers.career")}</p>
                      <div className={TABLE_STYLE.shell}>
                        <div className={`${TABLE_STYLE.head} hidden md:grid ${CAREER_COLS} gap-3 px-4 py-3`}>
                          <span>{t("statsScreen.managers.detail.club")}</span>
                          <span>{t("statsScreen.managers.detail.period")}</span>
                          <span>{t("statsScreen.managers.detail.left")}</span>
                          <span>{t("statsScreen.managers.detail.titles")}</span>
                        </div>
                        <div className={TABLE_STYLE.body}>
                          {m.clubs.map((c, i) => ({ c, groups: career.byPassage[i] ?? [] })).reverse().map(({ c, groups }, i) => (
                            <div key={i} className={`grid grid-cols-1 ${CAREER_COLS} gap-x-3 gap-y-1 px-4 py-2.5 items-center`}>
                              <span className="flex items-center gap-2.5 min-w-0">
                                <ClubLogo logoUrl={squadLogoUrl(c.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
                                <span className={TABLE_STYLE.name}>{c.clubName ?? "-"}</span>
                              </span>
                              <span className="text-sm text-muted-foreground tabular-nums">
                                {formatDay(c.from, i18n.language, "year")} – {c.to ? formatDay(c.to, i18n.language, "year") : t("statsScreen.managers.current")}
                              </span>
                              <span className="text-sm text-muted-foreground">{c.left ? t(`statsScreen.managers.leftReason.${c.left}`) : "—"}</span>
                              {/* Titles won there, next to the club (tester report, 8.8.5) */}
                              <span className="flex flex-col gap-1 text-sm">
                                {groups.length === 0 && <span className="text-muted-foreground">—</span>}
                                {groups.map((g) => (
                                  <span key={g.kind + g.competition} className="inline-flex items-center gap-1.5 text-foreground" title={g.seasons.join(", ")}>
                                    <Icon name="trophy" size={16} className="text-chart-4 shrink-0" />
                                    {titleLabel(g.kind, g.competition)}
                                    {g.count > 1 && <span className="font-semibold tabular-nums">×{g.count}</span>}
                                    <span className="text-muted-foreground tabular-nums">+{g.points}</span>
                                  </span>
                                ))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {career.rest.length > 0 && (
                    <section>
                      <p className={`${DETAIL_LABEL} mb-1.5`}>{t("statsScreen.managers.detail.otherTitles")}</p>
                      <ul className="m-0 p-0 list-none space-y-1">
                        {[...career.rest].reverse().map((ti, i) => (
                          <li key={i} className="flex justify-between gap-4 text-sm">
                            <span>
                              <span className="text-muted-foreground tabular-nums mr-2">{ti.season}</span>
                              {titleLabel(ti.kind, ti.competition)}
                            </span>
                            <span className="tabular-nums text-muted-foreground">+{ti.points}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {(hasAssets(m) || showCards(m)) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {hasAssets(m) && (
                        <div className="rounded-md border border-border bg-card px-4 py-3">
                          <p className={`${DETAIL_LABEL} mb-2`}>{t("statsScreen.managers.detail.assets")}</p>
                          {m.isPlayer && m.earnings !== undefined && (
                            <p className="text-sm m-0 mb-1.5 tabular-nums">{t("statsScreen.managers.earnings", { amount: formatFee(m.earnings) })}</p>
                          )}
                          {ASSET_KINDS.filter((k) => m.assets?.[k]).map((k) => (
                            <p key={k} className="text-sm m-0 mb-1">{t(`achievements.assets.level.${k}.${m.assets![k]}`)}</p>
                          ))}
                        </div>
                      )}
                      {showCards(m) && (
                        <div className="rounded-md border border-border bg-card px-4 py-3">
                          <p className={`${DETAIL_LABEL} mb-2`}>{t("statsScreen.managers.detail.cards")}</p>
                          <p className="flex items-center gap-2 text-sm m-0 tabular-nums">
                            <span className="inline-block w-2.5 h-3.5 rounded-sm bg-chart-4" aria-hidden />
                            {t("statsScreen.managers.yellowCards", { count: m.cards?.yellow ?? 0 })}
                            <span className="inline-block w-2.5 h-3.5 rounded-sm bg-destructive ml-2" aria-hidden />
                            {t("statsScreen.managers.redCards", { count: m.cards?.red ?? 0 })}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {m.unpaidDebts && m.unpaidDebts.length > 0 && (
                    <div>
                      <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-destructive m-0 mb-1">
                        {t("statsScreen.managers.unpaidDebts")}
                      </p>
                      <ul className="m-0 p-0 list-none space-y-1">
                        {m.unpaidDebts.map((d) => (
                          <li key={d.squadId + d.date} className="text-sm text-foreground tabular-nums">
                            {t("statsScreen.managers.unpaidDebt", { club: d.clubName, amount: formatFee(d.amount), year: d.date.slice(0, 4), penalty: d.penalty })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </StatsDetailRow>
            ),
          ];
        })}
      </StatsTable>
      {rows.length < total && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loadingMore}
          failed={moreFailed}
          label={t("statsScreen.retired.loadMore")}
          loadingLabel={t("statsScreen.loading")}
          failedLabel={t("statsScreen.loadFailed")}
        />
      )}
      <p className="text-sm text-muted-foreground mt-3">{t("statsScreen.managers.hint")}</p>
    </div>
  );
}
