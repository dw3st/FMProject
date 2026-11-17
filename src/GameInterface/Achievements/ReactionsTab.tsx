import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";
import { gameArtUrl } from "@/Domain/art/paintedFaces";
import type { ShopReaction, ShopReactionId } from "@/Domain/rivals/reactionShop";
import { readMatchVolume } from "@/GameInterface/artPrefs";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { ReactionIcon } from "@/GameInterface/World/ReactionIcon";
import { pickReactionSound } from "@/GameInterface/World/reactionSounds";
import { reactionsChanged } from "@/GameInterface/World/ownedReactions";
import type { AchievementKey } from "@/types/achievementTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";

type Row = { id: ShopReactionId; owned: boolean } & ShopReaction;

/** The reactions shop (Fabio's idea, 12.11): bought with the manager's own money or unlocked by an achievement. */
export function ReactionsTab() {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<{ wallet: number; shop: Row[] } | null>(null);
  const [confirming, setConfirming] = useState<ShopReactionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!saveId) return;
    fetch(`/api/saves/${saveId}/manager-reactions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, [saveId, reload]);

  function listen(id: ShopReactionId) {
    const path = pickReactionSound(id, Math.random());
    if (!path) return;
    try {
      const a = new Audio(gameArtUrl(path));
      a.volume = Math.max(0, Math.min(1, 0.8 * readMatchVolume()));
      void a.play().catch(() => {});
    } catch { /* no audio */ }
  }

  async function buy(id: ShopReactionId) {
    if (!saveId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/manager-reactions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(t(`reactionShop.errors.${code}`, { defaultValue: t("reactionShop.errors.generic") }));
      } else {
        reactionsChanged(saveId);
        await refresh({ background: true });
      }
      setConfirming(null);
      setReload((n) => n + 1);
    } catch {
      setError(t("reactionShop.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  function unlockText(key: AchievementKey): string {
    if (key.startsWith("secret:")) return t("reactionShop.unlockSecret");
    const [track] = key.split(":");
    return t("reactionShop.unlockGold", { name: t(`achievements.tracks.${track}.name`) });
  }

  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("reactionShop.loading")}</p>;
  const forSale = data.shop.filter((r) => r.price !== undefined);
  const earned = data.shop.filter((r) => r.unlock !== undefined);

  const card = (r: Row) => {
    const short = r.price !== undefined && data.wallet < r.price;
    return (
      <div key={r.id} className="card-arcade rounded-md p-4 flex items-center gap-4">
        <div className={`shrink-0 ${r.owned ? "" : "opacity-60 grayscale"}`}><ReactionIcon id={r.id} size={64} /></div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="font-display font-bold uppercase text-lg leading-tight">{t(`rivals.reactions.${r.id}`)}</span>
          {r.owned ? (
            <span className="text-sm text-star-green flex items-center gap-1"><Icon name="check" size={16} />{t("reactionShop.owned")}</span>
          ) : r.price !== undefined ? (
            <span className="text-sm tabular-nums text-foreground">{formatFee(r.price)}</span>
          ) : (
            <span className="text-sm text-muted-foreground flex items-center gap-1"><Icon name="lock" size={16} />{unlockText(r.unlock!)}</span>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <Button variant="secondary" flush onClick={() => listen(r.id)}>
              <Icon name="volume" size={16} />{t("reactionShop.listen")}
            </Button>
            {!r.owned && r.price !== undefined && (confirming === r.id ? (
              <>
                <Button className="h-9 px-3" disabled={busy || short} onClick={() => void buy(r.id)}>{t("reactionShop.confirm")}</Button>
                <Button variant="secondary" flush disabled={busy} onClick={() => setConfirming(null)}>{t("reactionShop.cancel")}</Button>
              </>
            ) : (
              <Button variant="secondary" flush disabled={busy || short} onClick={() => setConfirming(r.id)}>
                {short ? t("reactionShop.noMoney") : t("reactionShop.buy")}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="card-arcade rounded-md p-4 max-w-sm">
        <p className={LABEL}>{t("reactionShop.wallet")}</p>
        <p className="font-display font-bold tabular-nums text-2xl text-primary m-0 mt-1">{formatFee(data.wallet)}</p>
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("reactionShop.hint")}</p>
      {error && <p className="text-sm text-destructive m-0">{error}</p>}
      <SectionTitle>{t("reactionShop.forSale")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{forSale.map(card)}</div>
      <SectionTitle>{t("reactionShop.byAchievement")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{earned.map(card)}</div>
    </div>
  );
}
