import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { DashboardScreen } from "@/GameInterface/DashboardScreen";

function DashboardPage() {
  return (
    <Layout>
      <DashboardScreen />
    </Layout>
  );
}

createPage(DashboardPage);
