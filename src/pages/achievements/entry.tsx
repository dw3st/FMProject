import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { AchievementsScreen } from "@/GameInterface/Achievements/AchievementsScreen";

function AchievementsPage() {
  return (
    <Layout>
      <AchievementsScreen />
    </Layout>
  );
}

createPage(AchievementsPage);
