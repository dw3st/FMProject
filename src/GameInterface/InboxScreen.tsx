import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Newspaper, TrendingUp, ArrowDownLeft, ArrowUpRight, ArrowRight, CheckCheck, X, Trophy } from "lucide-react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { InboxCategory, InboxMessage } from "@/types/inboxTypes";

type FilterTab = "all" | "unread";

const CATEGORY_META: Record<
  InboxCategory,
  { labelKey: string; color: string; bg: string; border: string; Icon: typeof TrendingUp }
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
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    Icon: ArrowDownLeft,
  },
  transfer_out: {
    labelKey: "inbox.categories.transfer_out",
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
    Icon: ArrowUpRight,
  },
  season: {
    labelKey: "inbox.categories.season",
    color: "text-yellow-400",
    bg: "bg-yellow-500/15",
    border: "border-yellow-500/30",
    Icon: Trophy,
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

function formatFee(fee: number): string {
  const m = fee / 1_000_000;
  if (m >= 100) return `€${Math.round(m)}M`;
  if (m >= 1) return `€${m.toFixed(1)}M`;
  return `€${(fee / 1000).toFixed(0)}K`;
}

export function InboxScreen({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { session, inboxMessages, setInboxMessages, refreshInbox } = useGameSave();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (inboxMessages === null) {
      void refreshInbox();
    }
  }, [inboxMessages, refreshInbox]);

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

  const loading = inboxMessages === null;

  return (
    <div className="flex flex-col h-full">
      {/* Modal header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
        <h2 className="flex-1 text-xl font-black font-display m-0">
          <span className="text-primary glow-text">{t("inbox.title")}</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-border bg-card/50">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ${
                filter === "all"
                  ? "bg-primary text-primary-foreground glow-primary-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
              }`}
            >
              {t("common.all")}
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-0 ${
                filter === "unread"
                  ? "bg-primary text-primary-foreground glow-primary-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-transparent"
              }`}
            >
              {t("inbox.unread")}
              {unreadCount > 0 && (
                <span
                  className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                    filter === "unread"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/20 text-primary"
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={busy || unreadCount === 0}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("inbox.markAllRead")}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer flex items-center justify-center border-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4">
        {loading ? (
          <div className="card-arcade rounded-xl p-12 text-center h-full flex items-center justify-center">
            <p className="text-muted-foreground text-sm m-0">{t("inbox.loadingMessages")}</p>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            <div className="md:col-span-1 card-arcade rounded-xl overflow-hidden flex flex-col min-h-0">
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
            <div className="md:col-span-2 card-arcade rounded-xl overflow-hidden flex flex-col min-h-0">
              {selected ? (
                <MessageDetail message={selected} />
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
    <div className="card-arcade rounded-xl p-16 text-center flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-xl bg-muted/30 border border-border flex items-center justify-center">
        <Newspaper className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground text-sm m-0">
        {t("inbox.emptyState")}
      </p>
    </div>
  );
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
            {message.subject}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatInboxDate(message.date)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground m-0 leading-snug truncate">{message.preview}</p>
      </div>
    </button>
  );
}

function MessageDetail({ message }: { message: InboxMessage }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[message.category];
  const MetaIcon = meta.Icon;

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
              className={`text-[10px] font-black uppercase tracking-wider ${meta.color}`}
            >
              {t(meta.labelKey)}
            </span>
            <h2 className="text-lg font-black font-display text-foreground m-0 leading-tight">
              {message.subject}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
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
        {message.category === "season" && (
          <p className="text-sm text-foreground m-0">{message.preview}</p>
        )}
      </div>
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
              <ArrowRight className="w-4 h-4 text-primary" />
              <span className="text-primary glow-text">{c.to}</span>
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
      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-sm font-bold ${
          accent ? "text-primary font-display glow-text" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
