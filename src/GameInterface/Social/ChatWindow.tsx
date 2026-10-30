import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SOCIAL } from "@/Domain/social/socialConfig";
import { Icon } from "@/GameInterface/Icons";
import { TauntLine } from "@/GameInterface/Social/TauntLine";
import { worldRoomLabel } from "@/GameInterface/Social/socialState";
import { EmojiPicker } from "@/GameInterface/Social/EmojiPicker";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { Button } from "@/GameInterface/ui/Button";
import { FloatingWindow } from "@/GameInterface/ui/FloatingWindow";
import type { FloatRect, Size } from "@/GameInterface/ui/windowGeometry";
import type { FriendStatus, SocialErrorCode } from "@/types/socialTypes";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent";
const DOT: Record<FriendStatus, string> = {
  playing: "bg-primary",
  online: "bg-chart-2",
  offline: "bg-muted-foreground/50",
};

/** Title of a room as the screens show it: the friend's nickname or "<owner>'s league". */
export function useRoomTitle(room: string): string {
  const { t } = useTranslation();
  const { lists } = useSocial();
  if (room.startsWith("dm:")) return room.slice(3);
  return worldRoomLabel(room, lists.worlds, (owner) => t("world.leagueOf", { owner }), t("world.public.name")) ?? t("social.chat.world");
}

const CHAT_MIN: Size = { w: 280, h: 300 };
const CHAT_MAX: Size = { w: 720, h: 1000 };
const CHAT_W = 330;
const CHAT_GAP = 12;

/**
 * First spot of a chat in a tab: above the status bar, left of the friends panel (when it is open), the `slot`-th
 * from the right.
 */
export function chatDefaultRect(v: Size, slot: number, panelOpen: boolean): FloatRect {
  const h = Math.min(540, Math.round(v.h * 0.75));
  const right = v.w - 24 - (panelOpen ? 440 + CHAT_GAP : 0);
  return { x: right - (slot + 1) * CHAT_W - slot * CHAT_GAP, y: v.h - 56 - h, w: CHAT_W, h };
}

export function ChatWindow({ room, slot = 0 }: { room: string; slot?: number }) {
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { loadMessages, markRoomRead } = s;
  const panelOpen = s.panelOpen;
  const defaultRect = (v: Size) => chatDefaultRect(v, slot, panelOpen);

  const friend = room.startsWith("dm:") ? s.lists.friends.find((f) => f.nickname === room.slice(3)) : undefined;
  const publicRoom = s.lists.worlds.some((w) => w.room === room && w.public);
  const canWrite = !publicRoom && (room.startsWith("world:") || friend !== undefined);
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

  /** Puts the emoji where the cursor is (or at the end) and gives the focus back to the box. */
  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const length = [...text].length;
  const time = (at: number) => new Date(at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <FloatingWindow
      id={`chat:${room}`}
      role="region"
      ariaLabel={title}
      defaultRect={defaultRect}
      min={CHAT_MIN}
      max={CHAT_MAX}
      dockedHeight={480}
      onClose={() => s.closeChat(room)}
      header={
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
      }
    >

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
                  {m.taunt ? <TauntLine taunt={m.taunt} /> : m.body}
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
              ref={inputRef}
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
              <div className="flex items-center gap-1">
                <EmojiPicker onPick={insertEmoji} disabled={sending} />
                <span className={`text-sm tabular-nums ${length > SOCIAL.MESSAGE_MAX ? "text-destructive" : "text-muted-foreground"}`}>
                  {t("social.chat.counter", { count: length, max: SOCIAL.MESSAGE_MAX })}
                </span>
              </div>
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
          <p className="text-sm text-muted-foreground">{t(publicRoom ? "social.publicRoom" : "social.chat.readOnly")}</p>
        )}
      </div>
    </FloatingWindow>
  );
}
