import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { PlayerScreen } from "@/GameInterface/PlayerScreen";

function PlayerPage() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const league = segments[1]!;
  const club = segments[2]!;
  const playerId = segments[3]!;

  return (
    <Layout>
      <PlayerScreen league={league} club={club} playerId={playerId} />
    </Layout>
  );
}

createPage(PlayerPage);
