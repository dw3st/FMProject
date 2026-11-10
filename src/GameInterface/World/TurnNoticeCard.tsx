import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { GroupAdvanceView } from "@/types/groupAdvanceTypes";

/** The top bar's slot around "Pronto até" (Layout): the card hangs from it. */
export const READY_SLOT_ID = "fm-ready-slot";
/** Asks the ready control to open its menu. */
export const OPEN_READY_EVENT = "fm:open-ready";

const WIDTH = 320;

/**
 * "Só falta você" hanging below the ready button, with an arrow to it and the button inside (tester report, 8.9.9,
 * option A). Without the slot on the page (match screen), nothing.
 */
export function TurnNoticeCard({ view, myNickname, onClose }: { view: GroupAdvanceView | null; myNickname: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [anchor, setAnchor] = useState<{ top: number; right: number; arrow: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const r = document.getElementById(READY_SLOT_ID)?.getBoundingClientRect();
      if (!r || r.width === 0) { setAnchor(null); return; }
      const right = Math.max(8, window.innerWidth - r.right);
      const centerFromRight = window.innerWidth - (r.left + r.width / 2);
      setAnchor({ top: r.bottom + 10, right, arrow: Math.min(WIDTH - 24, Math.max(16, centerFromRight - right)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  if (!anchor) return null;

  const others = (view?.members ?? []).filter((m) => m.nickname !== myNickname && m.status !== "no_club");
  const one = others.length === 1 && others[0]!.readyUntil ? others[0]! : null;
  const body = one
    ? t("world.advance.turn.oneReady", { name: one.nickname ?? one.managerName, date: formatGameDate(one.readyUntil!, i18n.language, "dayMonth") })
    : t("world.advance.turn.body");

  return (
    <div role="status" style={{ position: "fixed", top: anchor.top, right: anchor.right, width: WIDTH }} className="z-50">
      <span
        aria-hidden="true"
        style={{ right: anchor.arrow - 7 }}
        className="absolute -top-[7px] w-3.5 h-3.5 rotate-45 bg-card border-l border-t border-primary"
      />
      <div className="rounded-md border border-primary bg-card shadow-lg p-4 flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
          <Icon name="bell" size={18} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="font-display font-black uppercase text-xl leading-none text-foreground">{t("world.advance.turn.title")}</span>
          <span className="text-sm text-muted-foreground">{body}</span>
          <Button
            className="h-9 self-start mt-2"
            onClick={() => { window.dispatchEvent(new Event(OPEN_READY_EVENT)); onClose(); }}
          >
            {t("world.advance.turn.markReady")}
          </Button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("social.popup.dismiss")}
          className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
