import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { SeasonEndScreen } from "@/GameInterface/SeasonEndScreen";

function SeasonEndPage() {
  return (
    <Layout>
      <SeasonEndScreen />
    </Layout>
  );
}

createPage(SeasonEndPage);
