/**
 * Serves the browser Worker of the highlights mode (stage 19, `live-modes.md`): Bun's HTML bundler does not follow
 * `new Worker(new URL(...))`, so the Worker is bundled here with `Bun.build` from `forecastWorker.ts` (the whole match
 * engine) on the first request and kept in memory. In development every request rebuilds (fresh code with `--hot`).
 */
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../GameEngine/Support/forecastWorker.ts", import.meta.url));
const PROD = process.env.NODE_ENV === "production";
let built: Promise<string> | null = null;

async function build(): Promise<string> {
  const out = await Bun.build({ entrypoints: [ENTRY], target: "browser", format: "esm", minify: PROD });
  if (!out.success || !out.outputs[0]) throw new Error(`forecast worker build failed: ${out.logs.map(String).join("\n")}`);
  return await out.outputs[0].text();
}

export async function serveForecastWorker(): Promise<Response> {
  try {
    if (!built || !PROD) built = build();
    const body = await built;
    return new Response(body, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": PROD ? "public, max-age=31536000, immutable" : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    built = null;
    console.error(e);
    return new Response("forecast worker unavailable", { status: 500 });
  }
}
