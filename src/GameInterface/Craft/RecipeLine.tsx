import { createContext, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { craftErrorKey, queueComponent } from "@/GameInterface/Craft/craftApi";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { craftableMissing, materialsShort } from "@/Domain/craft/shortfall";
import type { ComponentCounts, ComponentId, CraftStock, MaterialCounts } from "@/types/craftTypes";

/** What a works asks from the stock (`GET .../facilities` → `build`). */
export interface RecipeBuild {
  recipe: ComponentCounts;
  missing: ComponentCounts;
  locked: ComponentId[];
  canBuild: boolean;
}

/** Links from a works to the other club tabs: the save, and "open the shop with this cart". */
export interface CraftLinks {
  saveId: string;
  goToShop: (cart: MaterialCounts) => void;
  /** Opens the workshop tab. */
  openWorkshop?: () => void;
}

export const CraftLinksContext = createContext<CraftLinks | null>(null);

/** One chip per component of a works: "Viga 3/4 · falta 1"; a locked one says the workshop level it needs. */
export function RecipeLine({ recipe, missing, locked = [] }: { recipe: ComponentCounts; missing: ComponentCounts; locked?: ComponentId[] }) {
  const { t } = useTranslation();
  const entries = (Object.entries(recipe) as [ComponentId, number][]).filter(([, n]) => n > 0);
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
      {entries.map(([id, need]) => {
        const short = missing[id] ?? 0;
        const isLocked = locked.includes(id);
        return (
          <li key={id} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm tabular-nums ${
            short > 0 ? "border-destructive/50" : "border-border"}`}>
            <CraftIcon kind="component" id={id} size={22} />
            <span className="text-foreground">{t(`craft.component.${id}`)}</span>
            <span className={`font-semibold ${short > 0 ? "text-destructive" : "text-primary"}`}>
              {t("craft.recipe.have", { have: need - short, need })}
            </span>
            {short > 0 && <span className="text-destructive">{t("craft.recipe.missing", { count: short })}</span>}
            {isLocked && <span className="text-chart-4">{t("craft.recipe.lockedAt", { level: CRAFT.RECIPES[id].minLevel })}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The recipe of a works and its buttons: Build (only with everything in the stock), Make what is
 * missing (queues the workshop) and Buy the missing materials (opens the shop with the cart).
 */
export function BuildActions({
  build, stock, workshop, blockedHint, pending, onBuild, hideRecipe = false,
}: {
  build: RecipeBuild;
  stock: CraftStock | undefined;
  workshop: number;
  /** Why the works cannot start even with the components (area busy); null when it can. */
  blockedHint: string | null;
  pending: boolean;
  onBuild: () => void;
  /** The recipe is drawn by the caller (Club map panel): only the hint and the buttons. */
  hideRecipe?: boolean;
}) {
  const { t } = useTranslation();
  const links = useContext(CraftLinksContext);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const craftable = craftableMissing(build.missing, workshop);
  const canCraft = Object.keys(craftable).length > 0;
  const short = stock ? materialsShort(craftable, stock) : {};
  const canBuy = Object.keys(short).length > 0;

  const craftMissing = async () => {
    if (!links) return;
    setWorking(true);
    let queued = 0;
    let error: string | null = null;
    for (const [id, n] of Object.entries(craftable) as [ComponentId, number][]) {
      const r = await queueComponent(links.saveId, id, n);
      if (r.ok) queued++;
      else { error = r.error; break; }
    }
    setWorking(false);
    setNote(error
      ? { ok: false, text: t(craftErrorKey(error)) }
      : { ok: true, text: t("craft.craftQueued", { count: queued }) });
  };

  const hint = blockedHint ?? (build.canBuild ? t("craft.recipe.ready") : t("craft.recipe.short"));
  const ok = build.canBuild && blockedHint === null;
  return (
    <div className="flex flex-col gap-3">
      {!hideRecipe && (
        <div className="flex flex-col gap-2">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("craft.recipe.title")}</span>
          <RecipeLine recipe={build.recipe} missing={build.missing} locked={build.locked} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`text-sm flex items-center gap-1.5 ${ok ? "text-chart-2" : "text-muted-foreground"}`}>
          <Icon name={ok ? "check-circle" : "alert"} size={16} />
          {hint}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {!build.canBuild && links && canCraft && (
            <Button variant="secondary" onClick={() => void craftMissing()} disabled={working || pending}>
              <Icon name="hammer" size={16} />
              {t("craft.craftMissing")}
            </Button>
          )}
          {!build.canBuild && links && canBuy && (
            <Button variant="secondary" onClick={() => links.goToShop(short)} disabled={working || pending}>
              <Icon name="store" size={16} />
              {t("craft.buyMissing")}
            </Button>
          )}
          <Button onClick={onBuild} disabled={pending || !ok}>
            <Icon name="building" size={16} />
            {t("craft.build")}
          </Button>
        </div>
      </div>
      {note && (
        <p className={`text-sm m-0 ${note.ok ? "text-chart-2" : "text-destructive"}`}>{note.text}</p>
      )}
    </div>
  );
}
