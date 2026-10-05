import { useTranslation } from "react-i18next";
import type { NegotiationRound, NegotiationTalk } from "@/types/transferMarketTypes";
import { formatFee } from "@/Domain/money";

/** Terms of one round: fee, sell-on clause, wage share. */
function terms(r: NegotiationRound, t: (k: string, o?: Record<string, unknown>) => string): string {
  const parts: string[] = [];
  if (r.wageShare !== undefined) parts.push(t("negotiation.history.share", { share: Math.round(r.wageShare * 100) }));
  if (r.fee !== undefined && (r.fee > 0 || r.wageShare === undefined)) parts.push(formatFee(r.fee));
  if (r.sellOnPct) parts.push(t("negotiation.history.sellOn", { pct: r.sellOnPct }));
  return parts.join(" · ");
}

/** The rounds of the day: your offers and the club's answers (`.claude/rules/game/negotiation.md`). */
export function NegotiationHistory({ talk }: { talk: NegotiationTalk }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">
        {t("negotiation.history.title")}
      </p>
      <ol className="m-0 p-0 list-none space-y-1">
        {talk.history.map((r, i) => (
          <li key={i} className="flex items-baseline gap-2 text-sm tabular-nums">
            <span className={`shrink-0 font-semibold ${r.by === "you" ? "text-foreground" : "text-primary"}`}>
              {r.by === "you" ? t("negotiation.history.you") : t("negotiation.history.club")}
            </span>
            <span className="text-muted-foreground">
              {r.by === "you" ? terms(r, t) : t(`negotiation.history.outcome.${r.outcome}`, { terms: terms(r, t) })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
