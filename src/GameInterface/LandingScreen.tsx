import { useTranslation } from "react-i18next";
import { CURRENT_VERSION } from "@/GameInterface/changelog/changelog";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";

// Public source repository. AGPL-3.0 requires network users be able to obtain the source.
const SOURCE_REPO_URL = "https://github.com/dw3st/FMProject";
const LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";

const WORLD_NUMBERS = ["landing.statLeagues", "landing.statClubs", "landing.statPlayers", "landing.statCups"] as const;

const LINK = "text-muted-foreground no-underline transition-colors hover:text-foreground";

export function LandingScreen() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="fixed top-0 inset-x-0 z-10 flex items-center justify-between px-7 h-14 text-xs">
        <a href="/" className="no-underline"><Wordmark size="sm" /></a>
        <a href="/start" className={LINK}>{t("landing.signIn")}</a>
      </header>

      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <PitchBackdrop />
        <div className="relative flex flex-col items-center">
          <Wordmark size="lg" />
          <p className="mt-2 text-muted-foreground">{t("landing.tagline")}</p>
          <a
            href="/start"
            className="mt-6 inline-flex h-10 items-center rounded bg-primary px-7 font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("landing.play")}
          </a>
        </div>
      </section>

      <ul className="flex flex-col items-center gap-1 border-t border-border px-6 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-center sm:gap-8">
        {WORLD_NUMBERS.map((key) => <li key={key}>{t(key)}</li>)}
      </ul>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-6 pb-6 pt-2 text-xs text-muted-foreground">
        <span>v{CURRENT_VERSION}</span>
        <a href={SOURCE_REPO_URL} target="_blank" rel="noreferrer" className={LINK}>{t("landing.sourceCode")}</a>
        <a href={LICENSE_URL} target="_blank" rel="noreferrer" className={LINK}>{t("landing.license")}</a>
        <span>
          {t("landing.developedBy")}{" "}
          <a href="https://westlab.dev" target="_blank" rel="noopener" className={LINK}>westlab.dev</a>
        </span>
      </footer>
    </div>
  );
}
