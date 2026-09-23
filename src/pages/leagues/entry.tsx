import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { LeagueTableScreen } from "@/GameInterface/LeagueTableScreen";

function LeaguesPage() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const leagueSlug = segments[1];

  return (
    <Layout>
      <LeagueTableScreen leagueSlug={leagueSlug} />
    </Layout>
  );
}

createPage(LeaguesPage);
