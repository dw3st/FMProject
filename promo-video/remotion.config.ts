/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import path from "node:path";

// ─── Quality settings ────────────────────────────────────────────────────────
// Per Remotion's official quality guide
// (https://www.remotion.dev/docs/quality):
//
//   "You will have less sharp text if the video is displayed on a high-
//   density display (like a MacBook) because the device has a 2x pixel
//   density, but the video is 1920×1080. To display the font with the same
//   sharpness as on a low-density display, you would need to render a 4K
//   video."
//
// Fix = scale=2 → 4K output (3840×2160) from the 1080p composition. Combined
// with CRF 16 (visually lossless) + PNG source frames + JPEG quality 100,
// this produces broadcast-grade output. Render is ~3-4× slower than 1080p.
Config.setScale(2);                         // 4K output: matches 2x DPI displays
Config.setVideoImageFormat("png");          // lossless intermediate frames
Config.setJpegQuality(100);                 // (unused with png but safe to set)
Config.setCrf(16);                          // visually lossless h264
Config.setPixelFormat("yuv420p");           // broad compat
Config.setCodec("h264");
Config.setOverwriteOutput(true);

// CLI is always invoked from the promo-video root, so process.cwd() is stable.
const PROMO_ROOT = process.cwd();

// Chain: Tailwind v4 → alias resolution → final config.
Config.overrideWebpackConfig((config) => {
  const withTailwind = enableTailwind(config);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...(withTailwind.resolve?.alias ?? {}),
        "@": path.resolve(PROMO_ROOT, "src"),
        "@game": path.resolve(PROMO_ROOT, "..", "src"),
      },
    },
  };
});
