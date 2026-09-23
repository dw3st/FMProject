import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { TransfersScreen } from "@/GameInterface/TransfersScreen";

function TransfersPage() {
  return (
    <Layout>
      <TransfersScreen />
    </Layout>
  );
}

createPage(TransfersPage);
