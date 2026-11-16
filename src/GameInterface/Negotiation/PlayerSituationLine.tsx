import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import type { PlayerCardInfo, PlayerSituation } from "@/Domain/negotiation/situation";
import { PlayerFace, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";

/** "Titular · Não está à venda · Não disponível para empréstimo": how much he matters and whether he can leave. */
/** Who the offer is about (report 2026-11-16): face, name (link to his page), position, age and, for one's own player, the level. */
function OfferPlayerCard({ playerId, card }: { playerId: string; card: PlayerCardInfo }) {
  const { t } = useTranslation();
  const flag = card.nationality ? nationalityFlagCode(card.nationality) : null;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/40 p-2.5">
      <PlayerFace playerId={playerId} nationality={card.nationality} clubColors={card.colors} size={48} fallback={playerInitials(card.name)} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <a href={playerHref(playerId, card.clubId, card.league)} className="font-semibold text-foreground hover:text-primary truncate">{card.name}</a>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <span className={`font-display font-bold ${positionLabelColor(card.position, card.position)}`}>{positionLabel(t, card.position, card.position)}</span>
          {flag && <Flag code={flag} />}
          <span>{t("negotiation.card.age", { age: card.age })}</span>
        </span>
      </div>
      {card.overall !== undefined && (
        <div className="ml-auto flex flex-col items-end">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("negotiation.card.ovr")}</span>
          <span className="font-display font-bold tabular-nums text-xl text-primary">{Math.round(card.overall * 10)}</span>
        </div>
      )}
    </div>
  );
}

export function PlayerSituationLine({ saveId, playerId, squadId, listing, withCard }: {
  saveId: string;
  playerId: string;
  squadId?: string;
  /** Show who he is on top (face, name, position, age; level for one's own player). */
  withCard?: boolean;
  /** On a bid for the manager's own player: stands out whether he had listed him, for sale or for loan (8.8.25). */
  listing?: "transfer" | "loan";
}) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<PlayerSituation | null>(null);
  useEffect(() => {
    let live = true;
    setS(null);
    fetch(`/api/saves/${saveId}/players/${encodeURIComponent(playerId)}/situation${squadId ? `?from=${encodeURIComponent(squadId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PlayerSituation | null) => { if (live) setS(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [saveId, playerId, squadId]);
  if (!s) return null;
  const top = withCard && s.card ? <OfferPlayerCard playerId={playerId} card={s.card} /> : null;
  const parts = [
    t(`negotiation.situation.role.${s.role}`),
    ...(listing === "transfer" ? [] : [t(s.forSale ? "negotiation.situation.forSale" : "negotiation.situation.notForSale")]),
    ...(listing === "loan" ? [] : [s.onLoan ? t("negotiation.situation.onLoan") : t(s.loanable ? "negotiation.situation.loanable" : "negotiation.situation.notLoanable")]),
    ...(s.requested ? [t("negotiation.situation.requested")] : []),
  ];
  const line = <p className="text-sm text-muted-foreground m-0">{t("negotiation.situation.label")}: {parts.join(" · ")}</p>;
  if (!listing) return top ? <div className="flex flex-col gap-2">{top}{line}</div> : line;
  const listed = listing === "transfer" ? s.forSale : s.loanable;
  const thin = s.thinAfter
    ? <p className="text-sm text-chart-4 m-0 w-full">{t(`negotiation.situation.thinAfter.${s.thinAfter.line}`, { count: s.thinAfter.left, min: s.thinAfter.min })}</p>
    : null;
  // What the club paid for him and what he is worth today, to judge the bid (tester report, 10.7).
  const paidOn = s.paid ? new Date(`${s.paid.on}T12:00:00`).toLocaleDateString(i18n.language, { month: "short", year: "numeric" }) : "";
  const paidKey = !s.paid ? null
    : s.paid.kind === "academy" || s.paid.kind === "free" || s.paid.kind === "pre_contract" ? s.paid.kind
    : s.paid.fee > 0 ? s.paid.kind : "noFee";
  const money = [
    ...(s.paid && paidKey ? [t(`negotiation.situation.paid.${paidKey}`, { fee: formatFee(s.paid.fee), date: paidOn })] : []),
    ...(s.value !== undefined ? [t("negotiation.situation.value", { value: formatFee(s.value) })] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {top && <div className="w-full mb-1">{top}</div>}
      <span className={`rounded border px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${listed ? "border-primary/50 bg-primary/10 text-primary" : "border-chart-4/50 bg-chart-4/10 text-chart-4"}`}>
        {t(`negotiation.situation.${listing === "transfer" ? "sale" : "loan"}${listed ? "Listed" : "NotListed"}`)}
      </span>
      {line}
      {money.length > 0 && <p className="text-sm text-foreground m-0 w-full tabular-nums">{money.join(" · ")}</p>}
      {thin}
    </div>
  );
}
