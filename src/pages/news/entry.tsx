import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { NewsScreen } from "@/GameInterface/News/NewsScreen";

function NewsPage() {
  return (
    <Layout>
      <NewsScreen />
    </Layout>
  );
}

createPage(NewsPage);
