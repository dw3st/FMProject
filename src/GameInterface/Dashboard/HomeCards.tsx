/**
 * Dumb cards of the dashboard home (#56). Data comes in already shaped
 * (`dashboardData.ts`); each card links to the screen it summarises.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { BoardUltimatum, SeasonObjective } from "@/types/boardTypes";
import { objectiveText } from "@/GameInterface/boardText";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { PlayerFace, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import type { ManagerFace } from "@/Domain/faces/managerFace";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import type { StarKind } from "@/Domain/world/stars";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { matchConditions, type MatchConditions } from "@/Domain/matchday/matchConditions";
import { weatherIconName, weatherLabelKey } from "@/GameInterface/matchWeather";
import type { ClubVenue } from "@/types/playerTypes";
import type {
  AttentionItem,
  FormResult,
  Highlight,
  WeekMoney,
} from "@/GameInterface/Dashboard/dashboardData";
import { formatEuros, formatWageShort } from "@/Domain/money";
import { projectProgress } from "@/Domain/facilities/facilities";
import { addDays } from "@/Domain/dates";
import type { ClubFacilities, FacilityKind, StandId } from "@/types/facilityTypes";
import { RESULT_PILL } from "@/GameInterface/formColors";

// ── Shared ───────────────────────────────────────────────────────────────────

/** Card shell: title + "go to screen" link on top, content below. */
export function HomeCard({
  title,
  href,
  linkLabel,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  href?: string;
  linkLabel?: string;
  /** Extra controls on the right of the title (e.g. the week card's prev/next buttons). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card-arcade rounded-md p-4 flex flex-col gap-4 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{title}</SectionTitle>
        {actions}
        {href && linkLabel && (
          <a
            href={href}
            className="inline-flex items-center gap-1 min-h-8 text-sm text-muted-foreground hover:text-foreground no-underline shrink-0"
          >
            {linkLabel}
            <Icon name="chevron-right" size={16} />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

const DAY_FORMAT: Record<"short" | "year" | "long", Intl.DateTimeFormatOptions> = {
  short: { day: "numeric", month: "short" },
  year: { day: "numeric", month: "short", year: "numeric" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
};

export function formatDay(date: string, lang: string, style: "short" | "year" | "long" = "short"): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(lang, DAY_FORMAT[style]);
}

const FORM_CLASS: Record<FormResult, string> = RESULT_PILL;

function FormPills({ results }: { results: FormResult[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      {results.map((r, i) => (
        <span
          key={i}
          title={t(`dashboard.home.formLong.${r}`)}
          className={`w-7 h-7 rounded text-sm font-display font-bold flex items-center justify-center ${FORM_CLASS[r]}`}
        >
          {t(`dashboard.home.form.${r}`)}
        </span>
      ))}
    </div>
  );
}

// ── Club ─────────────────────────────────────────────────────────────────────

/** A 0..100 confidence bar with the percentage beside the label and the 7-day trend arrow. */
function ConfidenceBar({ label, value, trend }: { label: string; value: number; trend: number | null }) {
  const { t } = useTranslation();
  const up = trend !== null && trend >= 1;
  const down = trend !== null && trend <= -1;
  const trendLabel = up
    ? t("board.trendUp", { value: Math.round(trend!) })
    : down
      ? t("board.trendDown", { value: Math.round(-trend!) })
      : undefined;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 font-display font-bold text-sm text-primary tabular-nums">
          {(up || down) && (
            <span title={trendLabel} aria-label={trendLabel} className={`inline-flex ${up ? "text-primary" : "text-destructive"}`}>
              <Icon name={up ? "trend-up" : "trend-down"} size={16} />
            </span>
          )}
          {Math.round(value)}%
        </span>
      </div>
      <div className="h-1.5 min-w-16 rounded bg-border overflow-hidden" role="presentation">
        <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/**
 * The club header of the dashboard (#57): crest, club, league, manager (with the world ranking),
 * board / fans confidence, budget and squad size. Replaces the old left club column.
 */
export function ClubCard({
  club,
  leagueName,
  managerName,
  managerRank,
  managerFace,
  reputation,
  pendingOffers,
  contract,
  board,
  fans,
  boardTrend,
  fansTrend,
  objective,
  ultimatum,
  budget,
  squadSize,
  squadHref,
}: {
  club: MatchSide;
  leagueName: string;
  managerName: string | null;
  managerRank: number | null;
  /** The human manager's face (Etapa 31b): saved avatar and nationality; absent avatar = drawn from the id. */
  managerFace?: { face?: ManagerFace | null; nationality?: string | null } | null;
  /** Manager reputation 0..100 (`.claude/rules/game/jobs.md`); null while loading. */
  reputation: number | null;
  /** Pending job offers. */
  pendingOffers: number;
  /** The manager's contract (Etapa 25): until / weekly wage. */
  contract?: { until: string; wage: number } | null;
  board: number;
  fans: number;
  /** Change vs. 7 days ago (null without enough history). */
  boardTrend: number | null;
  fansTrend: number | null;
  objective: SeasonObjective | null;
  ultimatum: BoardUltimatum | null;
  budget: number | null;
  squadSize: number;
  squadHref: string;
}) {
  const { t } = useTranslation();
  const label = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
  return (
    <section className="card-arcade rounded-md p-4 grid gap-6 items-center min-w-0 md:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center gap-4 min-w-0">
        <ClubLogo
          logoUrl={squadLogoUrl(club.id)}
          primaryColor={club.colors[0]}
          secondaryColor={club.colors[1]}
          className="w-16 h-16 rounded-full shrink-0"
          imgClassName="w-full h-full object-contain"
        />
        <div className="min-w-0 flex flex-col gap-1.5">
          <SectionTitle className="truncate">{club.name}</SectionTitle>
          <span className="text-sm text-muted-foreground truncate">{leagueName}</span>
        </div>
      </div>

      <div className="flex items-start gap-3 min-w-0">
      {managerName && (
        <ManagerFaceImage
          manager={{ id: "player", name: managerName, face: managerFace?.face, nationality: managerFace?.nationality }}
          clubColors={club.colors}
          size={48}
        />
      )}
      <div className="flex flex-col gap-1 min-w-0">
        <span className={label}>{t("dashboard.clubSidebar.manager")}</span>
        <span className="font-semibold text-foreground truncate">{managerName ?? "—"}</span>
        {managerRank !== null && (
          <a
            href="/stats?tab=managers"
            className="text-sm text-muted-foreground no-underline hover:text-foreground hover:underline"
          >
            {t("dashboard.clubSidebar.managerRank", { rank: managerRank })}
          </a>
        )}
        {reputation !== null && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("dashboard.clubSidebar.reputation", { value: Math.round(reputation) })}
          </span>
        )}
        {pendingOffers > 0 && (
          <a href="/inbox" className="text-sm font-semibold text-primary no-underline hover:underline">
            {t("dashboard.clubSidebar.pendingOffers", { count: pendingOffers })}
          </a>
        )}
        {contract && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("managerContract.cardLine", { year: contract.until.slice(0, 4), wage: formatWageShort(contract.wage) })}
          </span>
        )}
      </div>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        <ConfidenceBar label={t("dashboard.clubSidebar.board")} value={board} trend={boardTrend} />
        <ConfidenceBar label={t("dashboard.clubSidebar.fans")} value={fans} trend={fansTrend} />
        {objective && (
          <p className="text-sm text-muted-foreground m-0 truncate" title={objectiveText(objective, t)}>
            {t("board.objectiveLabel")}: <span className="text-foreground">{objectiveText(objective, t)}</span>
          </p>
        )}
        {ultimatum && (
          <p className="text-sm text-destructive m-0">
            {t("board.ultimatumActive", { points: Math.max(0, ultimatum.pointsNeeded - ultimatum.points), matches: ultimatum.matchesLeft })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 min-w-0">
        <a href="/finances" className="flex flex-col gap-1 min-w-0 no-underline">
          <span className={label}>{t("dashboard.clubSidebar.budget")}</span>
          <span className={`font-display font-bold text-2xl tabular-nums leading-none ${(budget ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>
            {budget == null ? "—" : formatEuros(budget)}
          </span>
        </a>
        <a href={squadHref} className="flex flex-col gap-1 min-w-0 no-underline">
          <span className={label}>{t("dashboard.clubSidebar.squad")}</span>
          <span className="font-display font-bold text-2xl tabular-nums leading-none text-foreground">
            {squadSize}
            <span className="font-sans font-normal text-sm text-muted-foreground ml-1.5">{t("dashboard.clubSidebar.players")}</span>
          </span>
        </a>
      </div>
    </section>
  );
}

// ── Next match ───────────────────────────────────────────────────────────────

export interface MatchSide {
  id: string;
  name: string;
  colors: readonly [string, string];
}

export function NextMatchCard({
  fixture,
  me,
  opponent,
  competitionLabel,
  today,
  form,
  stadium = null,
  homeCountry = null,
}: {
  fixture: Fixture | null;
  me: MatchSide;
  opponent: MatchSide | null;
  /** "Premier League · Matchday 12", "FA Cup · Quarter-finals"... */
  competitionLabel: string;
  today: string;
  form: FormResult[];
  /** The home ground (absent on a neutral ground, or while the opponent's squad loads). */
  stadium?: ClubVenue | null;
  /** Home club's country: drives the cosmetic weather (season / hemisphere). */
  homeCountry?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const isHome = fixture ? fixture.home === me.id : true;
  const home = isHome ? me : opponent;
  const away = isHome ? opponent : me;
  const venue = !fixture
    ? ""
    : fixture.neutral
      ? t("cups.neutral")
      : isHome
        ? t("dashboard.clubSidebar.home")
        : t("dashboard.clubSidebar.away");
  const daysAway = fixture
    ? Math.round((Date.parse(`${fixture.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : 0;
  const isToday = !!fixture && daysAway <= 0;
  const conditions = fixture ? matchConditions(fixture, homeCountry) : null;

  return (
    <HomeCard title={t("dashboard.home.nextMatch")}>
      {!fixture || !home || !away ? (
        <p className="text-sm text-muted-foreground m-0">{t("dashboard.clubSidebar.noMatchScheduled")}</p>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamBlock side={home} mine={home.id === me.id} />
            <span className="font-display font-black uppercase text-xl text-muted-foreground">{t("common.vs")}</span>
            <TeamBlock side={away} mine={away.id === me.id} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-center">
            <span className="font-semibold text-foreground">
              {isToday ? t("common.today") : formatDay(fixture.date, i18n.language)}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{venue}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{competitionLabel}</span>
          </div>
          {conditions && <MatchDetails stadium={stadium} conditions={conditions} />}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3 mt-auto">
        <div className="flex flex-col gap-1.5">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
            {t("dashboard.home.lastResults")}
          </span>
          {form.length > 0 ? (
            <FormPills results={form} />
          ) : (
            <span className="text-sm text-muted-foreground">{t("dashboard.home.noResults")}</span>
          )}
        </div>
        {fixture && (
          isToday ? (
            <a
              href="/match-preview"
              className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 no-underline"
            >
              {t("dashboard.home.viewPreview")}
              <Icon name="chevron-right" size={16} />
            </a>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("dashboard.home.inDays", { count: daysAway })}
              </span>
              <a
                href="/formation"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 no-underline"
              >
                {t("dashboard.home.prepareLineup")}
                <Icon name="chevron-right" size={16} />
              </a>
            </div>
          )
        )}
      </div>
    </HomeCard>
  );
}

/** Stadium + capacity, kickoff time and weather (cosmetic, see `matchConditions`). */
function MatchDetails({ stadium, conditions }: { stadium: ClubVenue | null; conditions: MatchConditions }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      {stadium?.name && (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Icon name="stadium" size={16} className="shrink-0" />
          <span className="text-foreground truncate">{stadium.name}</span>
          {stadium.capacity > 0 && (
            <span className="tabular-nums">
              · {t("dashboard.home.capacity", { seats: stadium.capacity.toLocaleString(i18n.language) })}
            </span>
          )}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5" title={t("dashboard.home.kickoff")}>
        <Icon name="clock" size={16} />
        <span className="tabular-nums">{conditions.kickoff}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Icon name={weatherIconName(conditions)} size={16} />
        {t(weatherLabelKey(conditions.weather))}
      </span>
    </div>
  );
}

function TeamBlock({ side, mine }: { side: MatchSide; mine: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0 text-center">
      <ClubLogo
        logoUrl={squadLogoUrl(side.id)}
        primaryColor={side.colors[0]}
        secondaryColor={side.colors[1]}
        className="w-16 h-16 rounded-full"
        imgClassName="w-full h-full object-contain"
      />
      <span className={`font-semibold leading-tight ${mine ? "text-primary" : "text-foreground"}`}>{side.name}</span>
    </div>
  );
}

// ── League mini-table ────────────────────────────────────────────────────────

export function LeagueMiniTable({
  title,
  rows,
  myId,
  loading,
}: {
  title: string;
  rows: { rank: number; row: StandingRow }[];
  myId: string;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const grid = "grid grid-cols-[32px_1fr_40px_44px_48px] gap-2 px-4";
  return (
    <HomeCard title={title} href="/leagues" linkLabel={t("dashboard.home.fullTable")}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{loading ? t("leagues.loadingStandings") : t("dashboard.home.noTable")}</p>
      ) : (
        <div className={TABLE_STYLE.shell}>
          <div className={`${grid} py-3 ${TABLE_STYLE.head}`}>
            <div className="text-center">{t("leagues.rank")}</div>
            <div>{t("leagues.club")}</div>
            <div className="text-center">{t("leagues.matches")}</div>
            <div className="text-center">{t("leagues.goalDifference")}</div>
            <div className="text-center">{t("leagues.points")}</div>
          </div>
          <div className={TABLE_STYLE.body}>
            {rows.map(({ rank, row }) => {
              const mine = row.squadId === myId;
              return (
                <a
                  key={row.squadId}
                  href="/leagues"
                  className={`${grid} py-2.5 items-center no-underline ${TABLE_STYLE.row} ${mine ? TABLE_STYLE.rowHighlight : ""}`}
                >
                  <div className={TABLE_STYLE.rank}>{rank}</div>
                  <div className="flex items-center gap-3 min-w-0">
                    <ClubLogo
                      logoUrl={squadLogoUrl(row.squadId)}
                      primaryColor={row.colors[0]}
                      secondaryColor={row.colors[1]}
                      className={TABLE_STYLE.crest}
                      imgClassName="w-full h-full object-contain"
                    />
                    <span className={`${mine ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name} truncate`}>{row.name}</span>
                  </div>
                  <div className={TABLE_STYLE.number}>{row.mp}</div>
                  <div className={TABLE_STYLE.number}>{row.gd > 0 ? `+${row.gd}` : row.gd}</div>
                  <div className={TABLE_STYLE.key}>{row.pts}</div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </HomeCard>
  );
}

// ── Attention ────────────────────────────────────────────────────────────────

export function AttentionCard({
  items,
  playerHref,
  squadHref,
  youthHref,
}: {
  items: AttentionItem[];
  playerHref: (playerId: string) => string;
  squadHref: string;
  youthHref: string;
}) {
  const { t, i18n } = useTranslation();

  function describe(item: AttentionItem): { icon: IconName; tone: string; text: string; href: string } {
    switch (item.kind) {
      case "injured":
        return {
          icon: "heart-pulse",
          tone: "text-destructive",
          text: t("dashboard.home.attention.injured", {
            name: item.name,
            severity: t(`dashboard.squadTable.sev${item.severity.charAt(0).toUpperCase()}${item.severity.slice(1)}`),
            date: formatDay(item.returnDate, i18n.language),
          }),
          href: playerHref(item.playerId),
        };
      case "suspended":
        return {
          icon: "xcircle",
          tone: "text-destructive",
          text: t("dashboard.home.attention.suspended", { name: item.name, count: item.matches }),
          href: playerHref(item.playerId),
        };
      case "lowFitness":
        return {
          icon: "activity",
          tone: "text-chart-4",
          text: t("dashboard.home.attention.lowFitness", { name: item.name, fitness: item.fitness }),
          href: playerHref(item.playerId),
        };
      case "lowFitnessGroup":
        return {
          icon: "activity",
          tone: "text-chart-4",
          text: t("dashboard.home.attention.lowFitnessGroup", { count: item.count, names: item.names.slice(0, 3).join(", ") }),
          href: squadHref,
        };
      case "contract":
        return {
          icon: "file-signature",
          tone: "text-chart-4",
          text: t("dashboard.home.attention.contract", { name: item.name, date: formatDay(item.until, i18n.language, "year") }),
          href: playerHref(item.playerId),
        };
      case "contractGroup":
        return {
          icon: "file-signature",
          tone: "text-chart-4",
          text: t("dashboard.home.attention.contractGroup", { count: item.count, names: item.names.slice(0, 3).join(", ") }),
          href: squadHref,
        };
      case "youthIntake":
        return {
          icon: "user-plus",
          tone: "text-chart-2",
          text: t("dashboard.home.attention.youthIntake", { count: item.count }),
          href: youthHref,
        };
      case "talk":
        return {
          icon: "talk",
          tone: "text-chart-4",
          text: t("morale.attention.talk", { name: item.name, reason: t(`morale.reason.${item.reason}`, { club: item.club ?? "" }) }),
          href: playerHref(item.playerId),
        };
      case "promiseDue":
        return {
          icon: "handshake",
          tone: "text-chart-4",
          text: item.promise.kind === "minutes"
            ? t("morale.attention.promiseMinutes", { name: item.name, target: item.promise.target ?? 1, played: item.promise.played ?? 0 })
            : t(`morale.attention.promise_${item.promise.kind}`, { name: item.name, date: formatDay(item.promise.until ?? "", i18n.language) }),
          href: playerHref(item.playerId),
        };
      case "windowClosing":
        return {
          icon: "clock",
          tone: "text-chart-4",
          text: t("transferWindows.attention.closing", { count: item.days, date: formatDay(item.until, i18n.language) }),
          href: "/transfers",
        };
      case "windowOpen":
        return {
          icon: "check-circle",
          tone: "text-chart-2",
          text: t("transferWindows.attention.open", { date: formatDay(item.until, i18n.language) }),
          href: "/transfers",
        };
      case "managerRenewal":
        return {
          icon: "file-signature",
          tone: "text-primary",
          text: t("managerContract.attention"),
          href: "/inbox",
        };
      case "scoutGem":
        return {
          icon: "gem",
          tone: "text-chart-5",
          text: t("scouting.attention.gem", { name: item.name, club: item.club }),
          href: "/scout?tab=gems",
        };
      case "shortlistAlert":
        return {
          icon: "binoculars",
          tone: "text-chart-2",
          text: t("scouting.attention.shortlist", { name: item.name, reason: t(`inbox.scouting.reason.${item.reason}`) }),
          href: "/scout?tab=shortlist",
        };
    }
  }

  return (
    <HomeCard title={t("dashboard.home.attentionTitle")}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground m-0">
          <Icon name="check-circle" size={16} className="text-chart-2" />
          {t("dashboard.home.allGood")}
        </p>
      ) : (
        <ul className="grid gap-x-6 sm:grid-cols-2 list-none m-0 p-0">
          {items.map((item, i) => {
            const d = describe(item);
            return (
              <li key={`${item.kind}-${i}`} className="border-t border-border/50 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
                <a
                  href={d.href}
                  className="flex items-center gap-3 min-h-10 py-2 text-sm text-foreground no-underline hover:text-primary"
                >
                  <Icon name={d.icon} size={16} className={`shrink-0 ${d.tone}`} />
                  <span className="min-w-0">{d.text}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}

// ── Highlights ───────────────────────────────────────────────────────────────

export function HighlightsCard({
  mode,
  items,
  clubColors,
  playerHref,
  statsHref,
  stars,
}: {
  mode: "season" | "overall";
  items: Highlight[];
  clubColors: readonly string[];
  playerHref: (playerId: string) => string;
  statsHref: string;
  /** Star per player id (`useStarPlayers`), the same marks the player profile shows. */
  stars?: ReadonlyMap<string, StarKind>;
}) {
  const { t } = useTranslation();
  return (
    <HomeCard title={t("dashboard.home.highlights")} href={statsHref} linkLabel={t("dashboard.home.seeStats")}>
      {mode === "overall" && (
        <p className="text-sm text-muted-foreground m-0">{t("dashboard.home.highlightsPreseason")}</p>
      )}
      <ul className="list-none m-0 p-0 flex flex-col">
        {items.map((h) => {
          const role = h.player.stats ? preferredRole(h.player) : undefined;
          const star = stars?.get(h.player.id);
          return (
            <li key={h.player.id} className="border-t border-border/50 first:border-t-0">
              <a
                href={playerHref(h.player.id)}
                className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary"
              >
                <PlayerFace
                  playerId={h.player.id}
                  nationality={h.player.nationality}
                  clubColors={clubColors}
                  size={40}
                  fallback={playerInitials(h.player.name)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold truncate">{h.player.name}</span>
                    {star && <StarBadge kind={star} />}
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {role && (
                      <span className={`font-display font-bold mr-2 ${getDetailedPositionColor(role)}`}>
                        {t(`roles.detailedAbbr.${role}`)}
                      </span>
                    )}
                    {mode === "season"
                      ? t("dashboard.home.highlightLine", { apps: h.appearances, goals: h.goals, assists: h.assists })
                      : t("dashboard.home.ageLine", { age: h.player.age })}
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="font-display font-bold text-xl text-primary tabular-nums leading-none">
                    {(mode === "season" ? h.rating : h.overall).toFixed(1)}
                  </span>
                  <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                    {mode === "season" ? t("dashboard.home.rating") : t("dashboard.home.overall")}
                  </span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </HomeCard>
  );
}

// ── Inbox ────────────────────────────────────────────────────────────────────

export function InboxCard({
  messages,
  unread,
  subjectOf,
}: {
  messages: InboxMessage[];
  unread: number;
  subjectOf: (m: InboxMessage) => string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <HomeCard
      title={
        <span className="inline-flex items-center gap-2">
          {t("dashboard.home.inbox")}
          {unread > 0 && (
            <span className="rounded bg-primary text-primary-foreground px-2 py-0.5 text-sm font-display font-bold tabular-nums">
              {unread}
            </span>
          )}
        </span>
      }
      href="/inbox"
      linkLabel={t("dashboard.home.openInbox")}
    >
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("dashboard.home.noMessages")}</p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col">
          {messages.map((m) => (
            <li key={m.id} className="border-t border-border/50 first:border-t-0">
              <a
                href={`/inbox?id=${encodeURIComponent(m.id)}`}
                className={`flex items-start gap-3 py-2.5 no-underline hover:text-primary border-l-2 pl-3 ${
                  m.read ? "border-l-transparent text-foreground/80" : "border-l-primary text-foreground"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${m.read ? "font-medium" : "font-bold"}`}>{subjectOf(m)}</div>
                  <div className="text-sm text-muted-foreground truncate">{m.preview}</div>
                </div>
                <span className="text-sm text-muted-foreground shrink-0">{formatDay(m.date, i18n.language)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

// ── Finances ─────────────────────────────────────────────────────────────────

export function WeekFinancesCard({ week, balance }: { week: WeekMoney | null; balance: number | null }) {
  const { t, i18n } = useTranslation();
  const cells: { label: string; value: number | null; tone: string }[] = [
    { label: t("dashboard.home.income"), value: week?.income ?? null, tone: "text-chart-2" },
    { label: t("dashboard.home.expenses"), value: week?.expenses ?? null, tone: "text-destructive" },
    { label: t("dashboard.home.weekNet"), value: week?.net ?? null, tone: (week?.net ?? 0) < 0 ? "text-destructive" : "text-chart-2" },
    { label: t("dashboard.home.balance"), value: balance, tone: (balance ?? 0) < 0 ? "text-destructive" : "text-foreground" },
  ];
  return (
    <HomeCard
      title={t("dashboard.home.weekFinances")}
      href="/finances"
      linkLabel={week ? t("dashboard.home.weekOf", { date: formatDay(week.weekStart, i18n.language) }) : t("nav.finances")}
    >
      <a href="/finances" className="grid grid-cols-2 md:grid-cols-4 gap-4 no-underline">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-1 min-w-0">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{c.label}</span>
            <span className={`font-display font-bold text-2xl tabular-nums leading-none ${c.value == null ? "text-muted-foreground" : c.tone}`}>
              {c.value == null ? "—" : formatEuros(c.value)}
            </span>
          </div>
        ))}
      </a>
    </HomeCard>
  );
}

/**
 * Works card (`.claude/rules/game/facilities.md`): the facility projects in progress (progress bar,
 * delivery date) and the ones finished in the last 7 days. The caller shows it only when there is
 * something to show.
 */
export function WorksCard({ facilities, today }: { facilities: ClubFacilities; today: string }) {
  const { t, i18n } = useTranslation();
  const what = (p: { kind: FacilityKind; stand?: StandId; seats?: number; level?: number }) => p.kind === "stand"
    ? t("facilities.projects.stand", { stand: t(`facilities.stand.${p.stand}`), seats: (p.seats ?? 0).toLocaleString(i18n.language) })
    : t("facilities.projects.level", { what: t(`facilities.kind.${p.kind}`), level: p.level });
  const recent = recentlyCompleted(facilities, today);
  return (
    <HomeCard title={t("dashboard.home.works")} href="/finances?tab=facilities" linkLabel={t("financesScreen.tabFacilities")}>
      <div className="flex flex-col gap-3">
        {facilities.projects.map((p) => {
          const progress = Math.round(projectProgress(p, today) * 100);
          return (
            <div key={p.id} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{what(p)}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{t("facilities.projects.delivery", { date: formatDay(p.end, i18n.language) })}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 bg-border rounded overflow-hidden flex-1 min-w-16">
                  <div className="h-full bg-primary rounded" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">{progress}%</span>
              </div>
            </div>
          );
        })}
        {recent.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <Icon name="check-circle" size={16} className="text-chart-2 shrink-0" />
            <span className="text-foreground">{what(c)}</span>
            <span className="text-muted-foreground tabular-nums">· {t("dashboard.home.worksDone", { date: formatDay(c.date, i18n.language) })}</span>
          </div>
        ))}
      </div>
    </HomeCard>
  );
}

/** Projects finished in the last 7 days. */
export function recentlyCompleted(f: ClubFacilities, today: string) {
  return f.completed.filter((c) => c.date <= today && c.date >= addDays(today, -7));
}
