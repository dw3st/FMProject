import { serve } from "bun";
import { apiRoutes } from "@/backend/routes";

import landingPage from "./pages/landing/index.html";
import loginPage from "./pages/login/index.html";
import startPage from "./pages/start/index.html";
import dashboardPage from "./pages/dashboard/index.html";
import matchPage from "./pages/match/index.html";
import leaguesPage from "./pages/leagues/index.html";
import squadPage from "./pages/squad/index.html";
import playerPage from "./pages/player/index.html";
import scoutPage from "./pages/scout/index.html";
import transfersPage from "./pages/transfers/index.html";
import comingSoonPage from "./pages/coming-soon/index.html";
import formationPage from "./pages/formation/index.html";
import newGamePage from "./pages/new-game/index.html";
import developmentPage from "./pages/development/index.html";
import seasonEndPage from "./pages/season-end/index.html";
import firedPage from "./pages/fired/index.html";
import financesPage from "./pages/finances/index.html";
import matchPreviewPage from "./pages/match-preview/index.html";
import matchResultPage from "./pages/match-result/index.html";
import inboxPage from "./pages/inbox/index.html";

const server = serve({
  routes: {
    "/": landingPage,
    "/login": loginPage,
    "/start": startPage,
    "/new-game": newGamePage,
    "/dashboard": dashboardPage,
    "/match": matchPage,
    "/scout": scoutPage,
    "/transfers": transfersPage,
    "/inbox": inboxPage,

    "/leagues": leaguesPage,
    "/leagues/:league": leaguesPage,

    "/squad/:league/:club": squadPage,

    "/player/:league/:club/:id": playerPage,

    "/tactics": comingSoonPage,
    "/formation": formationPage,
    "/match-preview": matchPreviewPage,
    "/match-result": matchResultPage,
    "/development": developmentPage,
    "/finances": financesPage,
    "/staff": comingSoonPage,
    "/stats": comingSoonPage,
    "/season-end": seasonEndPage,
    "/fired": firedPage,

    ...apiRoutes,
  },

  idleTimeout: 120,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
