import { createPage } from "@/createPage";
import { MatchScreen } from "@/GameInterface/MatchScreen";
import { MatchSocial } from "@/GameInterface/Social/MatchSocial";
import { WatchWindowHost } from "@/GameInterface/Watch/WatchWindowHost";

function MatchPage() {
  return (
    <MatchSocial>
      <MatchScreen />
      {/* A friend's broadcast opens in the floating window here too (report): its pitch lives in an iframe. */}
      <WatchWindowHost />
    </MatchSocial>
  );
}

createPage(MatchPage);
