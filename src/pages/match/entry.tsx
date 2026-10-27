import { createPage } from "@/createPage";
import { MatchScreen } from "@/GameInterface/MatchScreen";
import { MatchSocial } from "@/GameInterface/Social/MatchSocial";

function MatchPage() {
  return (
    <MatchSocial>
      <MatchScreen />
    </MatchSocial>
  );
}

createPage(MatchPage);
