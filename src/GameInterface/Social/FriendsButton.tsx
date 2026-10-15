import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { onlineFriendCount } from "@/GameInterface/Social/socialState";
import { useSocial } from "@/GameInterface/Social/useSocial";

/** The panel gives the focus back to this button when it closes. */
export const FRIENDS_BUTTON_ID = "social-friends-button";

const ITEM = "flex items-center gap-2 text-base text-muted-foreground tabular-nums";

/** "Amigos · 3" in the status bar (friends online), with a badge of unread messages and pending requests. */
export function FriendsButton() {
  const { t } = useTranslation();
  const s = useSocial();
  const count = onlineFriendCount(s.lists.friends);
  const badge = s.totalUnread + s.lists.incoming.length;
  const label = badge > 0 ? t("social.buttonUnread", { count, unread: badge }) : t("social.button", { count });
  return (
    <button
      type="button"
      id={FRIENDS_BUTTON_ID}
      onClick={() => s.setPanelOpen(!s.panelOpen)}
      aria-expanded={s.panelOpen}
      aria-label={label}
      title={label}
      className={`${ITEM} h-10 px-1 border-0 bg-transparent cursor-pointer hover:text-foreground whitespace-nowrap ${s.panelOpen ? "text-foreground" : ""}`}
    >
      <Icon name="users" size={18} />
      {t("social.buttonShort", { count })}
      {badge > 0 && (
        <span
          className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-5 text-center tabular-nums"
          aria-hidden="true"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
