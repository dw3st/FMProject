import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { FormationScreen } from "@/GameInterface/FormationScreen";

function FormationPage() {
  return (
    <Layout>
      <FormationScreen />
    </Layout>
  );
}

createPage(FormationPage);
