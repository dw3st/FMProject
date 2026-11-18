import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { StepperField } from "@/GameInterface/ui/StepperField";
import { Icon } from "@/GameInterface/Icons";
import { StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { CraftBanner } from "@/GameInterface/Craft/CraftBanner";
import { newVisualOn } from "@/Domain/art/paintedFaces";
import { buyMaterials, craftErrorKey } from "@/GameInterface/Craft/craftApi";
import { useCraft } from "@/GameInterface/Craft/useCraft";
import { materialTotal } from "@/Domain/craft/shortfall";
import { formatEuros } from "@/Domain/money";
import type { MaterialCounts, MaterialId, Supplier } from "@/types/craftTypes";

const MAX_LINE = 10_000;
type Qty = Record<MaterialId, Record<Supplier, number>>;

const qtyFrom = (cart: MaterialCounts | null): Qty => {
  const out = {} as Qty;
  for (const m of ["concrete", "steel", "wood", "grass", "fabric", "electronics"] as MaterialId[]) {
    out[m] = { standard: Math.min(MAX_LINE, cart?.[m] ?? 0), good: 0 };
  }
  return out;
};

/** Step of the quantity fields: 1 up to 20, then 5, then 10 from 100. */
const stepQty = (v: number, dir: 1 | -1) => {
  const s = (dir > 0 ? v : v - 1) >= 100 ? 10 : (dir > 0 ? v : v - 1) >= 20 ? 5 : 1;
  return Math.max(0, v + dir * s);
};

/**
 * Club → Shop: the six materials at this week's price (arrow against last week), standard and good
 * supplier quantities, the order total and the board's discount and monthly materials. `cart` (from
 * "Buy the missing materials") fills the standard quantities when the tab opens.
 */
export function ShopView({ saveId, cart }: { saveId: string; cart: MaterialCounts | null }) {
  const { t } = useTranslation();
  const { view, loadError, actionError, busy, run } = useCraft(saveId);
  const [qty, setQty] = useState<Qty>(() => qtyFrom(cart));
  const [bought, setBought] = useState<number | null>(null);
  if (loadError) return <p className="text-sm text-muted-foreground m-0">{t(craftErrorKey(loadError))}</p>;
  if (!view) return <p className="text-sm text-muted-foreground m-0">{t("financesScreen.loading")}</p>;

  const set = (m: MaterialId, s: Supplier, n: number) => { setBought(null); setQty((q) => ({ ...q, [m]: { ...q[m], [s]: n } })); };
  const total = view.shop.reduce((sum, r) => sum + qty[r.material].standard * r.standard + qty[r.material].good * r.good, 0);
  const lines = view.shop.flatMap((r) => (["standard", "good"] as Supplier[])
    .filter((s) => qty[r.material][s] > 0)
    .map((s) => ({ material: r.material, supplier: s, qty: qty[r.material][s] })));

  const buy = async () => {
    const r = await run(() => buyMaterials(saveId, lines), (d) => d.view);
    if (r) { setBought(r.total); setQty(qtyFrom(null)); }
  };

  return (
    <div className="flex flex-col gap-4">
      {newVisualOn() && (
        <CraftBanner art="craft/shop-banner.webp">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.tabs.shop")}</h2>
        </CraftBanner>
      )}
      {cart && Object.keys(cart).length > 0 && <p className="text-sm text-primary m-0">{t("craft.shop.fromWorks")}</p>}
      <StatsTable head={<>
        <StatsHead>{t("craft.shop.material")}</StatsHead>
        <StatsHead align="right">{t("craft.shop.standard")}</StatsHead>
        <StatsHead align="right">{t("craft.shop.good")}</StatsHead>
        <StatsHead align="center">{t("craft.shop.inStock")}</StatsHead>
        <StatsHead align="center">{t("craft.shop.qtyStandard")}</StatsHead>
        <StatsHead align="center">{t("craft.shop.qtyGood")}</StatsHead>
        <StatsHead align="right">{t("craft.shop.total")}</StatsHead>
      </>}>
        {view.shop.map((r) => {
          const up = r.standard > r.previous;
          const down = r.standard < r.previous;
          const line = qty[r.material].standard * r.standard + qty[r.material].good * r.good;
          return (
            <StatsRow key={r.material}>
              <StatsCell>
                <span className="flex items-center gap-2">
                  <CraftIcon kind="material" id={r.material} />
                  <span className="font-semibold text-foreground whitespace-nowrap">{t(`craft.material.${r.material}`)}</span>
                </span>
              </StatsCell>
              <StatsCell align="right" className="tabular-nums whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  {up && <span className="text-destructive" title={t("craft.shop.priceUp")}><Icon name="trend-up" size={16} /></span>}
                  {down && <span className="text-primary" title={t("craft.shop.priceDown")}><Icon name="trend-down" size={16} /></span>}
                  {formatEuros(r.standard)}
                </span>
              </StatsCell>
              <StatsCell align="right" className="tabular-nums text-muted-foreground whitespace-nowrap">{formatEuros(r.good)}</StatsCell>
              <StatsCell align="center" className="tabular-nums text-muted-foreground">{materialTotal(view.stock, r.material)}</StatsCell>
              <StatsCell align="center">
                <div className="w-32 mx-auto">
                  <StepperField value={qty[r.material].standard} onChange={(n) => set(r.material, "standard", n)} min={0} max={MAX_LINE}
                    step={stepQty} downLabel={t("common.decrease")} upLabel={t("common.increase")}
                    ariaLabel={`${t(`craft.material.${r.material}`)} · ${t("craft.shop.qtyStandard")}`} />
                </div>
              </StatsCell>
              <StatsCell align="center">
                <div className="w-32 mx-auto">
                  <StepperField value={qty[r.material].good} onChange={(n) => set(r.material, "good", n)} min={0} max={MAX_LINE}
                    step={stepQty} downLabel={t("common.decrease")} upLabel={t("common.increase")}
                    ariaLabel={`${t(`craft.material.${r.material}`)} · ${t("craft.shop.qtyGood")}`} />
                </div>
              </StatsCell>
              <StatsCell align="right" className={`tabular-nums whitespace-nowrap ${line > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {formatEuros(line)}
              </StatsCell>
            </StatsRow>
          );
        })}
      </StatsTable>
      <p className="text-sm text-muted-foreground m-0">{t("craft.shop.weekNote")}</p>
      <div className="card-arcade rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Figure label={t("craft.shop.total")} value={formatEuros(total)} strong />
          <Figure label={t("craft.shop.balance")} value={formatEuros(view.balance)} danger={view.balance - total < 0} />
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground tabular-nums">
            {view.discount && <span className="text-chart-2">{t("craft.shop.discount")}</span>}
            <span>{t("craft.shop.allowance", { value: formatEuros(view.allowance) })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { setQty(qtyFrom(null)); setBought(null); }} disabled={busy || lines.length === 0}>
            {t("craft.shop.clear")}
          </Button>
          <Button onClick={() => void buy()} disabled={busy || lines.length === 0}>
            <Icon name="cart" size={16} />
            {t("craft.shop.buy")}
          </Button>
        </div>
      </div>
      {actionError && <p className="text-sm text-destructive m-0">{t(craftErrorKey(actionError))}</p>}
      {bought !== null && <p className="text-sm text-chart-2 m-0 tabular-nums">{t("craft.shop.bought", { value: formatEuros(bought) })}</p>}
    </div>
  );
}

function Figure({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className={`font-display font-bold text-lg tabular-nums leading-none ${danger ? "text-destructive" : strong ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
