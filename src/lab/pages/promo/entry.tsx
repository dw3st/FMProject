import { createPage } from "@/createPage";
import { PromoMatchScreen } from "./PromoMatchScreen";
import { LabNav } from "@/lab/components/LabNav";

function PromoPage() {
  return (
    <>
      {/* Collapsed by default so the nav doesn't sit on top of the pitch. */}
      <LabNav defaultCollapsed />
      <PromoMatchScreen />
    </>
  );
}

// `public: true` skips the AuthGate + GameSaveProvider wrappers — the promo
// page reads its own data via /api/club-profile and doesn't need a user session.
createPage(PromoPage, { public: true });
