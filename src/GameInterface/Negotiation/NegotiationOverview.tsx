import { PlayerNameLink } from "@/GameInterface/Inbox/PlayerNameText";
import type { LoanReport } from "@/Domain/negotiation/loanReport";
import { useAttributeName } from "@/GameInterface/Components/AttributeChangeRow";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable } from "@/GameInterface/ui/DataTable";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { formatFee } from "@/Domain/money";
import { Button } from "@/GameInterface/ui/Button";
import { SeatOfferCard } from "@/GameInterface/Negotiation/SeatOfferCard";
import { useSeatOffers } from "@/GameInterface/Negotiation/seatOfferApi";
import { loadSession } from "@/GameInterface/gameSession";
import type { SeatOfferView } from "@/types/seatOfferTypes";
import type { ActiveLoan, MarketBid, PreContract, RivalBid, SellOnHeld } from "@/types/transferMarketTypes";

type Section = "seatOffers" | "out" | "in" | "sellOn" | "bids" | "rivals" | "preContracts";

/** Sections whose table needs the full width. */
const WIDE = new Set<Section>(["seatOffers", "preContracts", "out"]);

const SECTION_LOOK: Record<Section, { icon: IconName; fg: string; bg: string }> = {
  seatOffers: { icon: "handshake", fg: "text-primary", bg: "bg-primary/20" },
  bids: { icon: "tag", fg: "text-chart-4", bg: "bg-chart-4/20" },
  rivals: { icon: "users", fg: "text-destructive", bg: "bg-destructive/20" },
  preContracts: { icon: "file-signature", fg: "text-primary", bg: "bg-primary/20" },
  out: { icon: "arrow-up-right", fg: "text-chart-4", bg: "bg-chart-4/20" },
  in: { icon: "arrow-down-left", fg: "text-chart-2", bg: "bg-chart-2/20" },
  sellOn: { icon: "wallet", fg: "text-chart-2", bg: "bg-chart-2/20" },
};

interface Overview {
  clubId: string;
  bids: MarketBid[];
  loans: (ActiveLoan & { report?: LoanReport })[];
  loanList: string[];
  sellOnHeld: SellOnHeld[];
  /** Etapa 25: rivals on the human's targets, pre-contracts, targets lost to a rival. */
  rivals?: RivalBid[];
  preContracts?: PreContract[];
  lostTargets?: { playerId: string; clubName: string; fee: number; date: string }[];
}

/**
 * Loans (out and in), the sell-on clauses the club holds and the pending AI bids
 * (`.claude/rules/game/negotiation.md`), from `GET /api/saves/:id/negotiation`.
 */
export function NegotiationOverview({ saveId, sections, hideEmpty }: {
  saveId: string; sections: Section[];
  /** Leaves out the sections with nothing in them (the pre-contracts on My transfers, 4.47.15). */
  hideEmpty?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  // Offers with other human managers (multiplayer part 4); only in a friends' league.
  const withSeats = sections.includes("seatOffers") && !!loadSession()?.groupAdvance;
  const seatOffers = useSeatOffers(withSeats ? saveId : null);
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  // How the last offer answered here ended (the card goes with it): kept on screen.
  const [closedNote, setClosedNote] = useState<string | null>(null);
  const attrName = useAttributeName();
  const [recalling, setRecalling] = useState(false);
  const [recallNote, setRecallNote] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  async function callBack(playerId: string) {
    setRecalling(true);
    setRecallNote(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/loans/${encodeURIComponent(playerId)}/recall`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setRecallNote(res.ok ? t("negotiation.recall.done") : t(`negotiation.recall.errors.${body.error === "windowClosed" || body.error === "squadFull" ? body.error : "generic"}`));
      if (res.ok) setReloadTick((n) => n + 1);
    } finally {
      setRecalling(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void fetch(`/api/saves/${saveId}/negotiation`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: Overview) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId, reloadTick]);

  if (failed) return <p className="text-sm text-destructive m-0">{t("negotiation.errors.generic")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  const out = data.loans.filter((l) => l.fromClubId === data.clubId);
  const inn = data.loans.filter((l) => l.toClubId === data.clubId);
  const share = (l: ActiveLoan) => `${Math.round(l.wageShare * 100)}%`;

  // A card per section, like Incoming / Outgoing on My transfers (tester report, 4.47.17).
  const counts: Record<Section, number> = {
    seatOffers: seatOffers.data?.offers.length ?? 0, out: out.length, in: inn.length, sellOn: data.sellOnHeld.length,
    bids: data.bids.length, rivals: data.rivals?.length ?? 0, preContracts: data.preContracts?.length ?? 0,
  };
  const block = (key: Section, title: string, body: React.ReactNode, empty: boolean, note?: string | null) => {
    if (hideEmpty && empty && !note) return null;
    const look = SECTION_LOOK[key];
    return (
      <section key={key} className={`card-arcade rounded-md overflow-visible ${sections.length > 1 && WIDE.has(key) ? "lg:col-span-2" : ""}`}>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${look.bg} flex items-center justify-center`}>
            <Icon name={look.icon} className={`w-4 h-4 ${look.fg}`} />
          </div>
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{title}</h3>
          <span className="ml-auto text-sm bg-muted px-2 py-1 rounded-full text-muted-foreground tabular-nums">{counts[key]}</span>
        </div>
        {note && <p className="px-4 pt-3 text-sm font-semibold text-foreground m-0" role="status">{note}</p>}
        {empty
          ? <div className="p-6 text-center text-muted-foreground text-sm">{t("negotiation.overview.none")}</div>
          : <div className="px-2 pb-2">{body}</div>}
      </section>
    );
  };

  return (
    <div className={sections.length > 1 ? "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start" : "flex flex-col gap-6"}>
      {sections.map((s) => {
        if (s === "seatOffers") {
          if (!withSeats) return null;
          const offers = seatOffers.data?.offers ?? [];
          const open = offers.find((o) => o.id === openOfferId) ?? null;
          const otherClub = (o: SeatOfferView) => (o.side === "buyer" ? o.seller.clubName : o.buyer.clubName);
          const terms = (o: SeatOfferView) => (o.kind === "loan"
            ? t("negotiation.overview.loanOffer", { share: Math.round((o.terms.wageShare ?? 1) * 100) })
            : formatFee(o.terms.fee));
          return block(s, t("seatOffers.title"), (
            <div className="space-y-4">
              <DataTable
                rows={offers}
                rowKey={(o) => o.id}
                isHighlighted={(o) => o.id === openOfferId}
                columns={[
                  { key: "p", header: t("negotiation.overview.player"), cell: (o) => <PlayerNameLink player={{ id: o.playerId, name: o.playerName }} /> },
                  { key: "k", header: t("seatOffers.kind"), cell: (o) => t(o.kind === "transfer" ? "seatOffers.transfer" : "seatOffers.loan") },
                  { key: "c", header: t("negotiation.overview.club"), cell: (o) => `${otherClub(o)}${o.otherManager ? ` · ${o.otherManager}` : ""}` },
                  { key: "t", header: t("negotiation.overview.offer"), cell: terms, className: "tabular-nums" },
                  {
                    key: "w", header: t("seatOffers.turn"),
                    cell: (o) => (o.myTurn
                      ? <span className="text-primary font-semibold">{t("seatOffers.yourTurn")}</span>
                      : t("seatOffers.theirTurn", { manager: o.otherManager || otherClub(o) })),
                  },
                  { key: "e", header: t("seatOffers.validUntil"), cell: (o) => fmtDate(o.expires), className: "tabular-nums" },
                  {
                    key: "a", header: "",
                    cell: (o) => (
                      <Button variant="secondary" flush onClick={() => { setClosedNote(null); setOpenOfferId(o.id === openOfferId ? null : o.id); }}>
                        {o.id === openOfferId ? t("common.close") : t("seatOffers.open")}
                      </Button>
                    ),
                  },
                ]}
              />
              {open && (
                <SeatOfferCard
                  saveId={saveId}
                  offer={open}
                  onChanged={(closed) => {
                    if (closed) { setClosedNote(closed.text); setOpenOfferId(null); }
                    seatOffers.reload();
                  }}
                />
              )}
            </div>
          ), offers.length === 0, closedNote);
        }
        if (s === "rivals") {
          const rivals = data.rivals ?? [];
          return block(s, t("negotiation.overview.rivals"), (
            <DataTable
              rows={rivals}
              rowKey={(r) => `${r.playerId}:${r.clubId}`}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (r) => <PlayerNameLink player={{ id: r.playerId, name: r.playerName }} /> },
                { key: "c", header: t("negotiation.rival.club"), cell: (r) => r.clubName },
                { key: "f", header: t("negotiation.overview.offer"), cell: (r) => formatFee(r.fee), className: "tabular-nums" },
                { key: "d", header: t("negotiation.rival.deadline"), cell: (r) => fmtDate(r.deadline), className: "tabular-nums" },
              ]}
            />
          ), rivals.length === 0);
        }
        if (s === "preContracts") {
          const pcs = data.preContracts ?? [];
          return block(s, t("negotiation.preContract.title"), (
            <DataTable
              rows={pcs}
              rowKey={(p) => p.playerId}
              columns={[
                {
                  key: "pos", header: t("negotiation.overview.position"),
                  cell: (p) => (p.position ? <span className={`font-display font-bold uppercase ${getDetailedPositionColor(p.position)}`}>{t(`roles.detailedAbbr.${p.position}` as never)}</span> : "—"),
                },
                {
                  key: "p", header: t("negotiation.overview.player"),
                  cell: (p) => {
                    const code = p.nationality ? nationalityFlagCode(p.nationality) : undefined;
                    return (
                      <span className="inline-flex items-center gap-2">
                        {code && <span title={nationalityDisplayName(p.nationality ?? "", i18n.language, t)} className="inline-flex"><Flag code={code} /></span>}
                        <PlayerNameLink player={{ id: p.playerId, name: p.playerName }} />
                      </span>
                    );
                  },
                },
                { key: "c", header: t("negotiation.overview.from"), cell: (p) => p.fromClubName },
                { key: "w", header: t("negotiation.preContract.wage"), cell: (p) => formatFee(p.wage), className: "tabular-nums" },
                { key: "y", header: t("negotiation.preContract.years"), cell: (p) => p.years, className: "tabular-nums" },
                { key: "b", header: t("contracts.bonus.label"), cell: (p) => (p.bonus ? formatFee(p.bonus) : "—"), className: "tabular-nums" },
                { key: "d", header: t("negotiation.preContract.signedColumn"), cell: (p) => fmtDate(p.date), className: "tabular-nums" },
              ]}
            />
          ), pcs.length === 0, pcs.length > 0 ? t("negotiation.preContract.arriveNote") : null);
        }
        if (s === "out") {
          return block(s, t("negotiation.overview.loanedOut"), (
            <DataTable
              rows={out}
              rowKey={(l) => l.playerId}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (l) => <PlayerNameLink player={{ id: l.playerId, name: l.playerName }} /> },
                { key: "c", header: t("negotiation.overview.club"), cell: (l) => l.toClubName },
                { key: "s", header: t("negotiation.overview.theyPay"), cell: (l) => share(l), className: "tabular-nums" },
                { key: "u", header: t("negotiation.returns"), cell: (l) => fmtDate(l.until), className: "tabular-nums" },
                { key: "g", header: t("negotiation.report.games"), cell: (l) => l.report?.apps ?? "—", className: "tabular-nums" },
                { key: "ga", header: t("negotiation.report.goalsAssists"), cell: (l) => (l.report ? `${l.report.goals} / ${l.report.assists}` : "—"), className: "tabular-nums" },
                { key: "r", header: t("negotiation.report.rating"), cell: (l) => l.report?.avgRating?.toFixed(2) ?? "—", className: "tabular-nums" },
                { key: "cd", header: t("negotiation.report.cards"), cell: (l) => (l.report ? `${l.report.yellowCards} / ${l.report.redCards}` : "—"), className: "tabular-nums" },
                { key: "i", header: t("negotiation.report.injuries"), cell: (l) => (l.report ? `${l.report.injuries} (${l.report.daysInjured})` : "—"), className: "tabular-nums" },
                {
                  key: "o", header: t("negotiation.report.overall"),
                  cell: (l) => {
                    const r = l.report;
                    if (!r) return "—";
                    const moved = r.changes.map((c) => `${attrName(c.attribute)} ${c.delta > 0 ? "+" : ""}${c.delta}`).join(", ");
                    return <span title={moved || undefined}>{r.overallAtStart !== undefined ? `${r.overallAtStart} → ${r.overall}` : r.overall}</span>;
                  },
                  className: "tabular-nums",
                },
                {
                  key: "b", header: "",
                  cell: (l) => (l.recall
                    ? <Button variant="secondary" flush disabled={recalling} onClick={() => void callBack(l.playerId)}>{t("negotiation.recall.action")}</Button>
                    : null),
                },
              ]}
            />
          ), out.length === 0, recallNote);
        }
        if (s === "in") {
          return block(s, t("negotiation.overview.loanedIn"), (
            <DataTable
              rows={inn}
              rowKey={(l) => l.playerId}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (l) => <PlayerNameLink player={{ id: l.playerId, name: l.playerName }} /> },
                { key: "c", header: t("negotiation.overview.from"), cell: (l) => l.fromClubName },
                { key: "s", header: t("negotiation.overview.youPay"), cell: (l) => share(l), className: "tabular-nums" },
                { key: "u", header: t("negotiation.returns"), cell: (l) => fmtDate(l.until), className: "tabular-nums" },
              ]}
            />
          ), inn.length === 0);
        }
        if (s === "sellOn") {
          return block(s, t("negotiation.overview.sellOnHeld"), (
            <DataTable
              rows={data.sellOnHeld}
              rowKey={(h) => h.playerId}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (h) => <PlayerNameLink player={{ id: h.playerId, name: h.playerName }} /> },
                { key: "c", header: t("negotiation.overview.soldTo"), cell: (h) => h.toClubName },
                { key: "pct", header: t("negotiation.sellOn"), cell: (h) => `${h.pct}%`, className: "tabular-nums" },
                { key: "d", header: t("negotiation.overview.date"), cell: (h) => fmtDate(h.date), className: "tabular-nums" },
              ]}
            />
          ), data.sellOnHeld.length === 0);
        }
        return block(s, t("negotiation.overview.bids"), (
          <DataTable
            rows={data.bids}
            rowKey={(b) => b.id}
            columns={[
              { key: "p", header: t("negotiation.overview.player"), cell: (b) => <PlayerNameLink player={{ id: b.playerId, name: b.playerName }} /> },
              { key: "c", header: t("negotiation.overview.club"), cell: (b) => b.clubName },
              {
                key: "o", header: t("negotiation.overview.offer"), className: "tabular-nums",
                cell: (b) => (b.kind === "loan" ? t("negotiation.overview.loanOffer", { share: Math.round((b.wageShare ?? 1) * 100) }) : formatFee(b.fee)),
              },
              { key: "e", header: t("negotiation.bid.validUntil"), cell: (b) => fmtDate(b.expires), className: "tabular-nums" },
            ]}
          />
        ), data.bids.length === 0);
      })}
    </div>
  );
}
