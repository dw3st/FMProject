import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Gamepad2, FolderOpen, Settings, Trash2, Play } from "lucide-react";
import { loadGameSave, deleteGameSave } from "@/GameInterface/gameSession";
import { SettingsOverlay } from "@/GameInterface/SettingsScreen";

interface SaveEntry {
  id: string;
  name: string;
  clubName: string;
  leagueName: string;
  clubColors: [string, string];
  updatedAt: string;
}

export function StartScreen() {
  const { t } = useTranslation();
  const [saves, setSaves] = useState<SaveEntry[]>([]);
  const [showSaves, setShowSaves] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const MAX_SAVES = 5;
  const atLimit = saves.length >= MAX_SAVES;

  useEffect(() => {
    fetch("/api/saves")
      .then((r) => r.json())
      .then((data: SaveEntry[]) => setSaves(data))
      .catch(() => {});
  }, []);

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      await loadGameSave(id);
      window.location.href = "/dashboard";
    } catch {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    await deleteGameSave(id);
    setSaves((prev) => prev.filter((s) => s.id !== id));
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Football Field Background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[oklch(0.08_0.02_var(--team-hue))] to-transparent">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-80 h-24 border-2 border-muted/30 rounded-b-lg">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `
                  linear-gradient(to right, oklch(0.3 0.02 var(--team-hue)) 1px, transparent 1px),
                  linear-gradient(to bottom, oklch(0.3 0.02 var(--team-hue)) 1px, transparent 1px)
                `,
                backgroundSize: "12px 12px",
              }}
            />
          </div>
        </div>

        <div className="absolute top-28 left-0 right-0 bottom-0 bg-gradient-to-b from-[oklch(0.18_0.04_var(--team-hue))] via-[oklch(0.14_0.03_var(--team-hue))] to-[oklch(0.10_0.02_var(--team-hue))]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border-2 border-muted/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted/20" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-32 border-t-2 border-l-2 border-r-2 border-muted/15 rounded-t-lg" />
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,oklch(0.08_0.02_var(--team-hue))_100%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center mb-12">
          <h1 className="text-6xl md:text-8xl font-black tracking-tight font-display">
            <span className="text-foreground">TOUCH</span>
            <span className="text-primary glow-text">LINES</span>
          </h1>
          <p className="mt-4 text-sm md:text-base tracking-[0.4em] text-muted-foreground uppercase font-medium">
            {t("startScreen.footballSimulation")}
          </p>
        </div>

        {!showSaves ? (
          <div className="flex flex-col gap-4 w-full max-w-sm">
            {atLimit ? (
              <div
                aria-disabled
                className="flex items-center justify-center gap-3 w-full py-4 px-8 bg-primary/40 text-primary-foreground rounded-xl font-bold text-lg uppercase tracking-wider opacity-60 cursor-not-allowed"
              >
                <Gamepad2 className="w-6 h-6" />
                {t("startScreen.newGame")}
              </div>
            ) : (
              <a
                href="/new-game"
                className="flex items-center justify-center gap-3 w-full py-4 px-8 bg-primary text-primary-foreground rounded-xl font-bold text-lg uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] glow-primary no-underline"
              >
                <Gamepad2 className="w-6 h-6" />
                {t("startScreen.newGame")}
              </a>
            )}

            <button
              onClick={() => setShowSaves(true)}
              disabled={saves.length === 0}
              className="flex items-center justify-center gap-3 w-full py-4 px-8 card-arcade text-secondary-foreground rounded-xl font-bold text-lg uppercase tracking-wider transition-all hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <FolderOpen className="w-6 h-6" />
              {t("startScreen.loadGame")}
              <span className="ml-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-mono">
                {saves.length}/{MAX_SAVES}
              </span>
            </button>

            {atLimit && (
              <p className="text-xs text-center text-muted-foreground -mt-1">
                {t("common.saveLimitReached")}
              </p>
            )}

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center gap-3 w-full py-3 px-6 text-muted-foreground font-semibold uppercase tracking-wider transition-all hover:text-primary cursor-pointer bg-transparent border-0"
            >
              <Settings className="w-5 h-5" />
              {t("startScreen.settings")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 w-full max-w-md">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold font-display uppercase tracking-wider text-foreground m-0">
                {t("startScreen.savedGames")}
              </h2>
              <button
                onClick={() => setShowSaves(false)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-0 uppercase tracking-wider font-semibold"
              >
                {t("startScreen.back")}
              </button>
            </div>

            {saves.map((save) => (
              <div
                key={save.id}
                className="card-arcade rounded-xl p-4 flex items-center gap-4 group"
              >
                <span
                  className="w-10 h-10 rounded-full border border-border shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${save.clubColors[0]} 50%, ${save.clubColors[1]} 50%)`,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground text-sm truncate">{save.clubName}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {save.leagueName} · {formatDate(save.updatedAt)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleLoad(save.id)}
                    disabled={loadingId !== null}
                    className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer border-0 disabled:opacity-50"
                    title={t("common.load")}
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(save.id)}
                    disabled={loadingId !== null}
                    className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer border-0 disabled:opacity-50"
                    title={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {saves.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                {t("startScreen.noSavedGames")}
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-6 text-xs text-muted-foreground/50 font-mono">
          {t("common.version")}
        </div>
      </div>

      <SettingsOverlay open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
