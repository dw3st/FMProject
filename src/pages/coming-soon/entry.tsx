import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { ComingSoonScreen } from "@/GameInterface/ComingSoonScreen";

function ComingSoonPage() {
  return (
    <Layout>
      <ComingSoonScreen />
    </Layout>
  );
}

createPage(ComingSoonPage);
