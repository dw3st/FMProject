import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { Label } from "@/GameInterface/ui/Label";
import { Icon } from "@/GameInterface/Icons";
import { formatFee } from "@/Domain/money";
import { askingBand, askingStep, parseAskingPrice, stepAskingPrice } from "@/Domain/negotiation/askingPrice";
import type { SellCandidate } from "@/types/transferMarketTypes";

interface Props {
  saveId: string;
  playerId: string;
  playerName: string;
  /** Market value, EUR (the default asking price). */
  value: number;
  /** Current asking price when he is already listed. */
  current?: number;
  listed: boolean;
  onClose: () => void;
  onSaved: (list: SellCandidate[]) => void;
}

/**
 * Asking price of one of the human's players (#88, `.claude/rules/game/negotiation.md`): below his
 * value clubs bid sooner and near the price, above it fewer bid and they open lower.
 */
export function AskingPriceModal({ saveId, playerId, playerName, value, current, listed, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [price, setPrice] = useState(current ?? value);
  const [text, setText] = useState(((current ?? value) / 1_000_000).toFixed(1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const apply = (next: number) => {
    setPrice(next);
    setText((next / 1_000_000).toFixed(1));
  };
  const band = askingBand(price, value);
  const pct = value > 0 ? Math.round((price / value) * 100) : 100;

  async function save() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/saves/${saveId}/sell-list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId, askingPrice: price }),
      });
      if (!res.ok) { setError(true); return; }
      const body = (await res.json()) as { playerSellList: SellCandidate[] };
      onSaved(body.playerSellList);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-border bg-card/50">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("negotiation.asking.title")}</h2>
          <p className="text-sm text-muted-foreground m-0 mt-0.5">{playerName}</p>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <Label htmlFor="asking-price" className="mb-2">{t("negotiation.asking.label")}</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t("negotiation.asking.down")}
                onClick={() => apply(stepAskingPrice(price, -1))}
                className="w-10 h-10 rounded border border-border bg-transparent text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center justify-center"
              >
                <Icon name="minus" size={16} />
              </button>
              <div className="flex-1 flex items-center rounded border border-border focus-within:border-primary h-10 px-3">
                <span className="text-sm text-muted-foreground">€</span>
                <input
                  id="asking-price"
                  inputMode="decimal"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    const parsed = parseAskingPrice(Number(e.target.value.replace(",", ".")) * 1_000_000);
                    if (parsed !== null) setPrice(parsed);
                  }}
                  onBlur={() => setText((price / 1_000_000).toFixed(1))}
                  className="flex-1 min-w-0 bg-transparent border-0 focus:outline-none text-sm text-foreground tabular-nums px-1"
                />
                <span className="text-sm text-muted-foreground">M</span>
              </div>
              <button
                type="button"
                aria-label={t("negotiation.asking.up")}
                onClick={() => apply(stepAskingPrice(price, 1))}
                className="w-10 h-10 rounded border border-border bg-transparent text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center justify-center"
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground m-0 mt-2 tabular-nums">
              {t("negotiation.asking.step", { step: formatFee(askingStep(price)) })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {t("negotiation.asking.value", { value: formatFee(value) })} · {pct}%
            </span>
            <Chip selected={band === "fair"} onClick={() => apply(value)}>{t("negotiation.asking.useValue")}</Chip>
          </div>

          <p className={`text-sm m-0 ${band === "below" ? "text-chart-2" : band === "above" ? "text-chart-4" : "text-muted-foreground"}`}>
            {t(`negotiation.asking.hint.${band}`)}
          </p>

          {error && <p className="text-sm text-destructive m-0" role="alert">{t("negotiation.errors.generic")}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>{t("common.cancel")}</Button>
            <Button className="flex-1" disabled={busy} onClick={() => void save()}>
              {listed ? t("negotiation.asking.save") : t("negotiation.lists.listSale")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
