import { createPage } from "@/createPage";
import { TestScreen } from "@/GameInterface/TestScreen";
import { LabNav } from "@/lab/components/LabNav";
import { SendToPromoButton } from "@/lab/components/SendToPromoButton";

function TestPage() {
  return (
    <>
      <LabNav />
      <SendToPromoButton />
      <TestScreen />
    </>
  );
}

// Lab tool — no auth required. TestScreen doesn't read game saves.
createPage(TestPage, { public: true });
