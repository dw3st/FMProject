import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { InboxScreen } from "@/GameInterface/InboxScreen";

function InboxPage() {
  return (
    <Layout>
      <InboxScreen />
    </Layout>
  );
}

createPage(InboxPage);
