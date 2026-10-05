import { useEffect, useMemo, useRef, useState } from "react";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon, iconOf } from "@/GameInterface/Icons";
import type { InboxCategory, InboxMessage } from "@/types/inboxTypes";
import type { LeagueData } from "@/types/playerTypes";
import { competitionName } from "@/Domain/world/labels";
import { Button } from "@/GameInterface/ui/Button";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { objectiveText } from "@/GameInterface/boardText";
import { formatFee } from "@/Domain/money";
import { ManagerRenewalCard } from "@/GameInterface/Components/ManagerRenewalCard";
import { JobOfferCard } from "@/GameInterface/Components/JobOfferCard";
import { BidCard } from "@/GameInterface/Negotiation/BidCard";
import { PlayerTalkBody } from "@/GameInterface/Morale/PlayerTalkBody";
import type { MarketBid } from "@/types/transferMarketTypes";
import { clubRecordTexts } from "@/GameInterface/clubRecordText";

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
const TagIcon = iconOf("tag");
const TalkIcon = iconOf("talk");

type FilterTab = "all" | "unread";

/** Continental news uses the shared Icon abstraction (`globe`) rather than importing lucide-react
 *  directly, so it slots into `CATEGORY_META.Icon` (a `{ className }` component) like every other
 *  category's direct lucide import does. */
function ContinentalIcon({ className }: { className?: string }) {
  return <Icon name="globe" className={className} />;
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
};

function formatInboxDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatFullDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function InboxScreen({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { session, inboxMessages, setInboxMessages, refreshInbox } = useGameSave();
  const [filter, setFilter] = useState<FilterTab>("all");
  // `/inbox?id=<message>` (dashboard inbox card) opens that message.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") : null,
  );
  const [busy, setBusy] = useState(false);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

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

  const filtered = useMemo(
    () => (filter === "unread" ? messages.filter((m) => !m.read) : messages),
    [messages, filter],
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
        {loading ? (
          <div className="card-arcade rounded-md p-12 text-center h-full flex items-center justify-center">
            <p className="text-muted-foreground text-sm m-0">{t("inbox.loadingMessages")}</p>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            <div className="md:col-span-1 card-arcade rounded-md overflow-hidden flex flex-col min-h-0">
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
            <div className="md:col-span-2 card-arcade rounded-md overflow-hidden flex flex-col min-h-0">
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
  const what = message.facility
    ? message.facility === "stand" && message.stand
      ? t("facilities.inbox.standWhat", { stand: t(`facilities.stand.${message.stand}`), seats: (message.seats ?? 0).toLocaleString() })
      : t("facilities.inbox.levelWhat", { what: t(`facilities.kind.${message.facility}`), level: message.level ?? "" })
    : "";
  const vars = {
    what, cost: formatFee(message.cost ?? 0), date: message.end ?? "",
    pct: Math.round((message.boardShare ?? 0) * 100),
    attendance: (message.attendance ?? 0).toLocaleString(), previous: (message.previous ?? 0).toLocaleString(),
    reason: message.reason ? t(`facilities.reason.${message.reason}`) : "",
  };
  const body = message.kind === "approved" && (message.boardShare ?? 0) > 0
    ? t("facilities.inbox.approvedFunded", vars)
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
  if (message.category === "board") {
    return { subject: t(`inbox.board.subject.${message.kind}`), preview: boardText(message, t, message.leagueName ?? "") };
  }
  if (message.category === "job") {
    return { subject: t(`inbox.job.subject.${message.kind}`, { club: message.clubName }), preview: message.leagueName };
  }
  if (message.category === "player") {
    const key = message.kind === "talk" ? "talk" : message.kind;
    return { subject: t(`morale.inbox.subject.${key}`, { player: message.playerName }), preview: message.playerName };
  }
  if (message.category === "transfer") {
    const vars = transferVars(message);
    return { subject: t(`inbox.transfer.subject.${message.kind}`, vars), preview: message.fee ? formatFee(message.fee) : message.clubName };
  }
  if (message.category === "manager_news") {
    return {
      subject: t("inbox.managerNews.subject", { count: message.items.length }),
      preview: message.items.map((i) => i.clubName).join(", "),
    };
  }
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
      <div
        className={`w-9 h-9 rounded-lg ${meta.bg} ${meta.border} border flex items-center justify-center shrink-0`}
      >
        <MetaIcon className={`w-4 h-4 ${meta.color}`} />
      </div>
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
  const { t, i18n } = useTranslation();
  const meta = CATEGORY_META[message.category];
  const MetaIcon = meta.Icon;
  const prizeTexts = leaguePrizeTexts(message, t);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-10 h-10 rounded-lg ${meta.bg} ${meta.border} border flex items-center justify-center shrink-0`}
          >
            <MetaIcon className={`w-5 h-5 ${meta.color}`} />
          </div>
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
        {message.category === "manager_news" && <ManagerNewsBody message={message} />}
        {message.category === "board" && (
          <p className="text-sm text-foreground m-0">
            {boardText(
              message, t,
              message.objective ? competitionName(message.objective.leagueSlug, leagues, i18n.language) || (message.leagueName ?? "") : "",
            )}
          </p>
        )}
        {message.category === "board" && message.kind === "contract_offer" && <RenewalBody />}
        {message.category === "contract" && (
          <p className="text-sm text-foreground m-0">
            {t(`inbox.contract.${message.kind}`, {
              players: message.players.map((p) => p.name).join(", "),
              until: formatInboxDate(message.until ?? ""),
            })}
          </p>
        )}
      </div>
    </div>
  );
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
      <p className="text-sm text-foreground m-0">{t(`inbox.transfer.body.${message.kind}`, vars)}</p>
      {isBid && saveId && bid !== undefined && <BidCard saveId={saveId} bid={bid} onAnswered={() => void refresh()} />}
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
          <div
            key={c.attribute}
            className="flex items-center justify-between gap-4 p-3 bg-muted/10"
          >
            <span className="text-sm font-medium text-foreground capitalize">
              {c.attribute}
            </span>
            <div className="flex items-center gap-2 text-sm font-display font-black">
              <span className="text-muted-foreground">{c.from}</span>
              <Icon name="arrow-right" className="w-4 h-4 text-primary" />
              <span className="text-primary">{c.to}</span>
            </div>
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
