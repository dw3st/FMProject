import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import type { Bet } from "@/types/betTypes";

/** The day's resolved bets, in the inbox. */
export function BetsInboxBody({ bets, net }: { bets: Bet[]; net: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {bets.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-semibold">{pickLabel(t, b.pick, b.homeName, b.awayName)}</span>
            <span className="text-muted-foreground"> · {b.homeName} x {b.awayName}</span>
          </span>
          <span className={`shrink-0 tabular-nums font-semibold ${b.status === "won" ? "text-primary" : b.status === "lost" ? "text-destructive" : "text-muted-foreground"}`}>
            {b.status === "won" ? `+${formatFee((b.payout ?? 0) - b.stake)}` : b.status === "lost" ? `-${formatFee(b.stake)}` : t("bets.status.refunded")}
          </span>
        </div>
      ))}
      <p className="text-sm font-semibold m-0 tabular-nums">{t("bets.inbox.net", { value: `${net > 0 ? "+" : ""}${formatFee(net)}` })}</p>
    </div>
  );
}
