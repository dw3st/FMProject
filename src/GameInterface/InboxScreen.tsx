import { newVisualOn, paintedNews } from "@/Domain/art/paintedFaces";
import { inboxAction } from "@/GameInterface/Inbox/inboxAction";
import { AchievementInboxBody } from "@/GameInterface/Achievements/AchievementInboxBody";
import { useEffect, useMemo, useRef, useState } from "react";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { AttributeChangeRow } from "@/GameInterface/Components/AttributeChangeRow";
import { NationalInboxBody } from "@/GameInterface/National/NationalInboxBody";
import { ArtIcon, Icon, iconOf } from "@/GameInterface/Icons";
import type { InboxCategory, InboxMessage } from "@/types/inboxTypes";
import type { LeagueData } from "@/types/playerTypes";
import { competitionName } from "@/Domain/world/labels";
import { Button } from "@/GameInterface/ui/Button";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { inboxThemeOf, INBOX_THEMES, themeCounts, type InboxTheme } from "@/Domain/inbox/inboxThemes";
import { objectiveText } from "@/GameInterface/boardText";
import { formatFee } from "@/Domain/money";
import { ManagerRenewalCard } from "@/GameInterface/Components/ManagerRenewalCard";
import { JobOfferCard } from "@/GameInterface/Components/JobOfferCard";
import { NationalCoachInboxBody, nationalCoachSubject } from "@/GameInterface/National/NationalCoachInboxBody";
import i18next from "@/i18n/i18n";
import { BidCard } from "@/GameInterface/Negotiation/BidCard";
import { SeatOfferCard } from "@/GameInterface/Negotiation/SeatOfferCard";
import { useSeatOffers } from "@/GameInterface/Negotiation/seatOfferApi";
import { PlayerTalkBody } from "@/GameInterface/Morale/PlayerTalkBody";
import { PressInboxBody } from "@/GameInterface/Press/PressInboxBody";
import type { MarketBid } from "@/types/transferMarketTypes";
import { clubRecordTexts } from "@/GameInterface/clubRecordText";
import { ScoutingInboxBody, scoutingTexts } from "@/GameInterface/Scouting/scoutingText";
import { AwardsInboxBody, awardsTexts } from "@/GameInterface/Awards/AwardsInboxBody";
import { InboxPrefsPanel } from "@/GameInterface/Inbox/InboxPrefsPanel";
import { formatEuros } from "@/Domain/money";
import { formatGameDate } from "@/GameInterface/formatDate";
import { attrDisplay } from "@/Domain/attributes";

const ArrowDownLeft = iconOf("arrow-down-left");
const ArrowUpRight = iconOf("arrow-up-right");
const Award = iconOf("award");
const FileText = iconOf("file-text");
const HeartPulse = iconOf("heart-pulse");
const TrendingUp = iconOf("trend-up");
const Trophy = iconOf("trophy");
const Prospect = iconOf("user");
const BoardIcon = iconOf("building");
const JobIcon = iconOf("file-signature");
const RegistrationIcon = iconOf("clipboard");
const TagIcon = iconOf("tag");
const TalkIcon = iconOf("talk");
const ScoutIcon = iconOf("binoculars");
const AwardIcon = iconOf("award");
const CalendarIcon = iconOf("calendar");
const DisciplineIcon = iconOf("alert");
const AchievementIcon = iconOf("medal");
const UsersIcon = iconOf("users");

type FilterTab = "all" | "unread";
type ThemeFilter = "all" | InboxTheme;

/** Continental news uses the shared Icon abstraction (`globe`) rather than importing lucide-react
 *  directly, so it slots into `CATEGORY_META.Icon` (a `{ className }` component) like every other
 *  category's direct lucide import does. */
function ContinentalIcon({ className }: { className?: string }) {
  return <Icon name="globe" className={className} />;
}

function PressIcon({ className }: { className?: string }) {
  return <Icon name="mic" className={className} />;
}

const CATEGORY_META: Record<
  InboxCategory,
  { labelKey: string; color: string; bg: string; border: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  development: {
    labelKey: "inbox.categories.development",
    color: "text-primary",
    bg: "bg-primary/15",
    border: "border-primary/30",
    Icon: TrendingUp,
  },
  transfer_in: {
    labelKey: "inbox.categories.transfer_in",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: ArrowDownLeft,
  },
  transfer_out: {
    labelKey: "inbox.categories.transfer_out",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: ArrowUpRight,
  },
  season: {
    labelKey: "inbox.categories.season",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: Trophy,
  },
  cup: {
    labelKey: "inbox.categories.cup",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/15",
    border: "border-fuchsia-500/30",
    Icon: Award,
  },
  club_record: {
    labelKey: "clubHistory.inboxCategory",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: Trophy,
  },
  continental: {
    labelKey: "inbox.categories.continental",
    color: "text-chart-3",
    bg: "bg-chart-3/15",
    border: "border-chart-3/30",
    Icon: ContinentalIcon,
  },
  injury: {
    labelKey: "inbox.categories.injury",
    color: "text-destructive",
    bg: "bg-destructive/15",
    border: "border-destructive/30",
    Icon: HeartPulse,
  },
  contract: {
    labelKey: "inbox.categories.contract",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: FileText,
  },
  youth: {
    labelKey: "inbox.categories.youth",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: Prospect,
  },
  retirement: {
    labelKey: "inbox.categories.retirement",
    color: "text-chart-5",
    bg: "bg-chart-5/15",
    border: "border-chart-5/30",
    Icon: Prospect,
  },
  facilities: {
    labelKey: "inbox.categories.facilities",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: BoardIcon,
  },
  board: {
    labelKey: "inbox.categories.board",
    color: "text-primary",
    bg: "bg-primary/15",
    border: "border-primary/30",
    Icon: BoardIcon,
  },
  transfer: {
    labelKey: "inbox.categories.transfer",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: TagIcon,
  },
  player: {
    labelKey: "inbox.categories.player",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: TalkIcon,
  },
  job: {
    labelKey: "inbox.categories.job",
    color: "text-chart-3",
    bg: "bg-chart-3/15",
    border: "border-chart-3/30",
    Icon: JobIcon,
  },
  manager_news: {
    labelKey: "inbox.categories.manager_news",
    color: "text-chart-5",
    bg: "bg-chart-5/15",
    border: "border-chart-5/30",
    Icon: JobIcon,
  },
  scouting: {
    labelKey: "inbox.categories.scouting",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: ScoutIcon,
  },
  awards: {
    labelKey: "inbox.categories.awards",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: AwardIcon,
  },
  registration: {
    labelKey: "inbox.categories.registration",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: RegistrationIcon,
  },
  press: {
    labelKey: "inbox.categories.press",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: PressIcon,
  },
  schedule: {
    labelKey: "inbox.categories.schedule",
    color: "text-chart-3",
    bg: "bg-chart-3/15",
    border: "border-chart-3/30",
    Icon: CalendarIcon,
  },
  discipline: {
    labelKey: "inbox.categories.discipline",
    color: "text-destructive",
    bg: "bg-destructive/15",
    border: "border-destructive/30",
    Icon: DisciplineIcon,
  },
  national: {
    labelKey: "inbox.categories.national",
    color: "text-chart-5",
    bg: "bg-chart-5/15",
    border: "border-chart-5/30",
    Icon: ContinentalIcon,
  },
  national_coach: {
    labelKey: "inbox.categories.national_coach",
    color: "text-chart-5",
    bg: "bg-chart-5/15",
    border: "border-chart-5/30",
    Icon: ContinentalIcon,
  },
  world: {
    labelKey: "inbox.categories.world",
    color: "text-chart-2",
    bg: "bg-chart-2/15",
    border: "border-chart-2/30",
    Icon: UsersIcon,
  },
  achievement: {
    labelKey: "inbox.categories.achievement",
    color: "text-chart-4",
    bg: "bg-chart-4/15",
    border: "border-chart-4/30",
    Icon: AchievementIcon,
  },
};

function formatInboxDate(dateStr: string): string {
  return dateStr ? formatGameDate(dateStr, i18next.language, "dayMonth") : "—";
}

function formatFullDate(dateStr: string): string {
  return dateStr ? formatGameDate(dateStr, i18next.language, "long") : "—";
}

export function InboxScreen({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { session, inboxMessages, setInboxMessages, refreshInbox } = useGameSave();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [theme, setTheme] = useState<ThemeFilter>("all");
  // `/inbox?id=<message>` (dashboard inbox card) opens that message.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") : null,
  );
  const [busy, setBusy] = useState(false);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  // Preferences panel (which news topics reach the inbox) in place of the message list.
  const [showPrefs, setShowPrefs] = useState(false);

  useEffect(() => {
    if (inboxMessages === null) {
      void refreshInbox();
    }
  }, [inboxMessages, refreshInbox]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  const messages = inboxMessages ?? [];
  const unreadCount = messages.reduce((acc, m) => (m.read ? acc : acc + 1), 0);

  const counts = useMemo(() => themeCounts(messages), [messages]);
  // Only themes that have messages get a chip; a theme that emptied out falls back to "all".
  const activeTheme: ThemeFilter = theme === "all" || counts.has(theme) ? theme : "all";
  useEffect(() => {
    if (theme !== activeTheme) setTheme(activeTheme);
  }, [theme, activeTheme]);

  const filtered = useMemo(
    () => messages.filter((m) => (filter === "unread" ? !m.read : true) && (activeTheme === "all" || inboxThemeOf(m.category) === activeTheme)),
    [messages, filter, activeTheme],
  );

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId],
  );

  async function handleSelect(message: InboxMessage) {
    setSelectedId(message.id);
    if (message.read || !session) return;

    setInboxMessages((prev) =>
      prev ? prev.map((m) => (m.id === message.id ? { ...m, read: true } : m)) : prev,
    );

    try {
      await fetch(`/api/saves/${session.saveId}/inbox/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [message.id] }),
      });
    } catch {
      void refreshInbox();
    }
  }

  async function handleMarkAllRead() {
    if (!session || busy || unreadCount === 0) return;
    setBusy(true);
    setInboxMessages((prev) =>
      prev ? prev.map((m) => (m.read ? m : { ...m, read: true })) : prev,
    );
    try {
      await fetch(`/api/saves/${session.saveId}/inbox/mark-all-read`, { method: "POST" });
    } catch {
      void refreshInbox();
    } finally {
      setBusy(false);
    }
  }

  // A message opened from the URL is marked read once the inbox has loaded.
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || !inboxMessages || !selectedId) return;
    openedFromUrl.current = true;
    const message = inboxMessages.find((m) => m.id === selectedId);
    if (message) void handleSelect(message);
  }, [inboxMessages, selectedId]);

  const loading = inboxMessages === null;

  return (
    <div className="flex flex-col h-full">
      {/* Modal header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0 flex-1">
          <TitleParts accent={t("screenTitles.inbox.accent")}>{t("screenTitles.inbox.main")}</TitleParts>
        </h2>
        <div className="flex items-center gap-2">
          <SegmentedTabs
            compact
            tabs={[
              { key: "all", label: t("common.all") },
              {
                key: "unread",
                label: (
                  <>
                    {t("inbox.unread")}
                    {unreadCount > 0 && <span className="tabular-nums text-primary">{unreadCount}</span>}
                  </>
                ),
              },
            ]}
            active={filter}
            onChange={setFilter}
          />
          <Button
            variant="secondary"
            aria-pressed={showPrefs}
            onClick={() => setShowPrefs((v) => !v)}
            disabled={!session}
            className={showPrefs ? "text-foreground" : ""}
          >
            <Icon name="settings" size={16} />
            <span className="hidden sm:inline">{t("inbox.prefs.button")}</span>
          </Button>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={busy || unreadCount === 0}
            className="px-3 h-10 text-sm font-semibold rounded border-0 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 bg-transparent hover:text-foreground"
          >
            <Icon name="check-check" className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("inbox.markAllRead")}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer flex items-center justify-center border-0"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4">
        {showPrefs && session ? (
          <InboxPrefsPanel saveId={session.saveId} />
        ) : loading ? (
          <div className="card-arcade rounded-md p-12 text-center h-full flex items-center justify-center">
            <p className="text-muted-foreground text-sm m-0">{t("inbox.loadingMessages")}</p>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <div className="card-arcade rounded-md overflow-hidden flex flex-col min-h-0">
              <OptionChips<ThemeFilter>
                aria-label={t("inbox.themes.label")}
                className="shrink-0 p-3 border-b border-border"
                value={activeTheme}
                onChange={setTheme}
                options={[
                  { key: "all", label: t("common.all") },
                  ...INBOX_THEMES.filter((th) => counts.has(th)).map((th) => {
                    const unread = counts.get(th)?.unread ?? 0;
                    return {
                      key: th,
                      label: (
                        <>
                          {t(`inbox.themes.${th}`)}
                          {unread > 0 && <span className="tabular-nums ml-1.5 text-primary">{unread}</span>}
                        </>
                      ),
                    };
                  }),
                ]}
              />
              <div className="flex-1 overflow-y-auto divide-y divide-border">
                {filtered.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground m-0">
                    {t("inbox.noMessagesInView")}
                  </p>
                ) : (
                  filtered.map((m) => (
                    <MessageRow
                      key={m.id}
                      message={m}
                      active={selectedId === m.id}
                      onClick={() => handleSelect(m)}
                    />
                  ))
                )}
              </div>
            </div>
            <div className="card-arcade rounded-md overflow-hidden flex flex-col min-h-0">
              {selected ? (
                <MessageDetail message={selected} leagues={leagues} />
              ) : (
                <div className="flex-1 flex items-center justify-center p-12">
                  <p className="text-sm text-muted-foreground m-0">
                    {t("inbox.selectMessage")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-md p-16 text-center flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-md bg-muted/30 border border-border flex items-center justify-center">
        <Icon name="news" className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground text-sm m-0">
        {t("inbox.emptyState")}
      </p>
    </div>
  );
}

/** Translated subject and body of a facilities message (`.claude/rules/game/facilities.md`). */
function facilityTexts(
  message: Extract<InboxMessage, { category: "facilities" }>,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { subject: string; body: string } {
  const item = message.item ? t(`facilities.item.${message.item}`) : "";
  const what = message.item
    ? message.facility && message.kind === "approved" ? `${t(`facilities.kind.${message.facility}`)}: ${item}` : item
    : message.facility
    ? message.facility === "stand" && message.stand
      ? t("facilities.inbox.standWhat", { stand: t(`facilities.stand.${message.stand}`), seats: (message.seats ?? 0).toLocaleString(i18next.language) })
      : t("facilities.inbox.levelWhat", { what: t(`facilities.kind.${message.facility}`), level: message.level ?? "" })
    : "";
  const vars = {
    what, cost: formatFee(message.cost ?? 0), date: message.end ?? "",
    pct: Math.round((message.boardShare ?? 0) * 100),
    attendance: (message.attendance ?? 0).toLocaleString(), previous: (message.previous ?? 0).toLocaleString(),
    reason: message.reason ? t(`facilities.reason.${message.reason}`) : "",
    condition: Math.round(message.condition ?? 0), level: message.level ?? "",
    turf: message.turf ? t(`facilities.turf.type.${message.turf}`).toLowerCase() : "",
  };
  const body = message.kind === "approved" && (message.boardShare ?? 0) > 0
    ? t("facilities.inbox.approvedFunded", vars)
    : message.kind === "repaired" && message.facility === "upgrade"
      ? t("facilities.inbox.upgraded", vars)
      : t(`facilities.inbox.${message.kind}`, vars);
  return { subject: t(`facilities.inbox.subject.${message.kind}`, vars), body };
}

/** Subject shown for a message (translated for league prize news), shared with the dashboard card. */
export function inboxSubject(
  message: InboxMessage,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return leaguePrizeTexts(message, t)?.subject ?? message.subject;
}

/** Preview shown for a message (translated where the stored text is English), shared with the dashboard card. */
export function inboxPreview(
  message: InboxMessage,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return leaguePrizeTexts(message, t)?.preview ?? message.preview;
}

/**
 * Subject and preview of the news categories whose stored text is English (#154): continental, cup,
 * injury, contract, academy, retirement, season, development and transfers, rebuilt from the message fields.
 */
function newsTexts(
  message: InboxMessage,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { subject: string; preview: string } | null {
  const lang = i18next.language;
  switch (message.category) {
    case "continental": {
      const competition = competitionName(message.competition, [], lang);
      const stage = t(`continental.stage.${message.stage}`, { defaultValue: message.stage });
      const venue = message.venue ? t(`inbox.cup.venue.${message.venue}`) : "?";
      const preview =
        message.kind === "qualified" ? t("inbox.continental.qualified", { competition })
        : message.kind === "group" ? t("inbox.continental.group", { competition, group: message.group ?? "?", opponents: (message.opponentNames ?? []).join(", ") })
        : message.kind === "champion" ? t("inbox.continental.champion", { competition })
        : message.kind === "eliminated"
          ? message.opponentName
            ? t("inbox.continental.eliminated", { competition, stage, opponent: message.opponentName })
            : t("inbox.continental.eliminatedGroup", { competition })
        : t("inbox.continental.draw", {
            competition, stage, opponent: message.opponentName ?? "?", venue,
            date: message.firstLegDate ? formatFullDate(message.firstLegDate) : "?",
          });
      return { subject: t(`inbox.subjects.continental.${message.kind}`, { competition }), preview };
    }
    case "cup": {
      const cup = message.cupName;
      const stage = t(`cups.stage.${message.stage}`, { defaultValue: message.stage });
      const preview =
        message.kind === "champion" ? t("inbox.cup.champion", { cup })
        : message.kind === "eliminated" ? t("inbox.cup.eliminated", { cup, stage, opponent: message.opponentName ?? "?" })
        : t("inbox.cup.draw", {
            cup, stage, opponent: message.opponentName ?? "?",
            venue: message.venue ? t(`inbox.cup.venue.${message.venue}`) : "?",
            date: message.tieDate ? formatFullDate(message.tieDate) : "?",
          });
      return { subject: t(`inbox.subjects.cup.${message.kind}`, { cup }), preview };
    }
    case "injury": {
      const player = message.playerName;
      const preview =
        message.kind === "suspended" ? t("inbox.injury.suspended", { player, count: message.matches ?? 1 })
        : message.kind === "returned" ? t("inbox.injury.returned", { player })
        : t("inbox.injury.injured", {
            player, severity: t(`inbox.injury.severity.${message.severity ?? "light"}`),
            date: formatInboxDate(message.returnDate ?? ""),
          });
      return { subject: t(`inbox.subjects.injury.${message.kind}`, { player }), preview };
    }
    case "contract":
      if (message.kind !== "expiring" && message.kind !== "renewed" && message.kind !== "released") return null;
      return { subject: t(`inbox.subjects.contract.${message.kind}`), preview: message.players.map((p) => p.name).join(", ") };
    case "youth":
      return message.kind === "intake"
        ? {
            subject: t("inbox.subjects.youth.intake", { year: message.year ?? "", count: message.count ?? 0 }),
            preview: message.best ? t("inbox.subjects.youth.standout", { player: message.best.name }) : "",
          }
        : { subject: t("inbox.subjects.youth.released"), preview: (message.players ?? []).map((p) => p.name).join(", ") };
    case "retirement":
      return {
        subject: t(`inbox.subjects.retirement.${message.kind}`, { player: message.playerName }),
        preview: t("inbox.subjects.retirement.preview", { player: message.playerName, age: message.age }),
      };
    case "season": {
      const league = message.leagueName;
      const season = message.seasonYear;
      switch (message.kind) {
        case "champion":
        case "promoted":
        case "relegated":
          return {
            subject: t(`inbox.subjects.season.${message.kind}`, { league }),
            preview: t(`inbox.subjects.season.${message.kind}Preview`, { league, season }),
          };
        case "followers": {
          const before = message.followersBefore ?? 0;
          const after = message.followersAfter ?? 0;
          const pct = before > 0 ? Math.round(((after - before) / before) * 100) : 0;
          return {
            subject: t(after >= before ? "inbox.subjects.season.followersUp" : "inbox.subjects.season.followersDown"),
            preview: t("inbox.subjects.season.followersPreview", {
              season, followers: after.toLocaleString(lang), pct: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`,
            }),
          };
        }
        case "negative_balance":
          return {
            subject: t("inbox.subjects.season.negative_balance"),
            preview: t("inbox.season.negativeBalance", { balance: formatFee(message.balance ?? 0) }),
          };
        default:
          return null;
      }
    }
    case "development": {
      const up = message.changes.filter((c) => c.to > c.from).length;
      const down = message.changes.filter((c) => c.to < c.from).length;
      const key = up > 0 && down === 0 ? "up" : down > 0 && up === 0 ? "down" : "mixed";
      return {
        subject: t(`inbox.subjects.development.${key}`, { player: message.playerName }),
        preview: message.changes
          .map((c) => `${t(`attributeNames.${c.attribute}`, { defaultValue: c.attribute })} ${attrDisplay(c.from)}→${attrDisplay(c.to)}`)
          .join(", "),
      };
    }
    case "transfer_in":
    case "transfer_out":
      return {
        subject: t(`inbox.subjects.${message.category}`, { player: message.playerName }),
        preview: message.category === "transfer_in" ? message.fromClub : message.toClub,
      };
    default:
      return null;
  }
}

/** Translated subject/preview for league prize and board messages; every other message keeps its stored text. */
function leaguePrizeTexts(
  message: InboxMessage,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { subject: string; preview: string } | null {
  if (message.category === "club_record") {
    const x = clubRecordTexts(message.record, t, (slug) => slug);
    return { subject: t("clubHistory.inboxSubject", { record: x.label }), preview: `${x.value} · ${x.detail}` };
  }
  if (message.category === "facilities") {
    const x = facilityTexts(message, t);
    return { subject: x.subject, preview: x.body };
  }
  if (message.category === "discipline") {
    return { subject: t("complaint.inbox.subject"), preview: t("complaint.inbox.body", { count: message.matches }) };
  }
  if (message.category === "national") {
    return {
      subject: t(`national.inbox.subject.${message.kind}`, { count: message.players.length }),
      preview: message.players.map((p) => p.name).join(", "),
    };
  }
  if (message.category === "national_coach") {
    return { subject: nationalCoachSubject(message, t, i18nLang()), preview: message.nation };
  }
  if (message.category === "achievement") {
    return {
      subject: message.keys.length === 1 ? t("achievements.inbox.subject") : t("achievements.inbox.subjectMany", { count: message.keys.length }),
      preview: t("achievements.inbox.preview", { points: message.points }),
    };
  }
  if (message.category === "board") {
    return { subject: t(`inbox.board.subject.${message.kind}`), preview: boardText(message, t, message.leagueName ?? "") };
  }
  if (message.category === "registration") {
    return {
      subject: t(`inbox.registration.subject.${message.kind}`, { competition: message.competitionName }),
      preview: (message.players ?? []).map((p) => p.name).join(", ") || message.competitionName,
    };
  }
  if (message.category === "job") {
    return { subject: t(`inbox.job.subject.${message.kind}`, { club: message.clubName }), preview: message.leagueName };
  }
  if (message.category === "press") {
    return { subject: t("press.inbox.subject", { trigger: t(`press.trigger.${message.trigger}`) }), preview: message.opponent ?? "" };
  }
  if (message.category === "player") {
    const key = message.kind === "talk" ? "talk" : message.kind;
    return { subject: t(`morale.inbox.subject.${key}`, { player: message.playerName }), preview: message.playerName };
  }
  if (message.category === "transfer") {
    const vars = transferVars(message);
    return { subject: t(transferTextKey(message, "subject"), vars), preview: message.fee ? formatFee(message.fee) : message.clubName };
  }
  if (message.category === "scouting") {
    const x = scoutingTexts(message, t);
    return { subject: x.subject, preview: x.body };
  }
  if (message.category === "awards") return awardsTexts(message, t);
  if (message.category === "world" && message.kind === "auto_advanced") {
    const until = formatInboxDate(message.until);
    return {
      subject: t("world.advance.inbox.subject"),
      preview: message.simulated
        ? t("world.advance.inbox.previewSimulated", { until, match: formatInboxDate(message.simulated) })
        : t("world.advance.inbox.preview", { until }),
    };
  }
  if (message.category === "world" && message.kind === "live_refused") {
    return {
      subject: t("world.advance.refused.subject"),
      preview: t(`world.advance.refused.reason.${message.reason}`),
    };
  }
  if (message.category === "world" && message.kind === "inactive_warning") {
    return { subject: t("world.inbox.inactive_warning.subject"), preview: formatInboxDate(message.removeOn) };
  }
  if (message.category === "world" && message.kind === "season_closed") {
    const vars = { manager: message.managerName, club: message.clubName, season: message.season, points: message.points, count: message.points, rank: message.rank, of: message.of };
    return { subject: t("world.inbox.season_closed.subject", vars), preview: t("world.inbox.season_closed.preview", vars) };
  }
  if (message.category === "world") {
    const vars = { manager: message.managerName, club: message.clubName };
    return { subject: t(`world.inbox.${message.kind}.subject`, vars), preview: message.clubName };
  }
  if (message.category === "schedule") {
    const first = message.games[0];
    return {
      subject: message.games.length === 1
        ? t("schedule.subjectOne")
        : t("schedule.subjectMany", { count: message.games.length }),
      preview: first ? t("schedule.preview", { opponent: first.opponentName, from: formatInboxDate(first.from), to: formatInboxDate(first.to) }) : "",
    };
  }
  if (message.category === "contract" && message.kind === "director_summary") {
    return { subject: t("inbox.contract.directorSummarySubject"), preview: message.preview };
  }
  if (message.category === "contract" && message.staff) {
    return { subject: t(`inbox.contract.${message.kind}Subject`), preview: message.preview };
  }
  if (message.category === "manager_news") {
    return {
      subject: t("inbox.managerNews.subject", { count: message.items.length }),
      preview: message.items.map((i) => i.clubName).join(", "),
    };
  }
  const news = newsTexts(message, t);
  if (news) return news;
  if (message.category !== "season" || message.kind !== "league_prize") return null;
  return {
    subject: t("inbox.season.leaguePrizeSubject", { league: message.leagueName }),
    preview: t("inbox.season.leaguePrizePreview", { league: message.leagueName }),
  };
}

function MessageRow({
  message,
  active,
  onClick,
}: {
  message: InboxMessage;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[message.category];
  const MetaIcon = meta.Icon;
  const unread = !message.read;
  const prizeTexts = leaguePrizeTexts(message, t);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-4 transition-colors cursor-pointer border-0 flex gap-3 items-start ${
        active ? "bg-primary/10" : "hover:bg-muted/30 bg-transparent"
      } ${unread ? "border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
    >
      <InboxCategoryTile message={message} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className={`text-sm truncate ${
              unread ? "font-black text-foreground" : "font-medium text-foreground/80"
            }`}
          >
            {prizeTexts?.subject ?? message.subject}
          </span>
          <span className="text-sm text-muted-foreground shrink-0">
            {formatInboxDate(message.date)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground m-0 leading-snug truncate">{prizeTexts?.preview ?? message.preview}</p>
      </div>
    </button>
  );
}

function MessageDetail({ message, leagues }: { message: InboxMessage; leagues: LeagueData[] }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[message.category];
  const MetaIcon = meta.Icon;
  const prizeTexts = leaguePrizeTexts(message, t);

  // The painted illustration of the category over the message (art phase 7, new visual only).
  const illustration = paintedNews(message.category);
  return (
    <div className="flex-1 overflow-y-auto">
      {illustration && (
        <div className="relative w-full aspect-[16/5] overflow-hidden border-b border-border bg-secondary/30">
          <img src={illustration} alt="" className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <InboxCategoryTile message={message} large />
          <div className="flex-1 min-w-0">
            <span
              className={`text-[13px] font-black uppercase font-display tracking-[0.08em] ${meta.color}`}
            >
              {t(meta.labelKey)}
            </span>
            <h2 className="font-display font-black uppercase text-xl leading-none m-0">
              {prizeTexts?.subject ?? message.subject}
            </h2>
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {formatFullDate(message.date)}
          </span>
        </div>
      </div>
      <div className="p-6">
        <InboxMessageBody message={message} leagues={leagues} />
      </div>
    </div>
  );
}

/**
 * The body of a message with its actions (accept, answer, open the player...): the inbox detail and the dashboard
 * inbox card (quick answer, tester report) render the same thing.
 */
export function InboxMessageBody({ message, leagues }: { message: InboxMessage; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  return (
    <>
    {message.category === "development" && <DevelopmentBody message={message} />}
    {message.category === "transfer_in" && (
      <TransferBody
        direction="in"
        playerName={message.playerName}
        club={message.fromClub}
        fee={message.feeEuros}
        date={message.date}
      />
    )}
    {message.category === "transfer_out" && (
      <TransferBody
        direction="out"
        playerName={message.playerName}
        club={message.toClub}
        fee={message.feeEuros}
        date={message.date}
      />
    )}
    {message.category === "season" && <SeasonBody message={message} />}
    {message.category === "cup" && <CupBody message={message} leagues={leagues} />}
    {message.category === "continental" && <ContinentalBody message={message} leagues={leagues} />}
    {message.category === "injury" && <InjuryBody message={message} />}
    {message.category === "club_record" && (() => {
      const x = clubRecordTexts(message.record, t, (slug) => competitionName(slug, leagues, i18n.language));
      return <p className="text-sm text-foreground m-0">{t("clubHistory.inboxBody", { record: x.label, value: x.value, detail: x.detail })}</p>;
    })()}
    {message.category === "youth" && (
      <p className="text-sm text-foreground m-0">
        {message.kind === "intake"
          ? t("inbox.youth.intake", {
              year: message.year, count: message.count,
              best: message.best?.name ?? "",
            })
          : t("inbox.youth.released", { players: (message.players ?? []).map((p) => p.name).join(", ") })}
      </p>
    )}
    {message.category === "retirement" && <RetirementBody message={message} />}
    {message.category === "facilities" && <p className="text-sm text-foreground m-0">{facilityTexts(message, t).body}</p>}
    {message.category === "job" && <JobBody message={message} leagues={leagues} />}
    {message.category === "transfer" && <TransferNegotiationBody message={message} />}
    {message.category === "player" && <PlayerTalkBody message={message} />}
    {message.category === "press" && <PressInboxBody message={message} />}
    {message.category === "manager_news" && <ManagerNewsBody message={message} />}
    {message.category === "scouting" && <ScoutingInboxBody message={message} leagues={leagues} />}
    {message.category === "awards" && <AwardsInboxBody message={message} />}
    {message.category === "registration" && <RegistrationInboxBody message={message} leagues={leagues} />}
    {message.category === "schedule" && <ScheduleBody message={message} leagues={leagues} />}
    {message.category === "world" && message.kind === "auto_advanced" && (
      <p className="text-sm text-foreground m-0">
        {message.simulated
          ? t("world.advance.inbox.bodySimulated", { until: formatInboxDate(message.until), match: formatInboxDate(message.simulated) })
          : t("world.advance.inbox.body", { until: formatInboxDate(message.until) })}
      </p>
    )}
    {message.category === "world" && message.kind === "live_refused" && (
      <p className="text-sm text-foreground m-0">
        {t("world.advance.refused.body", { match: formatInboxDate(message.match), reason: t(`world.advance.refused.reason.${message.reason}`) })}
      </p>
    )}
    {message.category === "world" && message.kind === "season_closed" && (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground m-0">
          {t("world.inbox.season_closed.body", {
            manager: message.managerName, club: message.clubName, season: message.season,
            points: message.points, count: message.points, rank: message.rank, of: message.of,
          })}
        </p>
        <a href="/world?tab=standings" className="font-semibold text-primary hover:underline w-fit">{t("world.inbox.season_closed.open")}</a>
      </div>
    )}
    {message.category === "world" && message.kind === "inactive_warning" && (
      <p className="text-sm text-foreground m-0">{t("world.inbox.inactive_warning.body")}</p>
    )}
    {message.category === "world" && message.kind !== "auto_advanced" && message.kind !== "live_refused" && message.kind !== "season_closed" && message.kind !== "inactive_warning" && (
      <p className="text-sm text-foreground m-0">
        {t(`world.inbox.${message.kind}.body`, { manager: message.managerName, club: message.clubName })}
      </p>
    )}
    {message.category === "world" && message.kind === "h2h_invite" && <H2HInviteJoin match={message.match} />}
    {message.category === "discipline" && <p className="text-sm text-foreground m-0">{t("complaint.inbox.body", { count: message.matches })}</p>}
    {message.category === "national" && <NationalInboxBody message={message} />}
    {message.category === "national_coach" && <NationalCoachInboxBody message={message} />}
    {message.category === "achievement" && <AchievementInboxBody keys={message.keys} points={message.points} />}
    {message.category === "board" && (
      <p className="text-sm text-foreground m-0">
        {boardText(
          message, t,
          message.objective ? competitionName(message.objective.leagueSlug, leagues, i18n.language) || (message.leagueName ?? "") : "",
        )}
      </p>
    )}
    {message.category === "board" && message.kind === "contract_offer" && <RenewalBody />}
    {message.category === "contract" && message.kind === "director_summary" && <DirectorSummaryBody message={message} />}
    {message.category === "contract" && message.kind !== "director_summary" && (
      <p className="text-sm text-foreground m-0">
        {t(`inbox.contract.${message.kind}`, {
          players: message.staff
            ? message.staff.map((m) => `${m.name} (${t(`staff.roles.${m.role}`)})`).join(", ")
            : message.players.map((p) => p.name).join(", "),
          until: formatInboxDate(message.until ?? ""),
        })}
      </p>
    )}
    <InboxActionButton message={message} />
    </>
  );
}

/** The task the message asks for, as a button (`inboxAction`). */
function InboxActionButton({ message }: { message: InboxMessage }) {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const action = inboxAction(message, session && session.clubId ? { leagueSlug: session.leagueSlug, clubId: session.clubId } : null);
  if (!action) return null;
  return (
    <a href={action.href} className="mt-4 inline-flex items-center h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold no-underline w-fit">
      {t(`inbox.actions.${action.label}`)}
    </a>
  );
}

/** Registration news: the list made, an arrival out of the list, the deadline closing (`registration.md`). */
function RegistrationInboxBody({ message, leagues }: { message: Extract<InboxMessage, { category: "registration" }>; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const competition = competitionName(message.competition, leagues, i18n.language) || message.competitionName;
  const c = message.counts;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="m-0 text-foreground">
        {t(`inbox.registration.body.${message.kind}`, {
          competition,
          players: (message.players ?? []).map((p) => p.name).join(", "),
          date: formatInboxDate(message.opensOn ?? message.until ?? ""),
        })}
      </p>
      {c && (
        <p className="m-0 text-muted-foreground tabular-nums">
          {t("inbox.registration.counts", { counted: c.counted, max: c.max ?? "—", foreign: c.foreign, formed: c.formed, free: c.free })}
        </p>
      )}
    </div>
  );
}

/** League games of the club moved off a clash: competition, opponent (home/away), old → new date. */
function ScheduleBody({ message, leagues }: { message: Extract<InboxMessage, { category: "schedule" }>; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="m-0 text-foreground">{t("schedule.intro")}</p>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {message.games.map((g) => (
          <li key={`${g.competition}-${g.opponentId}-${g.from}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold text-foreground">
              {t(g.home ? "schedule.home" : "schedule.away", { opponent: g.opponentName })}
            </span>
            <span className="text-muted-foreground">
              {leagues.length > 0 ? competitionName(g.competition, leagues, i18n.language) : g.competitionName}
            </span>
            <span className="tabular-nums text-foreground">
              {t("schedule.line", { from: formatFullDate(g.from), to: formatFullDate(g.to) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The director's contract decisions of a Monday: renewed (years, wage), leaving, refused. */
function DirectorSummaryBody({ message }: { message: Extract<InboxMessage, { category: "contract" }> }) {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const href = (id: string) => session
    ? `/player/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}/${encodeURIComponent(id)}`
    : undefined;
  const name = (p: { id: string; name: string }) => {
    const h = href(p.id);
    return h ? <a href={h} className="font-semibold text-primary hover:underline">{p.name}</a> : <span className="font-semibold">{p.name}</span>;
  };
  const renewed = message.renewed ?? [];
  const leaving = message.leaving ?? [];
  const refused = message.refused ?? [];
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="m-0 text-foreground">{t("inbox.contract.directorSummaryIntro")}</p>
      {renewed.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("inbox.contract.directorRenewed")}</SectionLabel>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {renewed.map((p) => (
              <li key={p.id} className="tabular-nums">
                {name(p)} <span className="text-muted-foreground">· {t("inbox.contract.directorRenewedTerms", { years: p.years, wage: formatEuros(p.wage) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {leaving.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("inbox.contract.directorLeaving")}</SectionLabel>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">{leaving.map((p) => <li key={p.id}>{name(p)}</li>)}</ul>
        </div>
      )}
      {refused.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{t("inbox.contract.directorRefused")}</SectionLabel>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">{refused.map((p) => <li key={p.id}>{name(p)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{children}</span>;
}

function RetirementBody({
  message,
}: {
  message: Extract<InboxMessage, { category: "retirement" }>;
}) {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    if (message.kind !== "reborn" || !saveId) return;
    fetch(`/api/saves/${saveId}/reborn`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: { offers: { id: string }[] }) => setPending(d.offers.some((o) => o.id === message.retiredId)))
      .catch(() => setPending(false));
  }, [message.kind, message.retiredId, saveId]);

  async function answer(accept: boolean) {
    if (!saveId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/reborn/${message.retiredId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === "youthFull" ? t("inbox.retirement.youthFull")
            : body.error === "offerClosed" ? t("inbox.retirement.closed")
              : t("inbox.retirement.actionFailed"),
        );
        return;
      }
      setResult(accept ? "accepted" : "declined");
      setPending(false);
      if (accept) void refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">
        {t("inbox.retirement.retired", {
          player: message.playerName, age: message.age, games: message.appearances, goals: message.goals,
        })}
      </p>
      {message.kind === "reborn" && (
        <div className="space-y-3">
          <p className="text-sm text-foreground m-0">{t("inbox.retirement.rebornOffer", { player: message.playerName })}</p>
          {result ? (
            <p className="text-sm text-muted-foreground m-0">{t(`inbox.retirement.${result}`)}</p>
          ) : pending ? (
            <div className="flex items-center gap-4">
              <Button disabled={busy} onClick={() => void answer(true)}>{t("inbox.retirement.accept")}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>
                {t("inbox.retirement.decline")}
              </Button>
            </div>
          ) : pending === false ? (
            <p className="text-sm text-muted-foreground m-0">{t("inbox.retirement.closed")}</p>
          ) : null}
          {error && <p className="text-sm text-destructive m-0">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Negotiation news (`.claude/rules/game/negotiation.md`): an AI bid card (live state from
 * `GET /negotiation`), a loan that ended, or sell-on money received.
 */
/** i18n variables of a negotiation / window message. */
function transferVars(message: Extract<InboxMessage, { category: "transfer" }>) {
  const day = (d?: string) => (d ? formatFullDate(d) : "—");
  return {
    club: message.clubName, player: message.playerName, fee: formatFee(message.fee ?? 0),
    share: Math.round((message.wageShare ?? 1) * 100), pct: message.sellOnPct ?? 0,
    country: message.country ?? message.clubName, until: day(message.until), opensOn: day(message.opensOn),
    deadline: day(message.expires), wage: formatFee(message.wage ?? 0), years: message.years ?? 0,
  };
}

/** i18n key of a transfer message's subject or body; an offer between managers has one text per move. */
function transferTextKey(message: Extract<InboxMessage, { category: "transfer" }>, part: "subject" | "body"): string {
  if (message.kind === "seat_offer") return `inbox.transfer.seatOffer.${message.offerAction ?? "offer"}.${part}`;
  return `inbox.transfer.${part}.${message.kind}`;
}

/** Sackings and hirings of the day in the player's league (`.claude/rules/game/managers.md`). */
function ManagerNewsBody({ message }: { message: Extract<InboxMessage, { category: "manager_news" }> }) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 pl-5 space-y-1">
      {message.items.map((i, n) => (
        <li key={`${i.squadId}-${n}`} className="text-sm text-foreground">
          {t(`inbox.managerNews.${i.kind}${i.interim ? "Interim" : ""}`, { club: i.clubName, manager: i.managerName })}
        </li>
      ))}
    </ul>
  );
}

function TransferNegotiationBody({ message }: { message: Extract<InboxMessage, { category: "transfer" }> }) {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const [bid, setBid] = useState<MarketBid | null | undefined>(undefined);
  const isBid = message.kind === "bid" || message.kind === "loan_bid";
  const saveId = session?.saveId;
  // An offer between managers (multiplayer part 4): the live card while it is still open.
  const isSeatOffer = message.kind === "seat_offer" && !!message.offerId;
  const seatOffers = useSeatOffers(isSeatOffer ? saveId : null);
  const seatOffer = isSeatOffer ? seatOffers.data?.offers.find((o) => o.id === message.offerId) ?? null : null;
  // Once shown, the card stays (answered here, or closed by the other manager) so its outcome is readable.
  const [seatShown, setSeatShown] = useState(false);
  useEffect(() => { setSeatShown(false); }, [message.offerId]);
  useEffect(() => { if (seatOffer) setSeatShown(true); }, [seatOffer]);
  useEffect(() => {
    if (!isBid || !saveId) return;
    let alive = true;
    void fetch(`/api/saves/${saveId}/negotiation`)
      .then((r) => (r.ok ? r.json() : { bids: [] }))
      .then((body: { bids?: MarketBid[] }) => { if (alive) setBid((body.bids ?? []).find((b) => b.id === message.bidId) ?? null); })
      .catch(() => { if (alive) setBid(null); });
    return () => { alive = false; };
  }, [isBid, saveId, message.bidId]);
  const vars = transferVars(message);
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">{t(transferTextKey(message, "body"), vars)}</p>
      {isBid && saveId && bid !== undefined && <BidCard saveId={saveId} bid={bid} onAnswered={() => void refresh()} />}
      {seatShown && saveId && <SeatOfferCard saveId={saveId} offer={seatOffer} onChanged={() => void refresh()} />}
    </div>
  );
}

/** Job news (`.claude/rules/game/jobs.md`): an offer card while it is pending, or the takeover. */
function JobBody({
  message,
  leagues,
}: {
  message: Extract<InboxMessage, { category: "job" }>;
  leagues: LeagueData[];
}) {
  const { t, i18n } = useTranslation();
  const { session, save, currentDate, refresh } = useGameSave();
  const league = competitionName(message.leagueSlug, leagues, i18n.language) || message.leagueName;
  if (message.kind === "hired") {
    return <p className="text-sm text-foreground m-0">{t("inbox.job.hired", { club: message.clubName, league })}</p>;
  }
  const offer = message.offer;
  if (!offer || !session) {
    return <p className="text-sm text-foreground m-0">{t("inbox.job.offer", { club: message.clubName, league })}</p>;
  }
  const pending = (save?.jobOffers ?? []).some((o) => o.id === offer.id) && offer.expires >= currentDate;
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0">{t("inbox.job.offer", { club: message.clubName, league })}</p>
      <JobOfferCard
        saveId={session.saveId}
        offer={offer}
        leagues={leagues}
        pending={pending}
        currentClubName={save?.unemployed ? null : (save?.clubName ?? null)}
        onAnswered={() => void refresh()}
      />
    </div>
  );
}

function InjuryBody({
  message,
}: {
  message: Extract<InboxMessage, { category: "injury" }>;
}) {
  const { t } = useTranslation();
  if (message.kind === "suspended") {
    return (
      <p className="text-sm text-foreground m-0">
        {t("inbox.injury.suspended", { player: message.playerName, count: message.matches ?? 1 })}
      </p>
    );
  }
  if (message.kind === "returned") {
    return (
      <p className="text-sm text-foreground m-0">
        {t("inbox.injury.returned", { player: message.playerName })}
      </p>
    );
  }
  const severity = t(`inbox.injury.severity.${message.severity ?? "light"}`);
  return (
    <p className="text-sm text-foreground m-0">
      {t("inbox.injury.injured", {
        player: message.playerName,
        severity,
        date: formatInboxDate(message.returnDate ?? ""),
      })}
    </p>
  );
}

function PrizeLine({ prize }: { prize?: number }) {
  const { t } = useTranslation();
  if (!prize || prize <= 0) return null;
  return (
    <p className="text-sm font-semibold text-chart-2 m-0 mt-1 tabular-nums">
      {t("inbox.prizeAmount", { amount: formatFee(prize) })}
    </p>
  );
}

/** The board's renewal offer, live from the save (Accept / Decline while pending). */
function RenewalBody() {
  const { session, save, refresh } = useGameSave();
  if (!session) return null;
  return <ManagerRenewalCard saveId={session.saveId} renewal={save?.managerRenewal} onAnswered={() => void refresh()} />;
}

/** Body text of a board message (`.claude/rules/game/board-fans.md`). */
function boardText(
  message: Extract<InboxMessage, { category: "board" }>,
  t: (key: string, opts?: Record<string, unknown>) => string,
  league: string,
): string {
  switch (message.kind) {
    case "objective":
      return message.objective
        ? t("inbox.board.objective", { season: message.objective.season, league, objective: objectiveText(message.objective, t) })
        : "";
    case "ultimatum":
      return t("inbox.board.ultimatum", { points: message.ultimatum?.points ?? 0, matches: message.ultimatum?.matches ?? 0 });
    case "bonus":
      return t("inbox.board.bonus", { amount: formatFee(message.bonus ?? 0) });
    case "sacked":
      return t(`inbox.board.sacked.${message.reason ?? "board"}`);
    case "contract_offer":
    case "contract_renewed":
      return t(`inbox.board.${message.kind}`, {
        wage: formatFee(message.contract?.wage ?? 0), count: message.contract?.seasons ?? 1,
        until: message.contract?.until ? formatFullDate(message.contract.until) : "",
      });
    default:
      return t(`inbox.board.${message.kind}`, { board: message.board ?? 0 });
  }
}

function SeasonBody({
  message,
}: {
  message: Extract<InboxMessage, { category: "season" }>;
}) {
  const { t } = useTranslation();
  if (message.kind === "negative_balance") {
    const bal = message.balance ?? 0;
    const balanceText = formatFee(bal);
    return (
      <p className="text-sm text-foreground m-0">
        {t("inbox.season.negativeBalance", { balance: balanceText })}
      </p>
    );
  }
  return (
    <div>
      <p className="text-sm text-foreground m-0">{leaguePrizeTexts(message, t)?.preview ?? message.preview}</p>
      <PrizeLine prize={message.prize} />
    </div>
  );
}

function CupBody({
  message,
  leagues,
}: {
  message: Extract<InboxMessage, { category: "cup" }>;
  leagues: LeagueData[];
}) {
  const { t, i18n } = useTranslation();
  const stage = t(`cups.stage.${message.stage}`, { defaultValue: message.stage });
  // Fall back to the stored English name while the league catalog hasn't loaded yet.
  const cupName = leagues.length > 0 ? competitionName(message.cupSlug, leagues, i18n.language) : message.cupName;

  if (message.kind === "champion") {
    return (
      <div>
        <p className="text-sm text-foreground m-0">{t("inbox.cup.champion", { cup: cupName })}</p>
        <PrizeLine prize={message.prize} />
      </div>
    );
  }
  if (message.kind === "eliminated") {
    return (
      <div>
        <p className="text-sm text-foreground m-0">
          {t("inbox.cup.eliminated", { cup: cupName, stage, opponent: message.opponentName ?? "?" })}
        </p>
        <PrizeLine prize={message.prize} />
      </div>
    );
  }
  const venue = message.venue ? t(`inbox.cup.venue.${message.venue}`) : "?";
  return (
    <p className="text-sm text-foreground m-0">
      {t("inbox.cup.draw", {
        cup: cupName,
        stage,
        opponent: message.opponentName ?? "?",
        venue,
        date: message.tieDate ? formatFullDate(message.tieDate) : "?",
      })}
    </p>
  );
}

function ContinentalBody({
  message,
  leagues,
}: {
  message: Extract<InboxMessage, { category: "continental" }>;
  leagues: LeagueData[];
}) {
  const { t, i18n } = useTranslation();
  const stage = t(`continental.stage.${message.stage}`, { defaultValue: message.stage });
  // Fall back to the stored English name while the league catalog hasn't loaded yet.
  const competition = leagues.length > 0
    ? competitionName(message.competition, leagues, i18n.language)
    : message.competitionName;

  if (message.kind === "qualified") {
    return <p className="text-sm text-foreground m-0">{t("inbox.continental.qualified", { competition })}</p>;
  }
  if (message.kind === "group") {
    return (
      <p className="text-sm text-foreground m-0">
        {t("inbox.continental.group", {
          competition, group: message.group ?? "?", opponents: (message.opponentNames ?? []).join(", "),
        })}
      </p>
    );
  }
  if (message.kind === "champion") {
    return (
      <div>
        <p className="text-sm text-foreground m-0">{t("inbox.continental.champion", { competition })}</p>
        <PrizeLine prize={message.prize} />
      </div>
    );
  }
  if (message.kind === "eliminated") {
    return (
      <div>
        <p className="text-sm text-foreground m-0">
          {message.opponentName
            ? t("inbox.continental.eliminated", { competition, stage, opponent: message.opponentName })
            : t("inbox.continental.eliminatedGroup", { competition })}
        </p>
        <PrizeLine prize={message.prize} />
      </div>
    );
  }
  const venue = message.venue ? t(`inbox.cup.venue.${message.venue}`) : "?";
  return (
    <div>
      <p className="text-sm text-foreground m-0">
        {t("inbox.continental.draw", {
          competition,
          stage,
          opponent: message.opponentName ?? "?",
          venue,
          date: message.firstLegDate ? formatFullDate(message.firstLegDate) : "?",
        })}
      </p>
      <PrizeLine prize={message.prize} />
    </div>
  );
}

function DevelopmentBody({
  message,
}: {
  message: Extract<InboxMessage, { category: "development" }>;
}) {
  const { t } = useTranslation();
  const summary = message.changes.length === 1
    ? t("inbox.developmentLevelUpOne", { player: message.playerName })
    : t("inbox.developmentLevelUpMany", { player: message.playerName, count: message.changes.length });
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0 leading-relaxed">{summary}</p>
      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {message.changes.map((c) => (
          <div key={c.attribute} className="p-3 bg-muted/10">
            <AttributeChangeRow stat={c.attribute} from={c.from} to={c.to} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TransferBody({
  direction,
  playerName,
  club,
  fee,
  date,
}: {
  direction: "in" | "out";
  playerName: string;
  club: string;
  fee: number;
  date: string;
}) {
  const { t } = useTranslation();
  const headline = direction === "in" ? t("inbox.signedFrom") : t("inbox.soldTo");
  const summary = direction === "in"
    ? t("inbox.transferInBody", { player: playerName, date: formatFullDate(date) })
    : t("inbox.transferOutBody", { player: playerName, date: formatFullDate(date) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground m-0 leading-relaxed">{summary}</p>
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        <DetailRow label={headline} value={club} />
        <DetailRow label={t("transfers.fee")} value={formatFee(fee)} accent />
      </div>
    </div>
  );
}

/** "Join" on a live-match invite (multiplayer part 7) while the game is still today's. */
function H2HInviteJoin({ match }: { match: string }) {
  const { t } = useTranslation();
  const { currentDate } = useGameSave();
  if (match !== currentDate) return null;
  return (
    <Button className="w-fit" onClick={() => { window.location.href = "/match-room"; }}>
      {t("h2h.invite.join")}
    </Button>
  );
}

function DetailRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-muted/10">
      <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
        {label}
      </span>
      <span
        className={`text-sm font-bold ${
          accent ? "text-primary font-display" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Current UI language for helpers that only receive `t`. */
function i18nLang(): string {
  return i18next.language ?? "en";
}

/** The category tile of a message: the art pack's icon (4.41.11) on the category colour, 20 px (24 px large). */
export function InboxCategoryTile({ message, large = false }: { message: InboxMessage; large?: boolean }) {
  const meta = CATEGORY_META[message.category];
  const MetaIcon = meta.Icon;
  const size = large ? 24 : 20;
  // New visual (art preview): a neutral raised tile with the pack icon in its category colour (user report 4.41.23).
  const art = newVisualOn();
  const tile = art ? "bg-secondary border-border" : `${meta.bg} ${meta.border}`;
  const ink = meta.color;
  return (
    <div className={`${large ? "w-11 h-11" : "w-10 h-10"} rounded-lg ${tile} border flex items-center justify-center shrink-0`}>
      <ArtIcon art={`inbox-${message.category.replace(/_/g, "-")}`} size={size} className={ink} fallback={<MetaIcon className={`${large ? "w-6 h-6" : "w-5 h-5"} ${meta.color}`} />} />
    </div>
  );
}

/** The painted illustration of a message's category (art phase 7), or null without the new visual / art. */
export function inboxIllustration(message: InboxMessage): string | null {
  return paintedNews(message.category);
}
