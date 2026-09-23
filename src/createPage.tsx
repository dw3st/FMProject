import { createRoot } from "react-dom/client";
import "@/index.css";
import { GameSaveProvider } from "@/GameInterface/GameSaveProvider";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { AuthGate } from "@/GameInterface/AuthGate";
import { ScreenSizeGate } from "@/GameInterface/ScreenSizeGate";
import { initAnalytics } from "@/analytics";

export interface CreatePageOptions {
  /** Skip the auth gate + GameSaveProvider. Used for landing & login. */
  public?: boolean;
  /** Skip only the auth gate but keep GameSaveProvider. Used for lab tools. */
  noAuth?: boolean;
}

export function createPage(Component: React.ComponentType, options: CreatePageOptions = {}) {
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
        <ScreenSizeGate>{inner}</ScreenSizeGate>
      </LanguageProvider>,
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
