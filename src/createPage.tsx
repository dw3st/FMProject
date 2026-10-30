import { createRoot } from "react-dom/client";
import { loadInitialLanguages } from "@/i18n/i18n";
import "@/index.css";
import { installFontFaces } from "@/fontFaces";
import { GameSaveProvider } from "@/GameInterface/GameSaveProvider";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { AuthGate } from "@/GameInterface/AuthGate";
import { ScreenSizeGate } from "@/GameInterface/ScreenSizeGate";
import { initAnalytics } from "@/analytics";
import { loadPaintedFaces } from "@/Domain/art/paintedFaces";
import { readNewVisual } from "@/GameInterface/artPrefs";

export interface CreatePageOptions {
  /** Skip the auth gate + GameSaveProvider. Used for landing & login. */
  public?: boolean;
  /** Skip only the auth gate but keep GameSaveProvider. Used for lab tools. */
  noAuth?: boolean;
  /** Page works at any screen size; skip the minimum-size gate. Used for landing, login and start. */
  responsive?: boolean;
  /** A public page that still draws the new art (the /test pitch): asks the server for it before rendering. */
  art?: boolean;
}

export function createPage(Component: React.ComponentType, options: CreatePageOptions = {}) {
  installFontFaces();
  void initAnalytics();

  function start() {
    const inner = options.public ? (
      <Component />
    ) : options.noAuth ? (
      <GameSaveProvider>
        <Component />
      </GameSaveProvider>
    ) : (
      <AuthGate>
        <GameSaveProvider>
          <Component />
        </GameSaveProvider>
      </AuthGate>
    );

    createRoot(document.getElementById("root")!).render(
      <LanguageProvider>
        {options.responsive ? inner : <ScreenSizeGate>{inner}</ScreenSizeGate>}
      </LanguageProvider>,
    );
  }

  // The painted faces (new art) are known before the first render, so a face never swaps from the SVG to the webp.
  // Up to 4 s (4.41.15): with 1,5 s a slow answer left the whole page on the old drawing without notice.
  const faces = options.public && !options.art ? Promise.resolve() : loadPaintedFaces(4000, readNewVisual());
  // The texts of the active language (fetched, not bundled: perf audit 4.41.29).
  const ready = Promise.all([faces, loadInitialLanguages()]);
  const go = () => void ready.then(start);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go);
  } else {
    go();
  }
}
