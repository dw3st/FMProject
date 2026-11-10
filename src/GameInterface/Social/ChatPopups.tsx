import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { resultLetter } from "@/Domain/rivals/results";
import { competitionName } from "@/Domain/world/labels";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
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

const RESULT_BAR = { W: "bg-primary", D: "bg-muted-foreground", L: "bg-destructive" } as const;
const RESULT_TEXT = { W: "text-primary", D: "text-foreground", L: "text-destructive" } as const;
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/**
 * A friend's result or live goal, with the reactions and phrases to answer it in the league chat. Centred under the top
 * bar since 8.9.12 (tester report, option B): competition, the two clubs in home / away order and the score in the middle.
 */
function RivalPopupCard({ popup }: { popup: RivalPopup }) {
  const { t, i18n } = useTranslation();
  const s = useSocial();
  const leagues = useLeagueCatalog();
  const saveId = loadSession()?.saveId ?? "";
  const r = popup.kind === "result" ? popup.result : null;
  const l = popup.kind === "goal" ? popup.live : null;
  const nickname = r?.nickname ?? l!.nickname;
  const clubId = r?.clubId ?? l!.clubId;
  const letter = r ? resultLetter(r) : null;
  const side = r ?? l!;
  const homeName = side.home ? side.clubName : side.opponentName;
  const awayName = side.home ? side.opponentName : side.clubName;
  const homeGoals = side.home ? side.score.for : side.score.against;
  const awayGoals = side.home ? side.score.against : side.score.for;
  const friendTone = letter ? RESULT_TEXT[letter] : "text-foreground";
  const competition = r?.competition ?? l?.competition;
  return (
    <div className="pointer-events-auto w-[420px] max-w-[calc(100vw-32px)] rounded-md border border-border bg-card shadow-lg flex overflow-hidden">
      <span className={`w-1 shrink-0 ${letter ? RESULT_BAR[letter] : "bg-destructive animate-pulse"}`} aria-hidden="true" />
      <div className="flex-1 min-w-0 flex flex-col gap-2.5 p-3.5">
        <div className="flex items-center gap-2">
          <span className={`flex-1 min-w-0 truncate ${LABEL}`}>
            {r ? t("rivals.popup.result") : t("rivals.popup.goal", { minute: l!.minute })}
          </span>
          <button
            type="button"
            onClick={() => s.dismissRivalPopup(popup.key)}
            aria-label={t("social.popup.dismiss")}
            className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <ClubLogo logoUrl={squadLogoUrl(clubId)} className="w-10 h-10 shrink-0" imgClassName="w-full h-full object-contain" />
          <span className="min-w-0">
            <span className="block font-semibold text-foreground truncate">{nickname}</span>
            {competition && <span className="block text-sm text-muted-foreground truncate">{competitionName(competition, leagues, i18n.language)}</span>}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className={`min-w-0 truncate font-semibold ${side.home ? friendTone : "text-foreground"}`}>{homeName}</span>
          <span className="font-display font-bold text-2xl leading-none tabular-nums text-foreground">{homeGoals} – {awayGoals}</span>
          <span className={`min-w-0 truncate font-semibold text-right ${side.home ? "text-foreground" : friendTone}`}>{awayName}</span>
        </div>
        {saveId && (
          <TauntActions
            saveId={saveId}
            target={r ? { result: r.id } : { live: l!.seatId }}
            groups={r ? r.situations : liveGroups(l!)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * New messages of rooms not on screen: cards above the status bar, on the left. Friends' results / live goals: centred under
 * the top bar (8.9.12).
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
    <>
      {s.rivalPopups.length > 0 && (
        <div role="status" aria-live="polite" className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
          {s.rivalPopups.map((p) => <RivalPopupCard key={p.key} popup={p} />)}
        </div>
      )}
      {(invite || s.popups.length > 0) && (
        <div role="status" aria-live="polite" className="fixed bottom-14 left-6 z-50 flex flex-col gap-2 pointer-events-none">
          {cards}
        </div>
      )}
    </>
  );
}

/** Id of the live match's spot for the popups (under the friends' live strip). */
export const MATCH_POPUPS_ID = "match-popups";
