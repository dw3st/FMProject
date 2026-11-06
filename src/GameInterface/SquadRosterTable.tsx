import { summaryOf } from "@/Domain/personality/personality";
import { addDays } from "@/Domain/dates";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { ATTENTION_BUTTON, AVAILABILITY_DOT, availabilityOf } from "@/GameInterface/statusColors";
import { contractRenewalDue } from "@/Domain/contracts/contracts";
import { formatGameDate } from "@/GameInterface/formatDate";
import { useState, useMemo, useEffect } from "react";
import { AskingPriceModal } from "@/GameInterface/Negotiation/AskingPriceModal";
import { ContractOfferModal } from "@/GameInterface/Contracts/ContractOfferModal";
import type { SellCandidate } from "@/types/transferMarketTypes";
import { formatFee } from "@/Domain/money";
import { SuspendedBadge } from "@/GameInterface/Components/SuspendedBadge";
import { LoanBadge } from "@/GameInterface/Components/LoanBadge";
import { SettlingBadge } from "@/GameInterface/Components/SettlingBadge";
import { NationalDutyBadge } from "@/GameInterface/National/NationalDutyBadge";
import { useTranslation } from "react-i18next";
import type { Squad } from "@/types/playerTypes";
import { compareSquadPositions } from "@/Domain/positions/positionSort";
import { toDisplayPlayer } from "@/Domain/scout/displayPlayer";
import { capitalizeSeverity } from "@/GameInterface/playerHelpers";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { wageFactorOf } from "@/Domain/finance/wages";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { MoraleBadge } from "@/GameInterface/Components/MoraleBadge";
import { Chip } from "@/GameInterface/ui/Chip";
import { moraleBand, moraleOf } from "@/Domain/morale/morale";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { TalkModal } from "@/GameInterface/Morale/TalkModal";
import { navigate } from "@/GameInterface/router/navigation";

type RosterRow = DisplayPlayer & { morale: number; flagCode?: string; renewDue: boolean };

/** Column key → the row field it sorts by (a text label sorts by the number behind it). */
const SORT_FIELD: Record<string, string> = {
  salary: "wage", contract: "contractUntil", value: "valueMillions", apps: "appearances", rating: "avgRating",
};

export function SquadRosterTable({
  squad,
  leagueSlug,
  clubSlug,
  mySquadId,
  onOffer,
}: {
  squad: Squad;
  leagueSlug: string;
  clubSlug: string;
  mySquadId: string;
  onOffer: (player: DisplayPlayer) => void;
}) {
  const { t, i18n } = useTranslation();
  const { currentDate, session, refresh } = useGameSave();
  const [talkWith, setTalkWith] = useState<DisplayPlayer | null>(null);
  const [selling, setSelling] = useState<DisplayPlayer | null>(null);
  // Renewal opened right here (tester report, 8.8.9): no trip to the player page.
  const [renewing, setRenewing] = useState<DisplayPlayer | null>(null);
  const [sellList, setSellList] = useState<SellCandidate[]>([]);
  const saleOf = (id: string) => sellList.find((c) => c.playerId === id);
  // Same star index as the player profile (`useStarPlayers`) — the list used to show none.
  const stars = useStarPlayers(session?.saveId, currentDate);
  const [sortKey, setSortKey] = useState<string>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Morale (`.claude/rules/game/morale.md`) exists only for the human club's own squad.
  const showMorale = !!mySquadId && squad.id === mySquadId;
  useEffect(() => {
    if (!showMorale || !session) return;
    let alive = true;
    fetch(`/api/saves/${session.saveId}/sell-list`).then((r) => (r.ok ? r.json() : [])).then((l: SellCandidate[]) => { if (alive) setSellList(l); }).catch(() => {});
    return () => { alive = false; };
  }, [showMorale, session?.saveId]);
  const [onlyUnhappy, setOnlyUnhappy] = useState(false);

  // One grid template shared by the header and every row, so each label sits over its values.
  // Every header has its full name in `title` (#146): the short labels (OVR, J, G, A) are explained there and in
  // the legend under the table.
  const col = (key: string, width: string, align: "left" | "center") => ({
    key, width, align,
    label: t(`dashboard.squadRosterTable.${key}`),
    title: t(`dashboard.squadRosterTable.titles.${key}`),
  });
  const columns: { key: string; label: string; title: string; width: string; align: "left" | "center" }[] = [
    col("pos", "5rem", "left"),
    col("name", "minmax(8rem,1fr)", "left"),
    col("age", "4rem", "center"),
    col("avg", "4rem", "center"),
    col("salary", "5.5rem", "center"),
    col("contract", "5.5rem", "center"),
    col("value", "5.5rem", "center"),
    col("apps", "3.5rem", "center"),
    col("goals", "3.5rem", "center"),
    col("assists", "3.5rem", "center"),
    col("rating", "4.5rem", "center"),
    ...(showMorale ? [{ key: "morale", label: t("morale.column"), title: t("dashboard.squadRosterTable.titles.morale"), width: "9rem", align: "left" as const }] : []),
  ];
  // Own squad: Talk (or Answer, with an open request) beside Renew, icon buttons so the table fits without a
  // sideways scroll (tester report, 4.47.10); the label is in `title` and `aria-label`.
  const gridTemplateColumns = [...columns.map((c) => c.width), "4rem", showMorale ? "9.5rem" : "7rem"].join(" ");
  const talkOf = (id: string) => squad.moraleClub?.talks.find((x) => x.playerId === id) ?? null;
  // Already talked (praise / demand works once per `PRAISE_EVERY_DAYS`): the button rests until then (user request, 4.47.11).
  const talkedRest = (id: string): { on: string; until: string } | null => {
    const on = squad.players.find((p) => p.id === id)?.moraleLog?.talkedOn;
    if (!on || !currentDate || talkOf(id)) return null;
    const until = addDays(on, MORALE.PRAISE_EVERY_DAYS);
    return currentDate < until ? { on, until } : null;
  };

  const allPlayers = useMemo<RosterRow[]>(() => {
    const wageFactor = wageFactorOf(squad);
    return squad.players.map((p) => ({
      ...toDisplayPlayer(p, squad.name, { squadCountry: squad.country, wageFactor, currentDate }),
      leagueSlug,
      clubSlug,
      morale: moraleOf(p),
      flagCode: nationalityFlagCode(p.nationality),
      renewDue: showMorale && !!currentDate && contractRenewalDue(p, currentDate),
    }));
  }, [squad, leagueSlug, clubSlug, currentDate, showMorale]);
  const players = useMemo(
    () => (showMorale && onlyUnhappy
      ? allPlayers.filter((p) => { const b = moraleBand(p.morale); return b === "unhappy" || b === "furious"; })
      : allPlayers),
    [allPlayers, showMorale, onlyUnhappy],
  );

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (sortKey === "pos") return compareSquadPositions(a, b, sortDir);
      // Text columns that are really numbers sort by the number behind the label.
      const key = (SORT_FIELD[sortKey] ?? sortKey) as keyof RosterRow;
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [players, sortKey, sortDir]);

  if (allPlayers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <p className="text-muted-foreground text-sm m-0">{t("dashboard.squadRosterTable.noPlayers")}</p>
      </div>
    );
  }

  function playerDetailHref(player: DisplayPlayer) {
    return `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(clubSlug)}/${encodeURIComponent(player.id)}`;
  }

  return (
    <div className="flex-1 card-arcade rounded-md overflow-hidden flex flex-col">
      <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground font-bold uppercase tracking-[0.08em] font-display">
          <span className="text-primary font-black font-display">{players.length}</span> {t("dashboard.squadRosterTable.players")}
        </span>
        {showMorale && (
          <Chip selected={onlyUnhappy} onClick={() => setOnlyUnhappy((v) => !v)}>
            <Icon name="face-unhappy" size={16} />
            {t("morale.onlyUnhappy")}
          </Chip>
        )}
      </div>

      <div className="overflow-x-auto flex-1 flex flex-col">
      <div className="min-w-max">
      <div
        className="grid items-center bg-muted/30 border-b border-border text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display overflow-y-hidden [scrollbar-gutter:stable]"
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
            title={col.title}
            onClick={() => handleSort(col.key)}
            className={`px-3 py-3 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0 uppercase font-display font-bold tracking-[0.08em] text-[13px] ${
              col.align === "center" ? "justify-center" : "justify-start"
            } ${sortKey === col.key ? "text-primary" : "text-muted-foreground"}`}
          >
            {/* The sort arrow hangs off the label so a centred label stays over its column. */}
            <span className="relative">
              {col.label}
              {sortKey === col.key && (
                <Icon
                  name={sortDir === "asc" ? "chevron-up" : "chevron-down"}
                  className="w-3 h-3 text-primary absolute left-full top-1/2 -translate-y-1/2 ml-1"
                />
              )}
            </span>
          </button>
        ))}
        <div className="px-3 py-3 text-center" title={t("dashboard.squadRosterTable.titles.status")}>{t("dashboard.squadRosterTable.status")}</div>
        <div className="px-3 py-3 text-center">{t("dashboard.squadRosterTable.action")}</div>
      </div>

      {/* Header and body reserve the same scrollbar gutter, so the columns line up when the body scrolls. */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] max-h-[calc(100vh-280px)]">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            onClick={() => {
              navigate(playerDetailHref(player));
            }}
            style={{ gridTemplateColumns }}
            className={`grid items-center text-sm tabular-nums border-b border-border/30 cursor-pointer transition-all ${
              index % 2 === 0
                ? "bg-transparent hover:bg-muted/20"
                : "bg-muted/5 hover:bg-muted/20"
            }`}
          >
            <div
              className={`px-3 py-2.5 font-black text-sm ${positionLabelColor(player.natural, player.pos)}`}
              title={player.positions.join(", ")}
            >
              {positionLabel(t, player.natural, player.pos)}
            </div>
            <div className="px-3 py-2.5 min-w-0 font-semibold text-foreground truncate">
              {player.flagCode && (
                <span title={player.ownNationality} aria-label={player.ownNationality} role="img" className="mr-2 inline-flex align-middle">
                  <Flag code={player.flagCode} />
                </span>
              )}
              <a
                href={playerDetailHref(player)}
                title={player.personality ? t(`personality.summary.${summaryOf(player.personality.traits)}`) : undefined}
                className="text-foreground hover:text-primary hover:underline no-underline"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {player.name}
              </a>
              {stars.get(player.id) && <StarBadge kind={stars.get(player.id)} className="ml-1.5 align-middle" />}
              {player.status === "suspended" && <SuspendedBadge matches={player.suspendedMatches} className="ml-1.5" />}
              {player.loan && <LoanBadge from={player.loan.fromClubName} until={player.loan.until} className="ml-1.5" />}
              {player.settling && <SettlingBadge games={player.settling.games} need={player.settling.need} className="ml-1.5" />}
              {player.nationalDutyUntil && <NationalDutyBadge until={player.nationalDutyUntil} className="ml-1.5" />}
            </div>
            <div className="px-3 py-2.5 text-center text-muted-foreground font-medium">{player.age}</div>
            <div className="px-3 py-2.5 flex justify-center">
              <AvgBadge value={player.avg} />
            </div>
            <div className="px-3 py-2.5 text-center text-muted-foreground font-medium">{player.salary}</div>
            <div className="px-3 py-2.5 text-center text-muted-foreground font-medium">{player.contractUntil ?? "—"}</div>
            <div className={`px-3 py-2.5 text-center font-bold ${ratingTextClass10(player.avg)}`}>{player.value}</div>
            <div className="px-3 py-2.5 text-center text-muted-foreground font-medium">{player.appearances}</div>
            <div className="px-3 py-2.5 text-center text-foreground font-bold">{player.goals}</div>
            <div className="px-3 py-2.5 text-center text-foreground font-bold">{player.assists}</div>
            <div className="px-3 py-2.5 flex justify-center">
              <RatingBadge value={player.avgRating} />
            </div>
            {showMorale && (
              <div className="px-3 py-2.5">
                <MoraleBadge morale={player.morale} />
              </div>
            )}
            <div className="px-3 py-2.5 flex justify-center">
              <FitStatusIcon status={player.status} energy={player.energy} injury={player.injury} suspendedMatches={player.suspendedMatches} {...(player.nationalDutyUntil ? { nationalDutyUntil: player.nationalDutyUntil } : {})} />
            </div>
            <div className="px-3 py-2.5 flex justify-center gap-2">
              {/* Put him up for sale without leaving the squad (tester report, 8.8.7) */}
              {showMorale && session && !player.loan && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelling(player); }}
                  title={saleOf(player.id) ? t("negotiation.lists.askingShort", { price: formatFee(saleOf(player.id)!.askingPrice ?? player.valueMillions * 1_000_000) }) : t("negotiation.lists.listSale")}
                  aria-label={t("negotiation.lists.listSale")}
                  className={`flex items-center justify-center w-9 h-8 border rounded-lg transition-all cursor-pointer ${
                    saleOf(player.id) ? "bg-chart-4/20 text-chart-4 border-chart-4/50 hover:bg-chart-4 hover:text-background" : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-primary"
                  }`}
                >
                  <Icon name="tag" className="w-4 h-4" />
                </button>
              )}
              {showMorale && !player.loan && talkedRest(player.id) && (
                <span
                  title={t("morale.talk.talkedRest", {
                    on: formatGameDate(talkedRest(player.id)!.on, i18n.language),
                    until: formatGameDate(talkedRest(player.id)!.until, i18n.language),
                  })}
                  aria-label={t("morale.talk.talked")}
                  className="relative flex items-center justify-center w-9 h-8 border border-border rounded-lg text-muted-foreground/60 bg-transparent cursor-not-allowed"
                >
                  <Icon name="talk" className="w-4 h-4" />
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-chart-2 text-background">
                    <Icon name="check" size={12} />
                  </span>
                </span>
              )}
              {showMorale && !player.loan && !talkedRest(player.id) && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setTalkWith(player); }}
                  title={talkOf(player.id) ? `${t("morale.talk.answerRequest")}: ${t(`morale.reason.${talkOf(player.id)!.reason}`, { club: talkOf(player.id)!.clubName ?? "" })}` : t("morale.talk.open")}
                  aria-label={talkOf(player.id) ? t("morale.talk.answerRequest") : t("morale.talk.open")}
                  className={`flex items-center justify-center w-9 h-8 border rounded-lg transition-all cursor-pointer ${
                    talkOf(player.id) ? ATTENTION_BUTTON : "bg-primary/20 text-primary border-primary/40 hover:bg-primary hover:text-primary-foreground"
                  }`}
                >
                  <Icon name="talk" className="w-4 h-4" />
                </button>
              )}
              {player.renewDue ? (
                <button
                  type="button"
                  title={t("dashboard.squadRosterTable.renewDue", { date: player.contractEnd ? formatGameDate(player.contractEnd, i18n.language) : "" })}
                  onClick={(e) => { e.stopPropagation(); setRenewing(player); }}
                  aria-label={t("contracts.renew")}
                  className={`flex items-center justify-center w-9 h-8 border rounded-lg cursor-pointer transition-all ${ATTENTION_BUTTON}`}
                >
                  <Icon name="file-signature" className="w-4 h-4" />
                </button>
              ) : showMorale ? null : (
              <button
                type="button"
                disabled={!!mySquadId && player.squadId === mySquadId}
                onClick={(e) => {
                  e.stopPropagation();
                  onOffer(player);
                }}
                title={!!mySquadId && player.squadId === mySquadId ? t("dashboard.squadRosterTable.yourPlayer") : t("dashboard.squadRosterTable.makeOffer")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-bold uppercase font-display tracking-[0.08em] border rounded-lg transition-all ${
                  !!mySquadId && player.squadId === mySquadId
                    ? "bg-muted/30 text-muted-foreground border-border cursor-not-allowed opacity-60"
                    : "bg-primary/20 text-primary border-primary/40 hover:bg-primary hover:text-primary-foreground cursor-pointer"
                }`}
              >
                <Icon name="user-plus" className="w-3 h-3" />
                {t("dashboard.squadRosterTable.offer")}
              </button>
              )}
            </div>
          </div>
        ))}
      </div>
      </div>
      </div>
      <p className="m-0 px-4 py-2.5 border-t border-border text-sm text-muted-foreground">{t("dashboard.squadRosterTable.legend")}</p>
      {selling && session && (
        <AskingPriceModal
          saveId={session.saveId}
          playerId={selling.id}
          playerName={selling.name}
          value={selling.valueMillions * 1_000_000}
          {...(saleOf(selling.id)?.askingPrice !== undefined ? { current: saleOf(selling.id)!.askingPrice! } : {})}
          listed={!!saleOf(selling.id)}
          onClose={() => setSelling(null)}
          onSaved={(list) => setSellList(list)}
        />
      )}
      <ContractOfferModal
        mode="renew"
        player={renewing ? {
          id: renewing.id, name: renewing.name, age: renewing.age, squadId: squad.id,
          contractUntil: renewing.contractEnd?.slice(0, 4),
          nationality: renewing.ownNationality || null, clubColors: squad.colors,
        } : null}
        onClose={() => setRenewing(null)}
        onDone={() => void refresh({ background: true })}
        onListForSale={() => { const p = renewing; setRenewing(null); if (p) setSelling(p); }}
      />
      {talkWith && session && (
        <TalkModal
          saveId={session.saveId}
          player={{ id: talkWith.id, name: talkWith.name }}
          reason={talkOf(talkWith.id)?.reason ?? null}
          clubName={talkOf(talkWith.id)?.clubName}
          onClose={() => setTalkWith(null)}
          onDone={(r) => {
            void refresh({ background: true });
            if (r.openRenewal) {
              const target = talkWith;
              setTalkWith(null);
              setRenewing(target);
            }
          }}
        />
      )}
    </div>
  );
}

function RatingBadge({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-sm text-muted-foreground/40 font-medium">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-black tabular-nums ${ratingTextClass10(value)}`}>
      {value.toFixed(1)}
    </span>
  );
}

function FitStatusIcon({
  status,
  energy,
  injury,
  suspendedMatches,
  nationalDutyUntil,
}: {
  status: "fit" | "injured" | "suspended";
  energy: number;
  injury?: { severity: "light" | "medium" | "severe"; daysLeft: number };
  suspendedMatches?: number;
  nationalDutyUntil?: string;
}) {
  const { t } = useTranslation();
  const state = availabilityOf({ status, energy, ...(nationalDutyUntil ? { nationalDutyUntil } : {}) });
  let title: string;
  if (status === "injured") {
    const severity = injury ? t(`dashboard.squadRosterTable.sev${capitalizeSeverity(injury.severity)}` as never) : "";
    title = injury
      ? injury.daysLeft > 0
        ? t("dashboard.squadRosterTable.injuredDays", { severity, days: injury.daysLeft })
        : t("dashboard.squadRosterTable.injuredToday", { severity })
      : t("dashboard.squadRosterTable.injured");
  } else if (status === "suspended") {
    title = t("dashboard.squadRosterTable.suspendedMatches", { count: suspendedMatches ?? 1 });
  } else if (nationalDutyUntil) {
    title = t("dashboard.squadRosterTable.nationalDuty");
  } else if (state === "rhythm") {
    title = t("dashboard.squadRosterTable.needsRhythm", { fitness: energy });
  } else {
    title = t("dashboard.squadRosterTable.fit");
  }
  return <div role="img" aria-label={title} className={`w-3 h-3 rounded-full ${AVAILABILITY_DOT[state]}`} title={title} />;
}
