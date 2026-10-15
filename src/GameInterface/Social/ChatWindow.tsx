import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SOCIAL } from "@/Domain/social/socialConfig";
import { Icon } from "@/GameInterface/Icons";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { Button } from "@/GameInterface/ui/Button";
import type { FriendStatus, SocialErrorCode } from "@/types/socialTypes";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent";
const DOT: Record<FriendStatus, string> = {
  playing: "bg-primary",
  online: "bg-chart-2",
  offline: "bg-muted-foreground/50",
};

/** Title of a room as the screens show it: the friend's nickname or the world's name. */
export function useRoomTitle(room: string): string {
  const { t } = useTranslation();
  const { lists } = useSocial();
  if (room.startsWith("dm:")) return room.slice(3);
  return lists.worlds.find((w) => w.room === room)?.name || t("social.chat.world");
}

export function ChatWindow({ room }: { room: string }) {
  const { t, i18n } = useTranslation();
  const s = useSocial();
  const title = useRoomTitle(room);
  const msgs = s.messages[room];
  const loadError = s.roomErrors[room];
  const [text, setText] = useState("");
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const { loadMessages, markRoomRead } = s;

  const friend = room.startsWith("dm:") ? s.lists.friends.find((f) => f.nickname === room.slice(3)) : undefined;
  const canWrite = room.startsWith("world:") || friend !== undefined;
  const typing = s.typing[room];
  const showTyping = typing !== undefined && now - typing.at < SOCIAL.TYPING_SHOW_MS;

  // Every time the window opens (mount): the newest page, merged with what is already here (spec §3).
  useEffect(() => {
    void loadMessages(room, false);
  }, [room, loadMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (msgs && msgs.length > 0 && !document.hidden) markRoomRead(room);
  }, [room, msgs?.length, markRoomRead]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!typing) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [typing]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    const err = await s.send(room, text);
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setText("");
    setError(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const length = [...text].length;
  const time = (at: number) => new Date(at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <section
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // the friends panel also closes on Escape: only this window closes
        s.closeChat(room);
      }}
      className="pointer-events-auto w-[300px] h-[420px] flex flex-col rounded-md border border-border bg-card"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        {friend && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[friend.status]}`} aria-hidden="true" />}
        {!friend && room.startsWith("world:") && <Icon name="globe" size={16} className="text-muted-foreground" />}
        <span className="font-semibold text-foreground truncate flex-1">{title}</span>
        <button type="button" className={ICON_BUTTON} onClick={() => s.toggleChat(room)} aria-label={t("social.chat.minimize")} title={t("social.chat.minimize")}>
          <Icon name="minus" size={16} />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={() => s.closeChat(room)} aria-label={t("social.chat.close")} title={t("social.chat.close")}>
          <Icon name="close" size={16} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {loadError && !msgs ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">{t("social.chat.unavailable")}</p>
            <Button variant="secondary" flush onClick={() => void loadMessages(room, false)}>
              {t("social.chat.retry")}
            </Button>
          </div>
        ) : !msgs ? (
          <p className="text-sm text-muted-foreground">{t("social.loading")}</p>
        ) : (
          <>
            {s.hasMore[room] && (
              <Button variant="secondary" flush className="self-center" onClick={() => void loadMessages(room, true)}>
                {t("social.chat.loadMore")}
              </Button>
            )}
            {msgs.length === 0 && <p className="text-sm text-muted-foreground">{t("social.chat.empty")}</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col max-w-[85%] ${m.mine ? "self-end items-end" : "self-start items-start"}`}>
                <div className={`rounded-md px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${m.mine ? "bg-primary/15 text-foreground" : "bg-secondary/40 text-foreground"}`}>
                  {room.startsWith("world:") && !m.mine && <span className="block font-semibold">{m.from}</span>}
                  {m.body}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">{time(m.at)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {showTyping && (
        <p className="px-3 text-sm text-muted-foreground">{t("social.chat.typing", { nickname: typing!.from })}</p>
      )}

      <div className="border-t border-border px-3 py-2 flex flex-col gap-1">
        {canWrite ? (
          <>
            <textarea
              aria-label={t("social.chat.placeholder")}
              placeholder={t("social.chat.placeholder")}
              rows={2}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) s.sendTyping(room);
              }}
              onKeyDown={onKeyDown}
              className="w-full resize-none rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm tabular-nums ${length > SOCIAL.MESSAGE_MAX ? "text-destructive" : "text-muted-foreground"}`}>
                {t("social.chat.counter", { count: length, max: SOCIAL.MESSAGE_MAX })}
              </span>
              <Button onClick={() => void submit()} disabled={sending || !text.trim() || length > SOCIAL.MESSAGE_MAX}>
                <Icon name="send" size={16} />
                {t("social.chat.send")}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t(`social.errors.${error}`)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("social.chat.readOnly")}</p>
        )}
      </div>
    </section>
  );
}
