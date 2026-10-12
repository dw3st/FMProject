import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { NationalScreen } from "@/GameInterface/National/NationalScreen";

function NationalPage() {
  return (
    <Layout>
      <NationalScreen />
    </Layout>
  );
}

createPage(NationalPage);
