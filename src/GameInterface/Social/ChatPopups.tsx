import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { useRoomTitle } from "@/GameInterface/Social/ChatWindow";
import { useSocial } from "@/GameInterface/Social/useSocial";
import type { ChatPopup } from "@/GameInterface/Social/socialState";

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
          {popup.body}
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

/** New messages of rooms not on screen: a card per room above the status bar, on the left; click opens the chat. */
export function ChatPopups() {
  const s = useSocial();
  if (s.popups.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-14 left-6 z-50 flex flex-col gap-2 pointer-events-none">
      {s.popups.map((p) => (
        <PopupCard key={p.room} popup={p} />
      ))}
    </div>
  );
}
