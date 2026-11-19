import { useTranslation } from "react-i18next";
import { stepStake } from "@/Domain/bets/bets";
import { BETS } from "@/Domain/bets/betsConfig";
import { formatFee } from "@/Domain/money";
import { competitionName } from "@/Domain/world/labels";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Button } from "@/GameInterface/ui/Button";
import type { LeagueData } from "@/types/playerTypes";
import type { BetGame, BetPick } from "@/types/betTypes";

export interface SlipPick {
  game: BetGame;
  pick: BetPick;
  odds: number;
}

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const STEP_BUTTON = "h-10 px-3 rounded border border-border bg-card font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground";

/** The bet slip, beside the games: the pick, the stake with − / + and Mín / Máx, the possible return, confirm. */
export function BetSlip({ slip, stake, maxStake, busy, error, notice, leagues, day, onStake, onClear, onPlace }: {
  slip: SlipPick | null;
  stake: number;
  maxStake: number;
  busy: boolean;
  error: string | null;
  /** "Bet placed" after a confirm. */
  notice: string | null;
  leagues: LeagueData[];
  day: (d: string) => string;
  onStake: (v: number) => void;
  onClear: () => void;
  onPlace: () => void;
}) {
  const { t, i18n } = useTranslation();
  const canBet = maxStake >= BETS.MIN_STAKE;
  const value = Math.min(maxStake, Math.max(BETS.MIN_STAKE, stake));
  const price = (o: number) => o.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="card-arcade rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-secondary/30 border-b border-border">
        <p className="font-display font-black uppercase text-xl leading-none m-0">{t("bets.slip.title")}</p>
        {slip && <button type="button" onClick={onClear} className="text-sm text-muted-foreground hover:text-foreground">{t("bets.slip.clear")}</button>}
      </div>
      {!slip ? (
        <div className="px-4 py-5 flex flex-col gap-2">
          <p className="text-sm text-muted-foreground m-0">{t("bets.slip.empty")}</p>
          {notice && <p role="status" className="text-sm text-star-green font-semibold m-0">{notice}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <p className={LABEL}>{competitionName(slip.game.competition, leagues, i18n.language)} · {day(slip.game.date)}{slip.game.kickoff ? ` · ${slip.game.kickoff}` : ""}</p>
            <div className="flex items-center gap-2 font-semibold min-w-0">
              <ClubLogo logoUrl={squadLogoUrl(slip.game.home)} title={slip.game.homeName} className="w-8 h-8 shrink-0" />
              <span className="truncate">{slip.game.homeName}</span>
            </div>
            <div className="flex items-center gap-2 font-semibold min-w-0">
              <ClubLogo logoUrl={squadLogoUrl(slip.game.away)} title={slip.game.awayName} className="w-8 h-8 shrink-0" />
              <span className="truncate">{slip.game.awayName}</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 rounded-md border border-primary bg-primary/10 px-3 py-2.5">
            <div className="min-w-0">
              <p className={LABEL}>{t(`bets.market.${slip.pick.market}`)}</p>
              <p className="font-semibold m-0 truncate">{pickLabel(t, slip.pick, slip.game.homeName, slip.game.awayName)}</p>
            </div>
            <p className="font-display font-bold text-2xl tabular-nums text-primary m-0">{price(slip.odds)}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className={LABEL}>{t("bets.slip.stake")}</p>
            <div className="flex items-center justify-between h-10 rounded border border-border px-1 font-bold tabular-nums">
              <button type="button" aria-label={t("bets.less")} disabled={!canBet} onClick={() => onStake(stepStake(value, -1, maxStake))} className="w-9 h-9 text-lg hover:text-primary disabled:opacity-40">−</button>
              <span>{canBet ? formatFee(value) : "—"}</span>
              <button type="button" aria-label={t("bets.more")} disabled={!canBet} onClick={() => onStake(stepStake(value, 1, maxStake))} className="w-9 h-9 text-lg hover:text-primary disabled:opacity-40">+</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!canBet || value === BETS.MIN_STAKE} onClick={() => onStake(BETS.MIN_STAKE)} className={STEP_BUTTON}>{t("bets.min")}</button>
              <button type="button" disabled={!canBet || value === maxStake} onClick={() => onStake(maxStake)} className={STEP_BUTTON}>{t("bets.max")}</button>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums m-0">{canBet ? t("bets.limit", { value: formatFee(maxStake) }) : t("bets.noMoney")}</p>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">{t("bets.return")}</span>
            <span className="font-display font-bold text-2xl tabular-nums text-star-green">{canBet ? `€${Math.round(value * slip.odds).toLocaleString(i18n.language)}` : "—"}</span>
          </div>
          <Button disabled={!canBet || busy} onClick={onPlace} className="w-full">{t("bets.place")}</Button>
          {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}
          {slip.game.own && <p className="text-sm text-muted-foreground m-0">{t("bets.ownClub")}</p>}
        </div>
      )}
    </div>
  );
}
