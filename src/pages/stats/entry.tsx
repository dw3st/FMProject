import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { StatsScreen } from "@/GameInterface/StatsScreen";

function StatsPage() {
  return (
    <Layout>
      <StatsScreen />
    </Layout>
  );
}

createPage(StatsPage);
