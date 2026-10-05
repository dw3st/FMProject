import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable } from "@/GameInterface/ui/DataTable";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { formatFee } from "@/Domain/money";
import type { ActiveLoan, MarketBid, PreContract, RivalBid, SellOnHeld } from "@/types/transferMarketTypes";

type Section = "out" | "in" | "sellOn" | "bids" | "rivals" | "preContracts";

interface Overview {
  clubId: string;
  bids: MarketBid[];
  loans: ActiveLoan[];
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
export function NegotiationOverview({ saveId, sections }: { saveId: string; sections: Section[] }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/saves/${saveId}/negotiation`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: Overview) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId]);

  if (failed) return <p className="text-sm text-destructive m-0">{t("negotiation.errors.generic")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>;
  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  const out = data.loans.filter((l) => l.fromClubId === data.clubId);
  const inn = data.loans.filter((l) => l.toClubId === data.clubId);
  const share = (l: ActiveLoan) => `${Math.round(l.wageShare * 100)}%`;

  const block = (key: Section, title: string, body: React.ReactNode, empty: boolean) => (
    <section key={key} className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      {empty ? <p className="text-sm text-muted-foreground m-0">{t("negotiation.overview.none")}</p> : body}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => {
        if (s === "rivals") {
          const rivals = data.rivals ?? [];
          return block(s, t("negotiation.overview.rivals"), (
            <DataTable
              rows={rivals}
              rowKey={(r) => `${r.playerId}:${r.clubId}`}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (r) => <span className="font-semibold text-foreground">{r.playerName}</span> },
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
                { key: "p", header: t("negotiation.overview.player"), cell: (p) => <span className="font-semibold text-foreground">{p.playerName}</span> },
                { key: "c", header: t("negotiation.overview.from"), cell: (p) => p.fromClubName },
                { key: "w", header: t("negotiation.preContract.wage"), cell: (p) => formatFee(p.wage), className: "tabular-nums" },
                { key: "y", header: t("negotiation.preContract.years"), cell: (p) => p.years, className: "tabular-nums" },
              ]}
            />
          ), pcs.length === 0);
        }
        if (s === "out") {
          return block(s, t("negotiation.overview.loanedOut"), (
            <DataTable
              rows={out}
              rowKey={(l) => l.playerId}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (l) => <span className="font-semibold text-foreground">{l.playerName}</span> },
                { key: "c", header: t("negotiation.overview.club"), cell: (l) => l.toClubName },
                { key: "s", header: t("negotiation.overview.theyPay"), cell: (l) => share(l), className: "tabular-nums" },
                { key: "u", header: t("negotiation.returns"), cell: (l) => fmtDate(l.until), className: "tabular-nums" },
              ]}
            />
          ), out.length === 0);
        }
        if (s === "in") {
          return block(s, t("negotiation.overview.loanedIn"), (
            <DataTable
              rows={inn}
              rowKey={(l) => l.playerId}
              columns={[
                { key: "p", header: t("negotiation.overview.player"), cell: (l) => <span className="font-semibold text-foreground">{l.playerName}</span> },
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
                { key: "p", header: t("negotiation.overview.player"), cell: (h) => <span className="font-semibold text-foreground">{h.playerName}</span> },
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
              { key: "p", header: t("negotiation.overview.player"), cell: (b) => <span className="font-semibold text-foreground">{b.playerName}</span> },
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
