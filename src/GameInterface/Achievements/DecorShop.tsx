import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { DECOR_ITEMS, DECOR_ITEM_IDS, type DecorItemId } from "@/Domain/achievements/decorShop";
import { bannerRects, decorFill, hexNumber, mosaicCells } from "@/GraficsEngine/stadiumDecor";
import type { BannerPattern, MosaicPattern } from "@/types/achievementTypes";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { managerWallet } from "@/Domain/managers/assets";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] m-0";
const RARITY_CLASS = { common: "text-muted-foreground", rare: "text-chart-2", legendary: "text-star-gold" } as const;
const BANNER_OF: Partial<Record<DecorItemId, BannerPattern>> = { bannerCheck: "check", bannerPinstripe: "pinstripe", bannerChevron: "chevron" };
const EFFECT_ICON: Partial<Record<DecorItemId, IconName>> = { sideFlags: "report", flares: "sparkles", doubleEnd: "copy", fireworks: "sparkles", goalFlash: "zap" };
const TW = 160;
const TH = 96;
const SHOWCASE = ["#1f4fa8", "#ffc93c"] as const;
const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** A small picture of the item: the mosaic or the banner in a showcase palette, an icon for the effects. */
function DecorThumb({ id }: { id: DecorItemId }) {
  const item = DECOR_ITEMS[id];
  // A fixed, contrasting showcase palette (report 9.1.1: in the club colours a white club showed only blank grids).
  const colors: [number, number] = [hexNumber(SHOWCASE[0]), hexNumber(SHOWCASE[1])];
  if (item.kind === "effect") {
    return (
      <div className="w-full aspect-[5/3] rounded bg-secondary/40 border border-border flex items-center justify-center">
        <Icon name={EFFECT_ICON[id] ?? "star"} size={32} className={RARITY_CLASS[item.rarity]} />
      </div>
    );
  }
  const rects = item.kind === "mosaic"
    ? mosaicCells({ side: "left", x: 0, y: 0, w: TW, h: TH }, { pattern: id as MosaicPattern, titleStars: 3 })
    : bannerRects(TW / 2 - 16, 4, 32, TH - 8, BANNER_OF[id] ?? "plain");
  return (
    <svg viewBox={`0 0 ${TW} ${TH}`} className="w-full aspect-[5/3] rounded border border-border" shapeRendering="crispEdges" role="img" aria-hidden="true">
      <rect x={0} y={0} width={TW} height={TH} fill="#2b3240" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w + 0.3} height={r.h + 0.3} fill={toHex(decorFill(r, colors))} />
      ))}
    </svg>
  );
}

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
              <DecorThumb id={id} />
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
