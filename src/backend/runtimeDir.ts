// Root for runtime-writable state — game saves and the auth DB. Kept separate
// from the static game content under src/Data (leagues, squads, logos, kits)
// so production can mount it on a persistent volume: set RUNTIME_DATA_DIR to the
// volume path and saves/DB survive redeploys while content still ships in the
// image. Defaults to src/Data so local dev is unchanged.
import { fileURLToPath } from "node:url";

export const RUNTIME_DATA_DIR =
  process.env.RUNTIME_DATA_DIR?.trim() || fileURLToPath(new URL("../Data", import.meta.url));
