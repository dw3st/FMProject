import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { ScoutScreen } from "@/GameInterface/ScoutScreen";

function ScoutPage() {
  return (
    <Layout>
      <ScoutScreen />
    </Layout>
  );
}

createPage(ScoutPage);
