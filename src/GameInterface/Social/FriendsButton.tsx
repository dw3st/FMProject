import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { onlineFriendCount } from "@/GameInterface/Social/socialState";
import { useSocial } from "@/GameInterface/Social/useSocial";

/** The panel gives the focus back to this button when it closes. */
export const FRIENDS_BUTTON_ID = "social-friends-button";

const ITEM = "flex items-center gap-2 text-base text-muted-foreground tabular-nums";

/** Match toolbar look (`MatchScreen` header), next to "Substituições". */
const TOOLBAR =
  "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer whitespace-nowrap tabular-nums";

/**
 * "Amigos · 3" (friends online) with a badge of unread messages and pending requests: in the status
 * bar, or as a button of the live match toolbar (`variant="toolbar"`).
 */
export function FriendsButton({ variant = "bar" }: { variant?: "bar" | "toolbar" }) {
  const { t } = useTranslation();
  const s = useSocial();
  const count = onlineFriendCount(s.lists.friends);
  const badge = s.totalUnread + s.lists.incoming.length + s.worldInvites.length;
  const label = badge > 0 ? t("social.buttonUnread", { count, unread: badge }) : t("social.button", { count });
  return (
    <button
      type="button"
      id={FRIENDS_BUTTON_ID}
      onClick={() => s.setPanelOpen(!s.panelOpen)}
      aria-expanded={s.panelOpen}
      aria-label={label}
      title={label}
      className={
        variant === "toolbar"
          ? `${TOOLBAR} ${s.panelOpen ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border hover:border-primary/50 text-foreground"}`
          : `${ITEM} h-10 px-1 border-0 bg-transparent cursor-pointer hover:text-foreground whitespace-nowrap ${s.panelOpen ? "text-foreground" : ""}`
      }
    >
      <Icon name="users" size={variant === "toolbar" ? 16 : 18} />
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
