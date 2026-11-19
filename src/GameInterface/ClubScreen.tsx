import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { FacilitiesView } from "@/GameInterface/Facilities/FacilitiesView";
import { ClubSponsorsStrip } from "@/GameInterface/Sponsors/ClubSponsorsStrip";
import { ClubTabs } from "@/GameInterface/Craft/ClubTabs";
import { CraftLinksContext, type CraftLinks } from "@/GameInterface/Craft/RecipeLine";
import { StockView } from "@/GameInterface/Craft/StockView";
import { ShopView } from "@/GameInterface/Craft/ShopView";
import { jobKey, parseClubTab, parseJob, type ClubTab, type MaterialsPart, type WorksJob } from "@/Domain/facilities/clubTabs";
import type { LeagueData } from "@/types/playerTypes";
import type { MaterialCounts } from "@/types/craftTypes";
import { navigate } from "@/GameInterface/router/navigation";

const query = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));

/** Keeps the tab (and the works picked) in the address without a frame navigation (that would remount the screen and lose the cart). */
function writeUrl(tab: ClubTab, job: WorksJob | null): void {
  const url = new URL(window.location.href);
  if (tab === "overview") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
  if (tab === "works" && job) url.searchParams.set("job", jobKey(job)); else url.searchParams.delete("job");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Club (spec 2026-11-19-club-tab-redesign): Overview (club map, stadium, to-do list), Stadium (stands, comfort, turf,
 * crowd, stadium sponsors), Works (queue, picker, the chosen works in three steps) and Materials (shop and stock side by
 * side). `?tab=` opens a tab (the old seven values too), `?job=` the works picked in Works.
 */
export function ClubScreen() {
  const { t } = useTranslation();
  const { session, squad, loading, fixtures } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const initial = useMemo(() => parseClubTab(query().get("tab")), []);
  const [tab, setTab] = useState<ClubTab>(initial.tab);
  const [part, setPart] = useState<MaterialsPart | undefined>(initial.part);
  const [job, setJob] = useState<WorksJob | null>(() => parseJob(query().get("job")));
  const [cart, setCart] = useState<MaterialCounts | null>(null);
  const stockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/new-game");
  }, [loading, session]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  // A link to the stock lands on its part of Materials.
  useEffect(() => {
    if (tab === "materials" && part === "stock") stockRef.current?.scrollIntoView({ block: "start" });
  }, [tab, part]);

  const change = (next: ClubTab) => {
    setTab(next);
    setPart(undefined);
    if (next !== "materials") setCart(null);
    writeUrl(next, job);
  };

  const pickJob = (next: WorksJob, open = false) => {
    setJob(next);
    if (open) { setTab("works"); setCart(null); }
    writeUrl(open ? "works" : tab, next);
  };

  const saveId = session?.saveId;
  const links = useMemo<CraftLinks | null>(() => (saveId
    ? {
      saveId,
      goToShop: (c: MaterialCounts) => { setCart(c); setTab("materials"); setPart("shop"); writeUrl("materials", null); },
      openWorkshop: () => { const j: WorksJob = { kind: "workshop" }; setJob(j); setTab("works"); writeUrl("works", j); },
    }
    : null), [saveId]);

  const subtitle = session ? [session.clubName, session.leagueName].filter(Boolean).join(" · ") : null;

  return (
    <ScreenContainer>
      <ScreenTitle accent={t("screenTitles.club.accent")} subtitle={subtitle}>{t("screenTitles.club.main")}</ScreenTitle>
      {session ? (
        <CraftLinksContext.Provider value={links}>
          <ClubTabs active={tab} onChange={change} />
          {/* One FacilitiesView for its three tabs: switching between them keeps the data, the stand and the works picked. */}
          {tab !== "materials" && (
            <FacilitiesView
              saveId={session.saveId}
              squadId={squad?.id ?? session.clubId}
              fixtures={fixtures}
              leagues={leagues}
              currentDate={session.currentDate ?? null}
              section={tab}
              onSection={change}
              job={job}
              onJob={pickJob}
              onBuy={(c) => links?.goToShop(c)}
              /* The club's own sponsors (12.1): plates that open each company's page. */
              sponsors={<ClubSponsorsStrip saveId={session.saveId} />}
            />
          )}
          {tab === "materials" && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-6 items-start">
              <ShopView key={JSON.stringify(cart)} saveId={session.saveId} cart={cart} />
              <div ref={stockRef} className="min-w-0 flex flex-col gap-4">
                <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.tabs.stock")}</h2>
                <StockView saveId={session.saveId} stacked />
              </div>
            </div>
          )}
        </CraftLinksContext.Provider>
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t("financesScreen.loading")}</p>
      )}
    </ScreenContainer>
  );
}
