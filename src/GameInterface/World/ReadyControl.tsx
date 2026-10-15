import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { formatGameDate } from "@/GameInterface/formatDate";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { addDays } from "@/Domain/dates";

const PRIMARY = "flex items-center gap-1 h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 whitespace-nowrap shrink-0";
const SECONDARY = "flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0";
const MENU_ITEM = "w-full text-left h-10 px-3 rounded text-sm font-semibold text-foreground hover:bg-secondary/40 cursor-pointer bg-transparent border-0";

/** The day block's action in a group world (`.claude/rules/game/multiplayer.md`, part 3). */
export function ReadyControl() {
  const { t, i18n } = useTranslation();
  const { view, busy, error, markReady, simulateToday } = useGroupAdvance();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const fmt = (d: string | null) => (d ? formatGameDate(d, i18n.language, "dayMonth") : "—");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  if (!view) return null;

  if (view.running) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground whitespace-nowrap tabular-nums" role="status">
        <Icon name="clock" size={16} />
        {t("world.advance.running", { date: fmt(view.currentDate), target: fmt(view.target) })}
      </span>
    );
  }

  const choose = async (until: string) => {
    setOpen(false);
    await markReady(until);
  };

  const today = view.me.matchToday;
  if (today && !view.me.decision) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className={SECONDARY} onClick={() => void simulateToday()} disabled={busy}>
          {t("world.advance.simulate")}
        </button>
        {!today.humanOpponent && (
          <button type="button" className={PRIMARY} onClick={() => { window.location.href = "/match-preview"; }} disabled={busy}>
            <Icon name="play" size={16} />
            {t("world.advance.play")}
          </button>
        )}
      </div>
    );
  }

  if (view.me.readyUntil && view.me.readyUntil > view.currentDate) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
          {t("world.advance.readyUntil", { date: fmt(view.me.readyUntil) })}
          {view.waitingFor.length > 0 && <span className="text-muted-foreground"> · {t("world.advance.waiting", { count: view.waitingFor.length })}</span>}
        </span>
        <button
          type="button"
          className={`${SECONDARY} w-9 px-0 justify-center`}
          onClick={() => void markReady(null)}
          disabled={busy}
          title={t("world.advance.unmark")}
          aria-label={t("world.advance.unmark")}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" className={PRIMARY} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} disabled={busy}>
        {t("world.advance.readyButton")}
        <Icon name="chevron-down" size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-card p-2 shadow-sm flex flex-col gap-1">
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => void choose("tomorrow")}>{t("world.advance.readyTomorrow")}</button>
          <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => void choose("next_match")}>{t("world.advance.readyNextMatch")}</button>
          <label htmlFor="ready-until-date" className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground px-3 pt-2">
            {t("world.advance.readyDate")}
          </label>
          <div className="flex items-center gap-1 px-1">
            <input
              id="ready-until-date"
              type="date"
              min={addDays(view.currentDate, 1)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 flex-1 rounded border border-border bg-transparent px-2 text-sm"
            />
            <button type="button" className={SECONDARY} disabled={!date} onClick={() => void choose(date)}>{t("world.advance.readyConfirm")}</button>
          </div>
        </div>
      )}
      {error && <span className="sr-only" role="alert">{t(`world.advance.errors.${error}`, { defaultValue: t("world.advance.errors.generic") })}</span>}
    </div>
  );
}
