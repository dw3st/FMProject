import { useState, type ReactNode } from "react";
import { loadSession } from "@/GameInterface/gameSession";
import { SocialProvider } from "@/GameInterface/Social/useSocial";
import { FriendsPanel } from "@/GameInterface/Social/FriendsPanel";
import { ChatDock } from "@/GameInterface/Social/ChatDock";
import { ChatPopups } from "@/GameInterface/Social/ChatPopups";
import { frameRadioSlot, OPEN_CHAT_MESSAGE } from "@/GameInterface/World/frameHost";

/** Inside the frame, a chat opens in the frame's own chat windows (the footer has the friends). */
const openInFrame = (room: string) => window.parent.postMessage({ type: OPEN_CHAT_MESSAGE, room }, window.location.origin);

/**
 * Friends and chat on the live match, which has no status bar: the "Amigos" button sits in the
 * match toolbar (`MatchScreen`) and opens the same panel and chat windows as the other screens.
 */
export function MatchSocial({ children }: { children: ReactNode }) {
  const [session] = useState(() => loadSession());
  // Inside the game frame the footer has the friends and the chat: only the popups over the pitch stay here (8.8.10).
  const [inFrame] = useState(() => frameRadioSlot() !== null);
  return (
    <SocialProvider saveId={session?.saveId ?? null} seatId={session?.seatId ?? null} hostOpenChat={inFrame ? openInFrame : undefined}>
      {children}
      {!inFrame && <FriendsPanel />}
      {!inFrame && <ChatDock />}
      <ChatPopups />
    </SocialProvider>
  );
}
