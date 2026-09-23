import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { SquadScreen } from "@/GameInterface/SquadScreen";

function SquadPage() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const league = segments[1]!;
  const club = segments[2]!;

  return (
    <Layout>
      <SquadScreen league={league} club={club} />
    </Layout>
  );
}

createPage(SquadPage);
