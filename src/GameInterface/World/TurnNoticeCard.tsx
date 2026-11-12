import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { navigate, useRoute } from "@/GameInterface/router/navigation";
import { formatGameDate } from "@/GameInterface/formatDate";
import type { GroupAdvanceView } from "@/types/groupAdvanceTypes";

/** The top bar's slot around "Pronto até" (Layout): the card hangs from it. */
export const READY_SLOT_ID = "fm-ready-slot";

/** How far from the card's right edge the arrow may sit: the card is at least this wide. */
const ARROW_MAX = 200;

/**
 * "Só falta você" hanging below the ready button, with an arrow to it and the button inside (tester report, 8.9.9,
 * option A). One row since 10.6.4 (tester report: the tall card covered the buttons under it); who is ready goes in the
 * `title`. Without the slot on the page (match preview, match, result: no top bar), nothing; it is looked for again on
 * every navigation (tester report, 10.7: the card stayed over the match preview).
 */
export function TurnNoticeCard({ view, myNickname, onClose }: { view: GroupAdvanceView | null; myNickname: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { markReady, busy } = useGroupAdvance();
  const matchToday = !!view?.me.matchToday && !view.me.decision;
  const [anchor, setAnchor] = useState<{ top: number; right: number; arrow: number } | null>(null);
  const route = useRoute();

  useLayoutEffect(() => {
    const place = () => {
      const r = document.getElementById(READY_SLOT_ID)?.getBoundingClientRect();
      if (!r || r.width === 0) { setAnchor(null); return; }
      const right = Math.max(8, window.innerWidth - r.right);
      const centerFromRight = window.innerWidth - (r.left + r.width / 2);
      setAnchor({ top: r.bottom + 8, right, arrow: Math.min(ARROW_MAX, Math.max(16, centerFromRight - right)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [route.key]);
  if (!anchor) return null;

  const others = (view?.members ?? []).filter((m) => m.nickname !== myNickname && m.status !== "no_club");
  const one = others.length === 1 && others[0]!.readyUntil ? others[0]! : null;
  const body = one
    ? t("world.advance.turn.oneReady", { name: one.nickname ?? one.managerName, date: formatGameDate(one.readyUntil!, i18n.language, "dayMonth") })
    : t("world.advance.turn.body");

  return (
    <div role="status" title={body} style={{ position: "fixed", top: anchor.top, right: anchor.right }} className="z-50">
      <span
        aria-hidden="true"
        style={{ right: anchor.arrow - 6 }}
        className="absolute -top-[6px] w-3 h-3 rotate-45 bg-card border-l border-t border-primary"
      />
      <div className="rounded-md border border-primary bg-card shadow-lg h-11 pl-3 pr-2 flex items-center gap-2 whitespace-nowrap">
        <Icon name="bell" size={16} className="shrink-0 text-primary" aria-hidden />
        <span className="font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground">{t("world.advance.turn.title")}</span>
        <span className="sr-only">{body}</span>
        {/* A game today to decide goes to its preview; otherwise ready until his next game (8.9.11: it opened a menu
            the top bar does not show on a match day). */}
        <Button
          className="h-8 px-3 ml-1"
          disabled={busy}
          title={t(matchToday ? "world.advance.turn.seeMatch" : "world.advance.turn.markReady")}
          onClick={() => {
            if (matchToday) navigate("/match-preview");
            else void markReady("next_match");
            onClose();
          }}
        >
          {t(matchToday ? "world.advance.turn.seeMatchShort" : "world.advance.turn.markReadyShort")}
        </Button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("social.popup.dismiss")}
          title={t("social.popup.dismiss")}
          className="shrink-0 w-8 h-8 flex items-center justify-center bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
