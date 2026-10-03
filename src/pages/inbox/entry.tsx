import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { InboxScreen } from "@/GameInterface/InboxScreen";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";

function InboxPage() {
  return (
    <Layout>
      <ScreenContainer fill>
        <InboxScreen />
      </ScreenContainer>
    </Layout>
  );
}

createPage(InboxPage);
