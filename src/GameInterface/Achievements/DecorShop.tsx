import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { DECOR_ITEMS, DECOR_ITEM_IDS, type DecorItemId } from "@/Domain/achievements/decorShop";
import { DecorPreview } from "@/GameInterface/Achievements/DecorPreview";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { managerWallet } from "@/Domain/managers/assets";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] m-0";
const RARITY_CLASS = { common: "text-muted-foreground", rare: "text-chart-2", legendary: "text-star-gold" } as const;
/** The stadium decorations shop (9.1): bought once with the manager's own money. */
export function DecorShop({ saveId, owned, wallet, onBought }: {
  saveId: string | undefined;
  owned: readonly string[];
  wallet: number;
  onBought: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<DecorItemId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: DecorItemId) => DECOR_ITEMS[id].kind === "mosaic" && id !== "titles"
    ? t("achievements.decorShop.mosaicName", { name: t(`achievements.decorStyle.patterns.${id}`) })
    : t(`achievements.decorShop.items.${id}.name`);
  const desc = (id: DecorItemId) => DECOR_ITEMS[id].kind === "mosaic" && id !== "titles"
    ? t("achievements.decorShop.mosaicDesc")
    : t(`achievements.decorShop.items.${id}.desc`);

  async function buy(id: DecorItemId) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/manager-decor`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: id }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(t(`achievements.assets.errors.${code}`, { defaultValue: t("achievements.assets.errors.generic") }));
      }
      setConfirming(null);
      await onBought();
    } catch {
      setError(t("achievements.assets.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>{t("achievements.decorShop.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("achievements.decorShop.note")}</p>
      {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DECOR_ITEM_IDS.map((id) => {
          const item = DECOR_ITEMS[id];
          const has = owned.includes(id);
          return (
            <div key={id} className={`card-arcade rounded-md p-4 flex flex-col gap-2 ${item.rarity === "legendary" ? "ring-1 ring-star-gold/60" : ""}`}>
              <DecorPreview id={id} />
              <p className={`${LABEL} ${RARITY_CLASS[item.rarity]}`}>
                {t(`achievements.decorShop.kind.${item.kind}`)} · {t(`achievements.decorShop.rarity.${item.rarity}`)}
              </p>
              <p className="text-sm font-semibold text-foreground m-0">{name(id)}</p>
              <p className="text-sm text-muted-foreground m-0">{desc(id)}</p>
              <div className="mt-auto pt-1">
                {has ? (
                  <p className="text-sm text-primary flex items-center gap-1.5 m-0"><Icon name="check" size={16} />{t("achievements.decorShop.owned")}</p>
                ) : confirming === id ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="tabular-nums" disabled={busy} onClick={() => void buy(id)}>{t("achievements.assets.confirm", { price: formatFee(item.price) })}</Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>{t("achievements.assets.cancel")}</Button>
                  </div>
                ) : (
                  <Button
                    className="tabular-nums"
                    disabled={busy || item.price > wallet}
                    title={item.price > wallet ? t("achievements.assets.errors.noMoney") : undefined}
                    onClick={() => setConfirming(id)}
                  >
                    {formatFee(item.price)}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The shop with the manager's wallet (bets included, the same the purchase route checks). */
export function DecorShopSection({ owned, onBought }: { owned: readonly string[]; onBought: () => Promise<void> | void }) {
  const { session, save } = useGameSave();
  const [betWallet, setBetWallet] = useState<number | null>(null);
  useEffect(() => {
    if (!session?.saveId) return;
    fetch(`/api/saves/${session.saveId}/bets?summary=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { wallet: number } | null) => setBetWallet(v?.wallet ?? null))
      .catch(() => setBetWallet(null));
  }, [session?.saveId, save?.managerSpent]);
  const wallet = betWallet ?? managerWallet(save?.managerEarnings ?? 0, save?.managerSpent);
  return <DecorShop saveId={session?.saveId} owned={owned} wallet={wallet} onBought={onBought} />;
}
