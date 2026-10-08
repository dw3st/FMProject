import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { ClubScreen } from "@/GameInterface/ClubScreen";

function ClubPage() {
  return (
    <Layout>
      <ClubScreen />
    </Layout>
  );
}

createPage(ClubPage);
