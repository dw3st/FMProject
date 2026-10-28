import { createPage } from "@/createPage";
import { StartScreen } from "@/GameInterface/StartScreen";
import { SocialProvider } from "@/GameInterface/Social/useSocial";
import { FriendsPanel } from "@/GameInterface/Social/FriendsPanel";
import { ChatDock } from "@/GameInterface/Social/ChatDock";
import { ChatPopups } from "@/GameInterface/Social/ChatPopups";

/** The start screen already has the friends panel and chat: league invites are accepted before any save is open. */
function StartPage() {
  return (
    <SocialProvider saveId={null}>
      <StartScreen />
      <FriendsPanel />
      <ChatDock />
      <ChatPopups />
    </SocialProvider>
  );
}

createPage(StartPage, { responsive: true });
