import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { componentHelp, materialUses, type CraftUse } from "@/Domain/craft/craftHelp";
import type { ComponentId, CraftStock, MaterialId } from "@/types/craftTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const CARD_W = 300;
const OPEN_DELAY = 180;
const CLOSE_DELAY = 120;

/**
 * A name with a "?" next to it: resting the mouse on either (or tapping the "?") opens a card under it, drawn on top of
 * the page (a portal), so a table that clips its rows never cuts it. Escape or a tap elsewhere closes it.
 */
export function HelpTip({ label, button, children, card }: { label: string; button: string; children?: ReactNode; card: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; max: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const later = (v: boolean, ms: number) => { clear(); timer.current = setTimeout(() => setOpen(v), ms); };
  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const left = Math.max(8, Math.min(vw - CARD_W - 8, r.left));
      const h = panel.current?.scrollHeight ?? 220;
      // under the name when it fits, else on the side with more room, scrolling inside when even that is short
      const below = window.innerHeight - r.bottom - 16;
      const above = r.top - 16;
      const up = h > below && above > below;
      const max = Math.max(120, up ? above : below);
      setPos({ left, top: up ? Math.max(8, r.top - 8 - Math.min(h, max)) : r.bottom + 8, max });
    };
    place();
    const raf = requestAnimationFrame(place);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const hover = {
    onMouseEnter: () => later(true, OPEN_DELAY),
    onMouseLeave: () => later(false, CLOSE_DELAY),
  };

  return (
    <span ref={anchor} className="inline-flex items-center gap-2 min-w-0" {...hover}>
      {children}
      <button type="button" aria-label={button} aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { clear(); setOpen((v) => !v); }}
        onFocus={() => later(true, OPEN_DELAY)}
        className="inline-flex shrink-0 items-center justify-center h-8 w-8 -my-1 rounded-full border border-border bg-transparent text-sm font-display font-bold text-muted-foreground cursor-pointer hover:border-primary hover:text-primary">
        ?
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panel} id={id} role="dialog" aria-label={label} {...hover}
          className="fixed z-[9999] rounded-md border border-border bg-popover p-3 flex flex-col gap-2 shadow-sm overflow-y-auto [&>*]:shrink-0"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: CARD_W, maxHeight: pos?.max }}>
          {card()}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** "Stand enlargement", "Gym", "Workshop upgrade". */
export function useCraftUseLabel(): (u: CraftUse) => string {
  const { t } = useTranslation();
  return (u) => (u.kind === "item" ? t(`facilities.item.${u.item}`) : t(`craftHelp.use.${u.kind}`));
}

/** The card of a component: recipe with the stock, bench time per lot, workshop level and the works that use it. */
export function ComponentCard({ id, stock, workshop }: { id: ComponentId; stock: CraftStock | null; workshop: number }) {
  const { t } = useTranslation();
  const useCraftUseLabelOf = useCraftUseLabel();
  const h = componentHelp(id, stock, workshop);
  return (
    <>
      <span className="flex items-center gap-2">
        <CraftIcon kind="component" id={id} size={28} />
        <span className="font-display font-black uppercase text-base leading-none text-foreground">{t(`craft.component.${id}`)}</span>
      </span>
      <span className={LABEL}>{t("craftHelp.madeWith")}</span>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {h.materials.map((m) => (
          <li key={m.material} className="flex items-center gap-2 text-sm tabular-nums">
            <CraftIcon kind="material" id={m.material} size={22} />
            <span className="flex-1 text-foreground">{t("craftHelp.per", { count: m.per, material: t(`craft.material.${m.material}`) })}</span>
            <span className={m.have >= m.per ? "text-muted-foreground" : "text-chart-4"}>{t("craftHelp.inStock", { count: m.have })}</span>
          </li>
        ))}
      </ul>
      <span className="text-sm text-muted-foreground tabular-nums">{t("craftHelp.bench", { count: h.days, lot: h.lot })}</span>
      <span className={`text-sm ${h.locked ? "text-chart-4" : "text-muted-foreground"}`}>
        {h.locked ? t("craftHelp.needsLevel", { level: h.minLevel, now: workshop }) : t("craftHelp.fromLevel", { level: h.minLevel })}
      </span>
      <span className={LABEL}>{t("craftHelp.usedIn")}</span>
      <span className="text-sm text-foreground">{h.uses.map(useCraftUseLabelOf).join(", ")}</span>
    </>
  );
}

/** The card of a material: the components it goes into. */
export function MaterialCard({ id, stock }: { id: MaterialId; stock: CraftStock | null }) {
  const { t } = useTranslation();
  const have = stock ? (stock.materials[id]?.standard ?? 0) + (stock.materials[id]?.good ?? 0) : null;
  return (
    <>
      <span className="flex items-center gap-2">
        <CraftIcon kind="material" id={id} size={28} />
        <span className="font-display font-black uppercase text-base leading-none text-foreground">{t(`craft.material.${id}`)}</span>
      </span>
      {have !== null && <span className="text-sm text-muted-foreground tabular-nums">{t("craftHelp.inStock", { count: have })}</span>}
      <span className={LABEL}>{t("craftHelp.goesInto")}</span>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {materialUses(id).map((u) => (
          <li key={u.component} className="flex items-center gap-2 text-sm tabular-nums">
            <CraftIcon kind="component" id={u.component} size={22} />
            <span className="text-foreground">{t("craftHelp.takes", { count: u.per, component: t(`craft.component.${u.component}`) })}</span>
          </li>
        ))}
      </ul>
      <span className="text-sm text-muted-foreground">{t("craftHelp.buyHint")}</span>
    </>
  );
}

/** A component's name with its "?". */
export function ComponentHelp({ id, stock, workshop, children }: {
  id: ComponentId; stock: CraftStock | null; workshop: number; children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <HelpTip label={t(`craft.component.${id}`)} button={t("craftHelp.open", { name: t(`craft.component.${id}`) })} card={() => <ComponentCard id={id} stock={stock} workshop={workshop} />}>
      {children}
    </HelpTip>
  );
}

/** A material's name with its "?". */
export function MaterialHelp({ id, stock, children }: { id: MaterialId; stock: CraftStock | null; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <HelpTip label={t(`craft.material.${id}`)} button={t("craftHelp.openMaterial", { name: t(`craft.material.${id}`) })} card={() => <MaterialCard id={id} stock={stock} />}>
      {children}
    </HelpTip>
  );
}

/**
 * Brings the element with `id` into view by scrolling only its own scroll pane (the screen's), never the page frame:
 * `scrollIntoView` also scrolls the document and slides the top bar out of place.
 */
export function scrollIntoPane(id: string, offset = 16): void {
  const el = document.getElementById(id);
  if (!el) return;
  let pane = el.parentElement;
  while (pane && !(pane.scrollHeight > pane.clientHeight && /(auto|scroll)/.test(getComputedStyle(pane).overflowY))) pane = pane.parentElement;
  if (!pane) return;
  const top = pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - offset;
  pane.scrollTo({ top, behavior: "smooth" });
}
