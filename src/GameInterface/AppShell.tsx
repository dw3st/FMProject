import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Layout } from "@/GameInterface/Components/Layout";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { interceptedTarget, matchAppPath, type RouteMatch } from "@/GameInterface/router/appRoutes";
import { activateFrame, navigate, useRoute } from "@/GameInterface/router/navigation";
import { DashboardScreen } from "@/GameInterface/DashboardScreen";
import { SquadScreen } from "@/GameInterface/SquadScreen";
import { PlayerScreen } from "@/GameInterface/PlayerScreen";
import { FormationScreen } from "@/GameInterface/FormationScreen";
import { ClubScreen } from "@/GameInterface/ClubScreen";
import { DevelopmentScreen } from "@/GameInterface/DevelopmentScreen";
import { FinancesScreen } from "@/GameInterface/FinancesScreen";
import { StaffScreen } from "@/GameInterface/StaffScreen";
import { LeagueTableScreen } from "@/GameInterface/LeagueTableScreen";
import { TransfersScreen } from "@/GameInterface/TransfersScreen";
import { ScoutScreen } from "@/GameInterface/ScoutScreen";
import { StatsScreen } from "@/GameInterface/StatsScreen";
import { InboxScreen } from "@/GameInterface/InboxScreen";
import { AchievementsScreen } from "@/GameInterface/Achievements/AchievementsScreen";
import { NewsScreen } from "@/GameInterface/News/NewsScreen";
import { WorldScreen } from "@/GameInterface/World/WorldScreen";
import { SeasonEndScreen } from "@/GameInterface/SeasonEndScreen";
import { MatchRoomScreen } from "@/GameInterface/H2H/MatchRoomScreen";
import { ComingSoonScreen } from "@/GameInterface/ComingSoonScreen";
import { MatchPreviewScreen } from "@/GameInterface/MatchPreviewScreen";
import { MatchResultScreen } from "@/GameInterface/MatchResultScreen";
import { MatchFrame } from "@/GameInterface/MatchFrame";

// The fixed frame (`docs/superpowers/specs/2026-11-06-spa-shell-design.md`): the bars, friends, chat and the watch
// window stay mounted; only the screen changes. Every navigation remounts the screen (key), so a screen that reads the
// URL when it mounts behaves as after a page load.

function screenFor({ route, params }: RouteMatch, search: string): ReactNode {
  switch (route.screen) {
    case "dashboard": return <DashboardScreen />;
    case "squad": return <SquadScreen league={params.league!} club={params.club!} />;
    case "player": return <PlayerScreen league={params.league!} club={params.club!} playerId={params.id!} />;
    case "formation": return <FormationScreen />;
    case "club": return <ClubScreen />;
    case "development": return <DevelopmentScreen />;
    case "finances": return <FinancesScreen />;
    case "staff": return <StaffScreen />;
    case "leagues": return <LeagueTableScreen leagueSlug={params.league} />;
    case "transfers": return <TransfersScreen />;
    case "scout": return <ScoutScreen />;
    case "stats": return <StatsScreen />;
    case "inbox": return <ScreenContainer fill><InboxScreen /></ScreenContainer>;
    case "achievements": return <AchievementsScreen />;
    case "news": return <NewsScreen />;
    case "world": return <WorldScreen />;
    case "seasonEnd": return <SeasonEndScreen />;
    case "matchRoom": return <MatchRoomScreen />;
    case "comingSoon": return <ComingSoonScreen />;
    case "matchPreview": return <MatchPreviewScreen />;
    case "matchResult": return <MatchResultScreen />;
    case "match": return <MatchFrame search={search} />;
  }
}

export function AppShell() {
  const route = useRoute();
  const { refresh } = useGameSave();
  const firstKey = useRef(route.key);

  useEffect(() => activateFrame(), []);

  // Links inside the frame change the screen in place (no page load).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const to = interceptedTarget(e, { href: a.href, target: a.target, hasDownload: a.hasAttribute("download") }, window.location.origin);
      if (!to) return;
      e.preventDefault();
      navigate(to);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const match = matchAppPath(route.pathname);

  useEffect(() => {
    if (match) document.title = match.route.title;
    if (route.key === firstKey.current) return;
    // A page load fetched the save; an in-frame navigation refreshes it quietly.
    void refresh({ background: true });
    document.querySelector("main")?.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.key]);

  if (!match) {
    // Not a frame path (should not happen: the server only serves the frame on its routes).
    if (typeof window !== "undefined") navigate(route.pathname + route.search, { replace: true });
    return null;
  }

  return (
    <Layout chrome={match.route.chrome ?? "full"}>
      <Fragment key={`${route.key}:${route.pathname}${route.search}`}>
        {screenFor(match, route.search)}
      </Fragment>
    </Layout>
  );
}
