/**
 * The game as an installable app (10.6): the web manifest and the pure rules of the install button. A phone that
 * installs it opens the game full screen, lying down, without the browser's bars.
 */
import { gameArtUrl } from "@/Domain/art/paintedFaces";

export const MANIFEST_PATH = "/manifest.webmanifest";
/** The game's background (`--color-background`): the splash screen and the system bars take it. */
export const APP_THEME_COLOR = "#0b0f1a";

export interface AppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "fullscreen";
  display_override: string[];
  orientation: "landscape";
  background_color: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: "any" | "maskable" }[];
}

export function appManifest(): AppManifest {
  return {
    id: "/",
    name: "FMProject",
    short_name: "FMProject",
    description: "Football manager in the browser: build your club, play the matches live, take on your friends.",
    start_url: "/start",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "landscape",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      { src: gameArtUrl("brand/app-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: gameArtUrl("brand/favicon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: gameArtUrl("brand/app-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/**
 * What the install block offers: nothing when it already runs as an app; the browser's own install dialog when it
 * handed one over; the manual steps on an iPhone or iPad (Safari never offers the dialog); else nothing to do here.
 */
export type InstallState = "installed" | "prompt" | "ios" | "none";

export function installState(env: { standalone: boolean; hasPrompt: boolean; ios: boolean }): InstallState {
  if (env.standalone) return "installed";
  if (env.hasPrompt) return "prompt";
  if (env.ios) return "ios";
  return "none";
}

/** iPhone, iPod, or an iPad (which calls itself a Mac but has a touch screen). */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
