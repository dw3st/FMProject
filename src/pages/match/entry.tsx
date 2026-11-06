import { createPage } from "@/createPage";
import { MatchScreen } from "@/GameInterface/MatchScreen";
import { MatchSocial } from "@/GameInterface/Social/MatchSocial";
import { WatchWindowHost } from "@/GameInterface/Watch/WatchWindowHost";
import { interceptedTarget } from "@/GameInterface/router/appRoutes";
import { navigate } from "@/GameInterface/router/navigation";

function MatchPage() {
  return (
    <MatchSocial>
      <MatchScreen />
      {/* A friend's broadcast opens in the floating window here too (report): its pitch lives in an iframe. */}
      <WatchWindowHost />
    </MatchSocial>
  );
}

// Inside the game frame (spa-shell phase 2) a link to a frame screen changes the frame, not this iframe.
if (window.parent !== window) {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a");
    if (!a) return;
    const to = interceptedTarget(e, { href: a.href, target: a.target, hasDownload: a.hasAttribute("download") }, window.location.origin);
    if (!to) return;
    e.preventDefault();
    navigate(to);
  });
}

createPage(MatchPage);
