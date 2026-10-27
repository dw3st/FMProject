import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** The emojis of the chat picker: common reactions plus a few football ones. */
export const CHAT_EMOJIS = [
  "😀", "😂", "🤣", "😅", "😎", "😍", "🤔", "😮",
  "😱", "😢", "😭", "😡", "🤬", "🙄", "😴", "🥳",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👀",
  "🔥", "💯", "❤️", "💔", "⚽", "🥅", "🏆", "🎉",
  "🟨", "🟥",
] as const;

/** Smile button next to the chat box: a small grid of emojis that inserts the chosen one (`onPick`). */
export function EmojiPicker({ onPick, disabled }: { onPick: (emoji: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation(); // only the picker closes, not the chat window
        setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("social.chat.emoji")}
        title={t("social.chat.emoji")}
        className="w-10 h-10 flex items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
      >
        <Icon name="face-content" size={18} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t("social.chat.emoji")}
          className="absolute bottom-full left-0 mb-2 z-10 w-[264px] grid grid-cols-8 gap-0.5 rounded-md border border-border bg-card p-2 shadow-sm"
        >
          {CHAT_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => { onPick(e); setOpen(false); }}
              className="w-8 h-8 flex items-center justify-center rounded border-0 bg-transparent text-xl leading-none cursor-pointer hover:bg-secondary/40"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
