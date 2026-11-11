import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { SWAP } from "@/Domain/negotiation/swap";
import { overallAvg } from "@/Domain/playerRating";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import type { RosterPlayer } from "@/types/playerTypes";

export type CashDirection = "pay" | "receive" | "none";

/** The cash of an offer with or without a swap: negative = the selling club pays. */
export function offerCash(amount: number, swapId: string | null, dir: CashDirection): number {
  if (!swapId) return amount;
  return dir === "none" ? 0 : dir === "pay" ? amount : -amount;
}

const NONE = "__none__";

/** "Player in the deal" of a purchase from an AI club (9.4): one of his players plus or minus money. */
export function SwapField({ players, swapId, onSwap, dir, onDir, swapWorth }: {
  players: readonly RosterPlayer[];
  swapId: string | null;
  onSwap: (id: string | null) => void;
  dir: CashDirection;
  onDir: (d: CashDirection) => void;
  /** What the club counted him for in its last answer. */
  swapWorth: number | null;
}) {
  const { t } = useTranslation();
  const own = players.filter((p) => !p.loan).sort((a, b) => overallAvg(b) - overallAvg(a));
  const picked = own.find((p) => p.id === swapId);
  return (
    <div className="flex flex-col gap-2">
      <SelectCombobox
        label={t("negotiation.swap.label")}
        value={swapId ?? NONE}
        onChange={(v) => onSwap(v === NONE ? null : v)}
        options={[
          { value: NONE, label: t("negotiation.swap.none") },
          ...own.map((p) => ({ value: p.id, label: `${p.name} · ${Math.round(overallAvg(p) * 10)} · ${formatFee(playerMarketValue(p))}` })),
        ]}
      />
      {picked && (
        <>
          <OptionChips
            value={dir}
            onChange={onDir}
            aria-label={t("negotiation.swap.label")}
            options={(["pay", "receive", "none"] as const).map((k) => ({ key: k, label: t(`negotiation.swap.dir.${k}`) }))}
          />
          <p className="text-sm text-muted-foreground m-0 tabular-nums">
            {swapWorth !== null
              ? t("negotiation.swap.counted", { value: formatFee(swapWorth) })
              : t("negotiation.swap.hint", { value: formatFee(playerMarketValue(picked)), pct: Math.round((1 - SWAP.UNNEEDED_DISCOUNT) * 100) })}
          </p>
        </>
      )}
    </div>
  );
}
