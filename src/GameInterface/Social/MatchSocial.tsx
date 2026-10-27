import { useState, type ReactNode } from "react";
import { loadSession } from "@/GameInterface/gameSession";
import { SocialProvider } from "@/GameInterface/Social/useSocial";
import { FriendsButton } from "@/GameInterface/Social/FriendsButton";
import { FriendsPanel } from "@/GameInterface/Social/FriendsPanel";
import { ChatDock } from "@/GameInterface/Social/ChatDock";
import { ChatPopups } from "@/GameInterface/Social/ChatPopups";

/**
 * Friends and chat on the live match, which has no status bar: the "Amigos" button floats at the
 * bottom right and opens the same panel and chat windows as the other screens.
 */
export function MatchSocial({ children }: { children: ReactNode }) {
  const [session] = useState(() => loadSession());
  return (
    <SocialProvider saveId={session?.saveId ?? null} seatId={session?.seatId ?? null}>
      {children}
      <div className="fixed bottom-3 right-6 z-40 rounded-md border border-border bg-card px-2">
        <FriendsButton />
      </div>
      <FriendsPanel />
      <ChatDock />
      <ChatPopups />
    </SocialProvider>
  );
}
