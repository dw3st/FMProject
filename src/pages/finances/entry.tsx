import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { FinancesScreen } from "@/GameInterface/FinancesScreen";

function FinancesPage() {
  return (
    <Layout>
      <FinancesScreen />
    </Layout>
  );
}

createPage(FinancesPage);
