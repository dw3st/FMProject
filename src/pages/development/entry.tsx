import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { DevelopmentScreen } from "@/GameInterface/DevelopmentScreen";

function DevelopmentPage() {
  return (
    <Layout>
      <DevelopmentScreen />
    </Layout>
  );
}

createPage(DevelopmentPage);
