/**
 * Balance Lab Server — separate Bun.serve() entry point.
 *
 * Run with: `bun run lab` (or `bun src/lab/server.ts`).
 * Default port: 4000 (override with LAB_PORT env var).
 */

import { serve } from "bun";
import { labApiRoutes } from "@/lab/routes";
import { debugApiRoutes } from "@/lab/debugApi";
import { apiRoutes } from "@/backend/routes";
import labPage from "./index.html";
import testPage from "./pages/test/index.html";
import simulatePage from "./pages/simulate/index.html";
import promoPage from "./pages/promo/index.html";

const port = parseInt(process.env.LAB_PORT ?? "4000", 10);

const server = serve({
  port,
  routes: {
    "/": labPage,
    "/lab": labPage,
    "/test": testPage,
    "/simulate": simulatePage,
    "/promo": promoPage,
    ...apiRoutes,
    ...debugApiRoutes,
    ...labApiRoutes,
  },
  idleTimeout: 0, // long-running SSE streams
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🧪 Balance Lab running at ${server.url}`);
