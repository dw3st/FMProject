import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { WorldScreen } from "@/GameInterface/World/WorldScreen";

function WorldPage() {
  return (
    <Layout>
      <WorldScreen />
    </Layout>
  );
}

createPage(WorldPage);
