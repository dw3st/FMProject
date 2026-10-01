import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { StaffScreen } from "@/GameInterface/StaffScreen";

function StaffPage() {
  return (
    <Layout>
      <StaffScreen />
    </Layout>
  );
}

createPage(StaffPage);
