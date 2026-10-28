import type { LiveScoreView } from "@/types/rivalsTypes";
import { homeAwayOf } from "@/Domain/rivals/homeAway";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { resultLetter, scoreLineOf } from "@/Domain/rivals/results";
import { liveGroups } from "@/Domain/rivals/taunts";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { loadSession } from "@/GameInterface/gameSession";
import { Icon } from "@/GameInterface/Icons";
import { useRoomTitle } from "@/GameInterface/Social/ChatWindow";
import { TauntLine } from "@/GameInterface/Social/TauntLine";
import { useSocial } from "@/GameInterface/Social/useSocial";
import type { ChatPopup, RivalPopup } from "@/GameInterface/Social/socialState";
import { TauntActions } from "@/GameInterface/World/TauntActions";
import { H2HInvitePopup } from "@/GameInterface/H2H/H2HInvitePopup";

function PopupCard({ popup }: { popup: ChatPopup }) {
  const { t } = useTranslation();
  const s = useSocial();
  const title = useRoomTitle(popup.room);
  const world = popup.room.startsWith("world:");
  const open = () => {
    s.openChat(popup.room);
    s.dismissPopup(popup.room);
  };
  return (
    <div className="pointer-events-auto w-[300px] rounded-md border border-border bg-card shadow-lg flex items-start gap-2 p-3">
      <button
        type="button"
        onClick={open}
        aria-label={t("social.popup.open", { name: title })}
        className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name={world ? "globe" : "message-square"} size={16} className="shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
        <span className="mt-1 block text-sm text-muted-foreground line-clamp-2 break-words">
          {world ? <span className="font-semibold text-foreground">{popup.from}: </span> : null}
          {popup.taunt ? <TauntLine taunt={popup.taunt} /> : popup.body}
        </span>
      </button>
      <button
        type="button"
        onClick={() => s.dismissPopup(popup.room)}
        aria-label={t("social.popup.dismiss")}
        className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** "Getafe 1–2 Real Madrid": a friend's live game in home / away order. */
function liveScoreLine(l: LiveScoreView): string {
  const x = homeAwayOf(l);
  return `${x.homeName} ${x.home}–${x.away} ${x.awayName}`;
}

const RESULT_BORDER = { W: "border-primary", D: "border-muted-foreground", L: "border-destructive" } as const;

/** A friend's result or live goal, with the reactions and phrases to answer it in the league chat. */
function RivalPopupCard({ popup }: { popup: RivalPopup }) {
  const { t } = useTranslation();
  const s = useSocial();
  const saveId = loadSession()?.saveId ?? "";
  const r = popup.kind === "result" ? popup.result : null;
  const l = popup.kind === "goal" ? popup.live : null;
  const nickname = r?.nickname ?? l!.nickname;
  const clubId = r?.clubId ?? l!.clubId;
  const border = r ? RESULT_BORDER[resultLetter(r)] : "border-border";
  const text = r
    ? `${nickname} · ${scoreLineOf(r)}`
    : t("rivals.goalPopup", { nickname, score: liveScoreLine(l!), minute: l!.minute });
  return (
    <div className={`pointer-events-auto w-[300px] rounded-md border ${border} bg-card shadow-lg flex flex-col gap-2 p-3`}>
      <div className="flex items-start gap-2">
        <ClubLogo logoUrl={squadLogoUrl(clubId)} className="w-5 h-5 shrink-0" imgClassName="w-full h-full object-contain" />
        <span className="flex-1 min-w-0 text-sm text-foreground tabular-nums break-words">{text}</span>
        <button
          type="button"
          onClick={() => s.dismissRivalPopup(popup.key)}
          aria-label={t("social.popup.dismiss")}
          className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {saveId && (
        <TauntActions
          saveId={saveId}
          target={r ? { result: r.id } : { live: l!.seatId }}
          groups={r ? r.situations : liveGroups(l!)}
        />
      )}
    </div>
  );
}

/**
 * New messages of rooms not on screen and friends' results / live goals: cards above the status bar, on the left.
 * A message card opens the chat; a rival card answers with a reaction or a phrase.
 */
export function ChatPopups() {
  const s = useSocial();
  const invite = s.h2hPopup && !!s.h2hInvite;
  if (s.popups.length === 0 && s.rivalPopups.length === 0 && !invite) return null;
  // Read at render: popups arrive after the match screen has mounted its spot (it may still be loading at first).
  const anchor = document.getElementById(MATCH_POPUPS_ID);
  const cards = (
    <>
      {invite && <H2HInvitePopup />}
      {s.rivalPopups.map((p) => (
        <RivalPopupCard key={p.key} popup={p} />
      ))}
      {s.popups.map((p) => (
        <PopupCard key={p.room} popup={p} />
      ))}
    </>
  );
  if (anchor) {
    // In the live match only the head-to-head invite is a card: a friend's goal lights his line in the live strip and a
    // message lights the Friends button's badge, so nothing covers the pitch (report).
    if (!invite) return null;
    return createPortal(
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-2"><H2HInvitePopup /></div>,
      anchor,
    );
  }
  return (
    <div role="status" aria-live="polite" className="fixed bottom-14 left-6 z-50 flex flex-col gap-2 pointer-events-none">
      {cards}
    </div>
  );
}

/** Id of the live match's spot for the popups (under the friends' live strip). */
export const MATCH_POPUPS_ID = "match-popups";
