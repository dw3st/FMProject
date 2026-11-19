import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Icon } from "@/GameInterface/Icons";
import { StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { craftErrorKey, recycleItem } from "@/GameInterface/Craft/craftApi";
import { useCraft } from "@/GameInterface/Craft/useCraft";
import { useFacilities } from "@/GameInterface/Facilities/facilitiesApi";
import { COMPONENTS, MATERIALS } from "@/Domain/craft/craftConfig";
import { formatEuros } from "@/Domain/money";
import type { ComponentCounts, ComponentId } from "@/types/craftTypes";
import type { FacilityItemId } from "@/types/facilityTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** Club → Stock: materials (by supplier, with this week's value), components (by quality) and Recycle. */
/** `stacked`: one column (the Materials tab, next to the shop). */
export function StockView({ saveId, stacked = false }: { saveId: string; stacked?: boolean }) {
  const { t } = useTranslation();
  const { view, loadError, actionError, busy, run } = useCraft(saveId);
  const [refresh, setRefresh] = useState(0);
  const facilities = useFacilities(saveId, String(refresh));
  const [item, setItem] = useState<FacilityItemId | null>(null);
  const [asking, setAsking] = useState(false);
  const [returned, setReturned] = useState<ComponentCounts | null>(null);
  if (loadError) return <p className="text-sm text-muted-foreground m-0">{t(craftErrorKey(loadError))}</p>;
  if (!view) return <p className="text-sm text-muted-foreground m-0">{t("financesScreen.loading")}</p>;

  const price = new Map(view.shop.map((s) => [s.material, s]));
  const items = facilities.data?.items ?? [];
  const picked = items.find((i) => i.id === item) ?? null;
  const list = (c: ComponentCounts) => (Object.entries(c) as [ComponentId, number][])
    .filter(([, n]) => n > 0).map(([id, n]) => `${n} ${t(`craft.component.${id}`)}`).join(", ");

  const recycle = async () => {
    if (!item) return;
    setAsking(false);
    const r = await run(() => recycleItem(saveId, item), (d) => d.view);
    if (r) { setReturned(r.returned); setItem(null); setRefresh((n) => n + 1); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className={`grid grid-cols-1 gap-6 ${stacked ? "" : "xl:grid-cols-2"}`}>
        <section className="flex flex-col gap-2 min-w-0">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.stock.materials")}</h3>
          <StatsTable head={<>
            <StatsHead>{t("craft.shop.material")}</StatsHead>
            <StatsHead align="center">{t("craft.stock.standard")}</StatsHead>
            <StatsHead align="center">{t("craft.stock.good")}</StatsHead>
            <StatsHead align="right">{t("craft.stock.value")}</StatsHead>
          </>}>
            {MATERIALS.map((m) => {
              const s = view.stock.materials[m];
              const p = price.get(m);
              const value = (s?.standard ?? 0) * (p?.standard ?? 0) + (s?.good ?? 0) * (p?.good ?? 0);
              return (
                <StatsRow key={m}>
                  <StatsCell>
                    <span className="flex items-center gap-2">
                      <CraftIcon kind="material" id={m} />
                      <span className="font-semibold text-foreground">{t(`craft.material.${m}`)}</span>
                    </span>
                  </StatsCell>
                  <StatsCell align="center" className="tabular-nums">{s?.standard ?? 0}</StatsCell>
                  <StatsCell align="center" className="tabular-nums">{s?.good ?? 0}</StatsCell>
                  <StatsCell align="right" className="tabular-nums text-muted-foreground">{formatEuros(value)}</StatsCell>
                </StatsRow>
              );
            })}
          </StatsTable>
        </section>
        <section className="flex flex-col gap-2 min-w-0">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.stock.components")}</h3>
          <StatsTable head={<>
            <StatsHead>{t("craft.workshop.component")}</StatsHead>
            <StatsHead align="center">{t("craft.quality.common")}</StatsHead>
            <StatsHead align="center">{t("craft.quality.good")}</StatsHead>
            <StatsHead align="center">{t("craft.quality.excellent")}</StatsHead>
            <StatsHead align="center">{t("craft.stock.total")}</StatsHead>
          </>}>
            {COMPONENTS.map((id) => {
              const c = view.stock.components[id];
              const total = (c?.common ?? 0) + (c?.good ?? 0) + (c?.excellent ?? 0);
              return (
                <StatsRow key={id}>
                  <StatsCell>
                    <span className="flex items-center gap-2">
                      <CraftIcon kind="component" id={id} />
                      <span className="font-semibold text-foreground">{t(`craft.component.${id}`)}</span>
                    </span>
                  </StatsCell>
                  <StatsCell align="center" className="tabular-nums">{c?.common ?? 0}</StatsCell>
                  <StatsCell align="center" className="tabular-nums">{c?.good ?? 0}</StatsCell>
                  <StatsCell align="center" className="tabular-nums">{c?.excellent ?? 0}</StatsCell>
                  <StatsCell align="center" className="font-black font-display text-primary tabular-nums">{total}</StatsCell>
                </StatsRow>
              );
            })}
          </StatsTable>
        </section>
      </div>

      <section className="card-arcade rounded-md p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.stock.recycle")}</h3>
          <span className="text-sm text-muted-foreground">{t("craft.stock.recycleHint")}</span>
        </div>
        <span className={LABEL}>{t("craft.stock.item")}</span>
        <OptionChips
          options={items.map((it) => ({
            key: it.id,
            label: t("craft.stock.itemLevel", { item: t(`facilities.item.${it.id}`), level: it.level }),
            disabled: it.level <= 1 || it.project !== null,
          }))}
          value={item}
          onChange={(k) => { setItem(k); setAsking(false); setReturned(null); }}
          aria-label={t("craft.stock.item")}
        />
        {actionError && <p className="text-sm text-destructive m-0">{t(craftErrorKey(actionError))}</p>}
        {returned && <p className="text-sm text-chart-2 m-0">{t("craft.stock.recycleDone", { list: list(returned) || "—" })}</p>}
        {picked && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {asking ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {t("craft.stock.recycleConfirm", { item: t(`facilities.item.${picked.id}`), level: picked.level - 1 })}
                </span>
                <Button variant="danger" onClick={() => void recycle()} disabled={busy}>{t("craft.stock.confirm")}</Button>
                <Button variant="secondary" onClick={() => setAsking(false)}>{t("craft.keep")}</Button>
              </>
            ) : (
              <Button onClick={() => setAsking(true)} disabled={busy}>
                <Icon name="refresh" size={16} />
                {t("craft.stock.recycle")}
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
