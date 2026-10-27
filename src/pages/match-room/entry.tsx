import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { MatchRoomScreen } from "@/GameInterface/H2H/MatchRoomScreen";

function MatchRoomPage() {
  return (
    <Layout>
      <MatchRoomScreen />
    </Layout>
  );
}

createPage(MatchRoomPage);
