import { serve } from "bun";
import { apiRoutes } from "@/backend/routes";
import { handleSocialUpgrade, socialWebSocket } from "@/backend/social/realtime";
import { startSocialMaintenance } from "@/backend/social/maintenance";
import { startWorldClock } from "@/backend/groupAdvance";

import appPage from "./pages/app/index.html";
import landingPage from "./pages/landing/index.html";
import loginPage from "./pages/login/index.html";
import startPage from "./pages/start/index.html";
import matchPage from "./pages/match/index.html";
import newGamePage from "./pages/new-game/index.html";
import joinPage from "./pages/join/index.html";
import firedPage from "./pages/fired/index.html";
import matchPreviewPage from "./pages/match-preview/index.html";
import watchPage from "./pages/watch/index.html";
import matchResultPage from "./pages/match-result/index.html";

const server = serve({
  routes: {
    "/": landingPage,
    "/login": loginPage,
    "/start": startPage,
    "/new-game": newGamePage,
    "/join/:code": joinPage,
    "/dashboard": appPage,
    "/match": matchPage,
    "/scout": appPage,
    "/transfers": appPage,
    "/inbox": appPage,

    "/leagues": appPage,
    "/leagues/:league": appPage,

    "/squad/:league/:club": appPage,

    "/player/:league/:club/:id": appPage,

    "/tactics": appPage,
    "/formation": appPage,
    "/match-preview": matchPreviewPage,
    "/match-room": appPage,
    "/watch": watchPage,
    "/match-result": matchResultPage,
    "/development": appPage,
    "/finances": appPage,
    "/club": appPage,
    "/staff": appPage,
    "/achievements": appPage,
    "/news": appPage,
    "/world": appPage,
    "/stats": appPage,
    // National teams live in a tab of the Leagues screen (the top bar has no room for a 12th tab).
    "/national": () => Response.redirect("/leagues?tab=national", 302),
    "/season-end": appPage,
    "/fired": firedPage,

    ...apiRoutes,
  },

  // Friends and chat (`.claude/rules/social.md`): the WebSocket upgrade lives in `fetch` (the fallback for paths
  // no route matched), the socket handlers in `websocket`.
  fetch(req, srv) {
    if (new URL(req.url).pathname === "/api/ws") return handleSocialUpgrade(req, srv);
    return new Response("Not Found", { status: 404 });
  },

  websocket: socialWebSocket,

  idleTimeout: 120,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);

startSocialMaintenance();
startWorldClock();
