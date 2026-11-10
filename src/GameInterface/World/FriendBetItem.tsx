import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import { betGroups } from "@/Domain/rivals/taunts";
import { formatFee } from "@/Domain/money";
import type { Bet } from "@/types/betTypes";

const STAMP = "font-display font-bold uppercase tracking-[0.08em] text-[13px] px-2 py-0.5 rounded";

/** "+€2,5M" for a win (the profit), "−€800K" for a loss (the stake). */
export function betResultMoney(b: Bet): string {
  return b.status === "won" ? `+${formatFee((b.payout ?? 0) - b.stake)}` : `−${formatFee(b.stake)}`;
}

/** A friend's settled bet: who, won or lost, the pick, the game and the money, with the banter actions (8.9.7). */
export function FriendBetItem({ saveId, id, nickname, bet, canTaunt }: {
  saveId: string;
  /** `<seatId>:<betId>`. */
  id: string;
  nickname: string | null;
  bet: Bet;
  canTaunt: boolean;
}) {
  const { t } = useTranslation();
  const won = bet.status === "won";
  return (
    <div className="flex flex-col gap-2 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {nickname && <span className="font-semibold text-foreground">{nickname}</span>}
        <span className={`${STAMP} ${won ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
          {t(`bets.status.${bet.status}`)}
        </span>
        <span className="text-sm text-foreground">
          {pickLabel(t, bet.pick, bet.homeName, bet.awayName)} · <span className="tabular-nums">{formatFee(bet.stake)} · {bet.odds.toFixed(2)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
          <ClubLogo logoUrl={squadLogoUrl(bet.home)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
          <span className="truncate">{t("rivals.bets.game", { home: bet.homeName, away: bet.awayName })}</span>
          <ClubLogo logoUrl={squadLogoUrl(bet.away)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
        </span>
        <span className={`ml-auto font-semibold tabular-nums ${won ? "text-primary" : "text-destructive"}`}>{betResultMoney(bet)}</span>
      </div>
      {canTaunt && <TauntActions saveId={saveId} target={{ bet: id }} groups={betGroups(bet)} />}
    </div>
  );
}
