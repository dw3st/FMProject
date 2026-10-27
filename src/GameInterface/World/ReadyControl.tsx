import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { formatGameDate } from "@/GameInterface/formatDate";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { addDays, isRealIsoDate } from "@/Domain/dates";
import { readyBranch } from "@/GameInterface/World/groupAdvanceText";
import { brasiliaTime } from "@/GameInterface/World/publicTime";
import { nextSlotAt } from "@/Domain/multiplayer/publicWorld";

const PRIMARY = "flex items-center gap-1 h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 whitespace-nowrap shrink-0";
const SECONDARY = "flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0";
const ICON_ONLY = "flex items-center justify-center w-9 h-9 rounded-md border border-border bg-card text-foreground cursor-pointer hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0";
const MENU_ITEM = "w-full text-left h-10 px-3 rounded text-sm font-semibold text-foreground hover:bg-secondary/40 cursor-pointer bg-transparent border-0";
// Every state fits the top bar's fixed 184px slot (`TopNavigation`): status texts truncate, the full text is in `title`.
const LABEL_TRUNC = "max-w-[140px] truncate";
const RUNNING_TRUNC = "max-w-[184px] truncate";
const MENU_ID = "ready-until-panel";

/**
 * The day block's action in a group world (`.claude/rules/game/multiplayer.md`, part 3). `publicWorld` (from the save)
 * shows the next step's time while the advance view is still loading.
 */
export function ReadyControl({ publicWorld = false }: { publicWorld?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const { view, busy, error, markReady, simulateToday, undoSimulate } = useGroupAdvance();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const fmt = (d: string | null) => (d ? formatGameDate(d, i18n.language, "dayMonth") : "—");

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setDate("");
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open || !pos) return;
    firstRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos !== null]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    const onClick = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!triggerRef.current?.contains(n) && !panelRef.current?.contains(n)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close, place]);

  const errorText = error ? t(`world.advance.errors.${error}`, { defaultValue: t("world.advance.errors.generic") }) : null;
  // Shrinks first in the top bar's fixed slot: the action buttons keep their width.
  const errorLine = errorText && <span className="min-w-0 text-sm text-destructive whitespace-nowrap max-w-[220px] truncate" role="alert" title={errorText}>{errorText}</span>;

  const { branch, canPlay } = readyBranch(view);
  const unmarkButton = (
    <button
      type="button"
      className={ICON_ONLY}
      onClick={() => void markReady(null)}
      disabled={busy}
      title={t("world.advance.unmark")}
      aria-label={t("world.advance.unmark")}
    >
      <Icon name="close" size={16} />
    </button>
  );

  const isPublic = view ? view.kind === "public" : publicWorld;
  if (!isPublic && (!view || branch === "disabled")) {
    return (
      <div className="flex items-center gap-2">
        {errorLine}
        <button type="button" className={PRIMARY} disabled>
          {t("world.advance.readyButton")}
          <Icon name="chevron-down" size={16} />
        </button>
      </div>
    );
  }

  if (view && branch === "running") {
    const text = t("world.advance.running", { date: fmt(view.currentDate), target: fmt(view.target) });
    const short = t("world.advance.runningShort", { date: fmt(view.currentDate), target: fmt(view.target) });
    return (
      <span className={`flex items-center gap-1.5 text-sm font-semibold text-muted-foreground whitespace-nowrap tabular-nums ${RUNNING_TRUNC}`} role="status" title={text} aria-label={text}>
        <Icon name="clock" size={16} className="shrink-0" />
        <span className="truncate" aria-hidden="true">{short}</span>
      </span>
    );
  }

  // The public world (part 5b): before the view loads, the time of the next fixed step (Brasília). Once loaded it uses
  // "Ready until" like a friends' league: everyone active ready = the next step starts early; the slots still step.
  const nextStepText = isPublic
    ? t("world.public.nextStep", { time: brasiliaTime(view?.nextSlotAt ?? nextSlotAt(Date.now()), i18n.language) })
    : "";
  if (isPublic && !view) {
    const time = brasiliaTime(nextSlotAt(Date.now()), i18n.language);
    return (
      <div className="flex items-center gap-2">
        {errorLine}
        <span className={`flex items-center gap-1.5 text-sm font-semibold text-muted-foreground whitespace-nowrap tabular-nums ${RUNNING_TRUNC}`} role="status" title={nextStepText} aria-label={nextStepText}>
          <Icon name="clock" size={16} className="shrink-0" />
          <span className="truncate" aria-hidden="true">{t("world.public.nextStepShort", { time })}</span>
        </span>
      </div>
    );
  }
  if (!view) return null;

  const minDate = addDays(view.currentDate, 1);
  const dateValid = isRealIsoDate(date) && date >= minDate;
  const dateInvalid = date !== "" && !dateValid;

  const choose = async (until: string) => {
    if (until !== "tomorrow" && until !== "next_match" && !(isRealIsoDate(until) && until >= minDate)) return;
    close(true);
    await markReady(until);
  };

  const today = view.me.matchToday;
  if (branch === "match" && today) {
    return (
      <div className="flex items-center gap-2">
        {errorLine}
        <button
          type="button"
          className={SECONDARY}
          onClick={() => void simulateToday()}
          disabled={busy}
          title={t("world.advance.simulateHint")}
          aria-label={t("world.advance.simulateHint")}
        >
          {t("world.advance.simulate")}
        </button>
        {canPlay && (
          <button type="button" className={PRIMARY} onClick={() => { window.location.href = "/match-preview"; }} disabled={busy}>
            <Icon name="play" size={16} />
            {t("world.advance.play")}
          </button>
        )}
        {/* No "not ready" here: an undecided match day already holds the world (it comes back once decided). */}
      </div>
    );
  }

  // Today's game set to "Simulate" and the day not run yet: say so, with an undo that brings Play back.
  const decided = view.me.decision;
  if (today && decided?.mode === "simulate" && decided.date === view.currentDate) {
    const text = t("world.advance.simulated");
    return (
      <div className="flex items-center gap-2">
        {errorLine}
        <span className={`text-sm font-semibold whitespace-nowrap ${LABEL_TRUNC}`} title={t("world.advance.simulatedHint")}>{text}</span>
        <button
          type="button"
          className={ICON_ONLY}
          onClick={() => void undoSimulate()}
          disabled={busy}
          title={t("world.advance.undoSimulate")}
          aria-label={t("world.advance.undoSimulate")}
        >
          <Icon name="rotate-ccw" size={16} />
        </button>
      </div>
    );
  }

  if (branch === "ready" && view.me.readyUntil) {
    const text = t("world.advance.readyUntil", { date: fmt(view.me.readyUntil) });
    const waiting = [
      view.waitingFor.length > 0 ? t("world.advance.waiting", { count: view.waitingFor.length }) : "",
      nextStepText,
    ].filter(Boolean).join(" · ");
    return (
      <div className="flex items-center gap-2">
        {errorLine}
        <span className={`text-sm font-semibold whitespace-nowrap tabular-nums ${LABEL_TRUNC}`} title={waiting ? `${text} · ${waiting}` : text}>
          {text}
        </span>
        {unmarkButton}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {errorLine}
      <button
        ref={triggerRef}
        type="button"
        className={PRIMARY}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={MENU_ID}
        disabled={busy}
      >
        {t("world.advance.readyButton")}
        <Icon name="chevron-down" size={16} />
      </button>
      {open && pos && createPortal(
        <div
          id={MENU_ID}
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-[60] w-64 rounded-md border border-border bg-card p-2 shadow-sm flex flex-col gap-1"
        >
          <button ref={firstRef} type="button" className={MENU_ITEM} onClick={() => void choose("tomorrow")}>{t("world.advance.readyTomorrow")}</button>
          <button type="button" className={MENU_ITEM} onClick={() => void choose("next_match")}>{t("world.advance.readyNextMatch")}</button>
          <label htmlFor="ready-until-date" className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground px-3 pt-2">
            {t("world.advance.readyDate")}
          </label>
          <div className="flex items-center gap-1 px-1">
            <input
              id="ready-until-date"
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateInvalid}
              aria-describedby={dateInvalid ? "ready-until-date-error" : undefined}
              className="h-10 flex-1 min-w-0 rounded border border-border bg-transparent px-2 text-sm"
            />
            <button type="button" className={SECONDARY} disabled={!dateValid} onClick={() => void choose(date)}>{t("world.advance.readyConfirm")}</button>
          </div>
          {dateInvalid && (
            <p id="ready-until-date-error" className="text-sm text-destructive px-3 m-0" role="alert">
              {t("world.advance.dateInvalid", { min: fmt(minDate) })}
            </p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
