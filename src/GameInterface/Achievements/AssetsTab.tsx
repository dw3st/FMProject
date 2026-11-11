import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { ASSET_KINDS, ASSET_PRICES, EARNING_GOALS, LEGENDARY_LEVEL, assetsValue, fameBand, fameReputation, managerWallet, nextAssetPrice, type AssetKind } from "@/Domain/managers/assets";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { DecorShop } from "@/GameInterface/Achievements/DecorShop";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const ICON: Record<AssetKind, IconName> = {
  home: "home", car: "car", watch: "watch", boat: "boat", plane: "plane", suit: "suit", art: "art",
  helicopter: "helicopter", horses: "horses", classics: "classics", restaurant: "restaurant", island: "island", franchise: "trophy",
};

/** The manager's own money: what he earned over the career and the assets it buys. */
export function AssetsTab() {
  const { t } = useTranslation();
  const { session, save, refresh } = useGameSave();
  const [confirming, setConfirming] = useState<AssetKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earned = save?.managerEarnings ?? 0;
  // With the bets: the same wallet the purchase route checks.
  const [betWallet, setBetWallet] = useState<number | null>(null);
  useEffect(() => {
    if (!session?.saveId) return;
    fetch(`/api/saves/${session.saveId}/bets?summary=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { wallet: number } | null) => setBetWallet(v?.wallet ?? null))
      .catch(() => setBetWallet(null));
  }, [session?.saveId, save?.managerSpent]);
  const wallet = betWallet ?? managerWallet(earned, save?.managerSpent);
  const assets = save?.managerAssets;
  const art = newVisualOn();

  async function buy(kind: AssetKind) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${session?.saveId}/manager-assets`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(t(`achievements.assets.errors.${code}`, { defaultValue: t("achievements.assets.errors.generic") }));
      }
      setConfirming(null);
      await refresh({ background: true });
    } catch {
      setError(t("achievements.assets.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-arcade rounded-md p-4">
          <p className={LABEL}>{t("achievements.assets.wallet")}</p>
          <p className="font-display font-bold tabular-nums text-2xl text-primary m-0 mt-1">{formatFee(wallet)}</p>
        </div>
        <div className="card-arcade rounded-md p-4">
          <p className={LABEL}>{t("achievements.assets.earned")}</p>
          <p className="font-display font-bold tabular-nums text-2xl m-0 mt-1">{formatFee(earned)}</p>
          <p className="text-sm text-muted-foreground tabular-nums m-0 mt-1">
            {t("achievements.assets.goals", { goals: EARNING_GOALS.map((g) => formatFee(g)).join(" · ") })}
          </p>
        </div>
        {/* Fame from the belongings (8.9.39): reputation points with other managers and clubs. */}
        <div className="card-arcade rounded-md p-4">
          <p className={LABEL}>{t("achievements.assets.fame")}</p>
          <p className="font-display font-bold text-2xl m-0 mt-1">{t(`fame.band.${fameBand(assets, save?.managerDecor)}`)}</p>
          <p className="text-sm text-muted-foreground tabular-nums m-0 mt-1">
            {t("achievements.assets.fameDetail", { value: formatFee(assetsValue(assets, save?.managerDecor)), points: fameReputation(assets, save?.managerDecor).toFixed(1) })}
          </p>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {ASSET_KINDS.map((kind) => {
          const level = assets?.[kind] ?? 0;
          const price = nextAssetPrice(assets, kind);
          // What he owns; before the first purchase, the first level still out of reach.
          const shown = Math.max(1, level);
          return (
            <div key={kind} className="card-arcade rounded-md p-4 flex flex-col gap-3">
              {art && (
                <img
                  src={gameArtUrl(`manager-assets/${kind}-${shown}.webp`)}
                  alt={t(`achievements.assets.level.${kind}.${shown}`)}
                  loading="lazy"
                  className={`w-full aspect-[8/5] object-cover rounded ${level > 0 ? "" : "grayscale opacity-50"}`}
                />
              )}
              <div className="flex items-center gap-2">
                <Icon name={ICON[kind]} size={18} className="text-primary" />
                <SectionTitle>{t(`achievements.assets.kind.${kind}`)}</SectionTitle>
              </div>
              <p className="text-sm font-semibold text-foreground tabular-nums m-0">
                {level > 0 ? t(`achievements.assets.level.${kind}.${level}`) : t("achievements.assets.none")}
              </p>
              <ul className="m-0 p-0 list-none space-y-1">
                {ASSET_PRICES[kind].map((p, i) => (
                  <li key={i} className={`flex items-center justify-between gap-3 text-sm tabular-nums ${i < level ? "text-foreground" : "text-muted-foreground"}`}>
                    <span className="flex items-center gap-2">
                      {art && (
                        <img
                          src={gameArtUrl(`manager-assets/${kind}-${i + 1}.webp`)}
                          alt=""
                          loading="lazy"
                          className={`w-16 aspect-[8/5] object-cover rounded shrink-0 ${i < level ? "" : "opacity-60"}`}
                        />
                      )}
                      {i < level && <Icon name="check" size={16} className="text-primary" />}
                      {t(`achievements.assets.level.${kind}.${i + 1}`)}
                      {i + 1 === LEGENDARY_LEVEL && <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-star-gold">{t("achievements.assets.legendary")}</span>}
                    </span>
                    <span>{formatFee(p)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {price === null ? (
                  <p className="text-sm text-muted-foreground tabular-nums m-0">{t("achievements.assets.maxed")}</p>
                ) : confirming === kind ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="tabular-nums" disabled={busy} onClick={() => void buy(kind)}>{t("achievements.assets.confirm", { price: formatFee(price) })}</Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setConfirming(null)}>{t("achievements.assets.cancel")}</Button>
                  </div>
                ) : (
                  <Button className="tabular-nums" disabled={busy || price > wallet} title={price > wallet ? t("achievements.assets.errors.noMoney") : undefined} onClick={() => setConfirming(kind)}>
                    {t("achievements.assets.buy", { name: t(`achievements.assets.level.${kind}.${level + 1}`), price: formatFee(price) })}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DecorShop
        saveId={session?.saveId}
        owned={save?.managerDecor ?? []}
        wallet={wallet}
        clubColor={session?.clubColors?.[0] ?? "#2d6cdf"}
        onBought={() => refresh({ background: true })}
      />
    </div>
  );
}
