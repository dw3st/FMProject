import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { FacilitiesView } from "@/GameInterface/Facilities/FacilitiesView";
import { ClubSponsorsStrip } from "@/GameInterface/Sponsors/ClubSponsorsStrip";
import { ClubTabs, isClubTab, type ClubTab } from "@/GameInterface/Craft/ClubTabs";
import { CraftLinksContext, type CraftLinks } from "@/GameInterface/Craft/RecipeLine";
import { WorkshopView } from "@/GameInterface/Craft/WorkshopView";
import { StockView } from "@/GameInterface/Craft/StockView";
import { ShopView } from "@/GameInterface/Craft/ShopView";
import type { LeagueData } from "@/types/playerTypes";
import type { MaterialCounts } from "@/types/craftTypes";
import { navigate } from "@/GameInterface/router/navigation";

const initialTab = (): ClubTab => {
  if (typeof window === "undefined") return "facilities";
  const v = new URLSearchParams(window.location.search).get("tab");
  return isClubTab(v) ? v : "facilities";
};

/** Keeps the tab in the address without a frame navigation (that would remount the screen and lose the cart). */
function writeTab(tab: ClubTab): void {
  const url = new URL(window.location.href);
  if (tab === "facilities") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Club (#120): the club's facilities — stadium, training ground, academy and their items
 * (`.claude/rules/game/facilities.md`) — and the craft tabs (workshop, stock, shop; spec
 * 2026-11-18-club-craft) the works are built from. `?tab=` opens a tab.
 */
export function ClubScreen() {
  const { t } = useTranslation();
  const { session, squad, loading, fixtures } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [tab, setTab] = useState<ClubTab>(initialTab);
  const [cart, setCart] = useState<MaterialCounts | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/new-game");
  }, [loading, session]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  const change = (next: ClubTab) => {
    setTab(next);
    if (next !== "shop") setCart(null);
    writeTab(next);
  };

  const saveId = session?.saveId;
  const links = useMemo<CraftLinks | null>(() => (saveId
    ? {
      saveId,
      goToShop: (c: MaterialCounts) => { setCart(c); setTab("shop"); writeTab("shop"); },
      openWorkshop: () => { setTab("workshop"); writeTab("workshop"); },
    }
    : null), [saveId]);

  return (
    <ScreenContainer>
      <ScreenTitle accent={t("screenTitles.club.accent")}>{t("screenTitles.club.main")}</ScreenTitle>
      {/* The club's own sponsors (12.1): plates that open each company's page. */}
      {session && <ClubSponsorsStrip saveId={session.saveId} />}
      {session ? (
        <CraftLinksContext.Provider value={links}>
          <ClubTabs active={tab} onChange={change} />
          {tab === "facilities" && (
            <FacilitiesView
              saveId={session.saveId}
              squadId={squad?.id ?? session.clubId}
              fixtures={fixtures}
              leagues={leagues}
              currentDate={session.currentDate ?? null}
            />
          )}
          {tab === "workshop" && <WorkshopView saveId={session.saveId} />}
          {tab === "stock" && <StockView saveId={session.saveId} />}
          {tab === "shop" && <ShopView key={JSON.stringify(cart)} saveId={session.saveId} cart={cart} />}
        </CraftLinksContext.Provider>
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t("financesScreen.loading")}</p>
      )}
    </ScreenContainer>
  );
}
