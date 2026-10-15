import { useTranslation } from "react-i18next";
import { ChatWindow, useRoomTitle } from "@/GameInterface/Social/ChatWindow";
import { useSocial } from "@/GameInterface/Social/useSocial";

const BADGE =
  "min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-5 text-center tabular-nums";

function MinimizedTab({ room }: { room: string }) {
  const { t } = useTranslation();
  const s = useSocial();
  const title = useRoomTitle(room);
  const unread = s.unread[room] ?? 0;
  return (
    <button
      type="button"
      onClick={() => s.toggleChat(room)}
      aria-label={t("social.chat.minimizedTab", { name: title })}
      title={title}
      className="h-10 max-w-[180px] px-3 flex items-center gap-2 rounded-md border border-border bg-card text-sm font-semibold text-foreground cursor-pointer hover:border-primary/40"
    >
      <span className="truncate">{title}</span>
      {unread > 0 && <span className={BADGE}>{unread}</span>}
    </button>
  );
}

/** Chat windows above the status bar, left of the friends panel; minimized chats become tabs (Steam style). */
export function ChatDock() {
  const s = useSocial();
  if (s.dock.length === 0) return null;
  const open = s.dock.filter((c) => !c.minimized);
  const minimized = s.dock.filter((c) => c.minimized);
  return (
    <div className={`fixed bottom-14 ${s.panelOpen ? "right-[376px]" : "right-6"} z-40 flex items-end gap-3 pointer-events-none`}>
      {minimized.length > 0 && (
        <div className="pointer-events-auto flex flex-col gap-1">
          {minimized.map((c) => (
            <MinimizedTab key={c.room} room={c.room} />
          ))}
        </div>
      )}
      {open.map((c) => (
        <ChatWindow key={c.room} room={c.room} />
      ))}
    </div>
  );
}
