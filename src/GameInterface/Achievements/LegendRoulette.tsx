import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Flag } from "@/GameInterface/Components/Flag";
import { formatEuros } from "@/Domain/money";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { positionLabel } from "@/GameInterface/positionHelpers";
import { prefersReducedMotion } from "@/GraficsEngine/motionPrefs";
import type { AchievementsData, LegendCard, LegendTier } from "@/GameInterface/Achievements/achievementsApi";

/** Fixed colours per tier (never the club's): the card border and the tier label. */
const TIER_CLASS: Record<LegendTier, string> = {
  normal: "border-foreground text-foreground",
  rare: "border-star-blue text-star-blue",
  epic: "border-star-green text-star-green",
  legend: "border-star-gold text-star-gold",
  super: "border-star-gold text-star-gold",
};
/** The icon tier shines (tester report: "extra gold brilhante"). */
const SHINE: Partial<Record<LegendTier, string>> = { super: "shadow-[0_0_14px_var(--color-star-gold)]" };
const TIERS: LegendTier[] = ["normal", "rare", "epic", "legend", "super"];
const CARD_W = 128;
const GAP = 8;
const SPIN_MS = 3200;

type Spin = AchievementsData["shop"]["spin"];

/** The legend roulette (tester report, option B, 8.9.34): a reel of legends slides to the marker and stops on the draw. */
export function LegendRoulette({ spin, balance, wallet, canSpin, busy, onSpin, onAccept }: {
  spin: Spin;
  balance: number;
  /** The manager's money; null when unknown. */
  wallet: number | null;
  canSpin: boolean;
  busy: boolean;
  onSpin: (pay: "points" | "money") => Promise<boolean>;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  const pending = spin.pending;
  const [rolling, setRolling] = useState(false);
  const [offset, setOffset] = useState<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const animateNext = useRef(false);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [pending?.id]);

  const stop = (spin.reelAt * (CARD_W + GAP)) - (width / 2) + (CARD_W / 2);
  const reelKey = pending ? `${pending.id}:${pending.rerolls}` : "";

  // A fresh spin slides from the start to the draw; a page opened with a pending draw shows it already stopped.
  useEffect(() => {
    if (!pending) { setOffset(null); return; }
    if (!animateNext.current || prefersReducedMotion()) { setOffset(stop); setRolling(false); return; }
    animateNext.current = false;
    setRolling(true);
    setOffset(0);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOffset(stop)));
    const done = window.setTimeout(() => setRolling(false), SPIN_MS + 100);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelKey]);

  useEffect(() => {
    if (pending && !rolling) setOffset(stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  async function spinNow(pay: "points" | "money") {
    animateNext.current = true;
    const ok = await onSpin(pay);
    if (!ok) animateNext.current = false;
  }

  const odds = (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {TIERS.map((tier) => (
        <span key={tier} className="text-sm tabular-nums">
          <span className={TIER_CLASS[tier].split(" ")[1]}>{t(`achievements.shop.legend.tier.${tier}`)}</span>
          <span className="text-muted-foreground"> {Math.round(spin.odds[tier] * 100)}%</span>
        </span>
      ))}
    </div>
  );

  if (!pending) {
    return (
      <div className="flex flex-col gap-3">
        {odds}
        <div>
          <Button disabled={!canSpin || busy || balance < spin.price} onClick={() => void spinNow("points")}>
            {t("achievements.shop.legend.spin", { n: spin.price })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {odds}
      <div ref={viewport} className="relative overflow-hidden rounded-md border border-border bg-background py-3">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-primary" aria-hidden />
        <div
          className="flex"
          style={{
            gap: GAP,
            transform: `translateX(${-(offset ?? stop)}px)`,
            transition: rolling && offset !== 0 ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.18, 1)` : "none",
          }}
          aria-hidden
        >
          {spin.reel.map((c, i) => <ReelCard key={`${i}:${c.id}`} card={c} won={!rolling && i === spin.reelAt} />)}
        </div>
      </div>
      <div role="status" aria-live="polite" className="min-h-[3.5rem]">
        {!rolling && <Result card={pending} />}
      </div>
      {!rolling && (
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          {pending.available
            ? <Button disabled={busy} onClick={onAccept}>{t("achievements.shop.legend.accept")}</Button>
            : <span className="text-sm text-destructive">{t("achievements.shop.legend.taken")}</span>}
          {pending.available ? (
            <>
              <Button variant="secondary" disabled={busy || balance < spin.rerollPoints} onClick={() => void spinNow("points")}>
                {t("achievements.shop.legend.rerollPoints", { n: spin.rerollPoints })}
              </Button>
              <Button variant="secondary" disabled={busy || (wallet !== null && wallet < spin.rerollMoney)} onClick={() => void spinNow("money")}>
                {t("achievements.shop.legend.rerollMoney", { money: formatEuros(spin.rerollMoney) })}
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={() => void spinNow("points")}>{t("achievements.shop.legend.rerollFree")}</Button>
          )}
        </div>
      )}
      {!rolling && <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("achievements.shop.legend.paid", { n: pending.paid })}</p>}
    </div>
  );
}

function ReelCard({ card, won }: { card: LegendCard; won: boolean }) {
  const { t } = useTranslation();
  const code = card.nationality ? nationalityFlagCode(card.nationality) : null;
  return (
    <div
      className={`flex shrink-0 flex-col gap-1 rounded-md border-2 bg-card px-2 py-2 ${TIER_CLASS[card.tier].split(" ")[0]} ${SHINE[card.tier] ?? ""} ${won ? "ring-2 ring-primary" : ""}`}
      style={{ width: CARD_W }}
    >
      <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${TIER_CLASS[card.tier].split(" ")[1]}`}>
        {t(`achievements.shop.legend.tier.${card.tier}`)}
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {code && <Flag code={code} />}
        <span className="truncate">{card.name}</span>
      </span>
      <span className="text-sm text-muted-foreground">{positionLabel(t, card.positions[0], card.positions[0] ?? "")}</span>
    </div>
  );
}

function Result({ card }: { card: LegendCard }) {
  const { t } = useTranslation();
  const code = card.nationality ? nationalityFlagCode(card.nationality) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 text-base font-semibold text-foreground">
        {code && <Flag code={code} />}
        {card.name}
        <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${TIER_CLASS[card.tier].split(" ")[1]}`}>
          {t(`achievements.shop.legend.tier.${card.tier}`)}
        </span>
      </span>
      <span className="text-sm text-muted-foreground tabular-nums">
        {[
          positionLabel(t, card.positions[0], card.positions[0] ?? ""),
          card.real ? t("achievements.shop.legend.born", { year: card.real.birthYear }) : null,
          card.real && card.real.ballonDor > 0 ? t("achievements.shop.legend.ballonDor", { count: card.real.ballonDor }) : null,
          card.real && card.real.worldCups.length > 0 ? t("achievements.shop.legend.worldCups", { years: card.real.worldCups.join(", ") }) : null,
        ].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}
