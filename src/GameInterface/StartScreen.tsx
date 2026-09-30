import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadGameSave, deleteGameSave } from "@/GameInterface/gameSession";
import { SettingsOverlay } from "@/GameInterface/SettingsScreen";
import { CURRENT_VERSION } from "@/GameInterface/changelog/changelog";
import { useChangelogNotice } from "@/GameInterface/changelog/useChangelogNotice";
import { ChangelogModal } from "@/GameInterface/Components/ChangelogModal";
import { ChangelogNoticePill } from "@/GameInterface/Components/ChangelogNoticePill";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";

interface SaveEntry {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  leagueName: string;
  clubColors: [string, string];
  updatedAt: string;
}

export function StartScreen() {
  const { t } = useTranslation();
  const [saves, setSaves] = useState<SaveEntry[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const { showNotice: showChangelogNotice, markSeen: markChangelogSeen } = useChangelogNotice();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pendingDeleteSave = saves.find((s) => s.id === pendingDeleteId) ?? null;

  function openChangelog() {
    setIsChangelogOpen(true);
    markChangelogSeen();
  }

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

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await deleteGameSave(pendingDeleteId);
      setSaves((prev) => prev.filter((s) => s.id !== pendingDeleteId));
      setPendingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const newGameClass =
    "flex h-10 w-full items-center justify-center rounded bg-primary font-semibold text-primary-foreground no-underline transition-colors";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background pb-14">
      <PitchBackdrop players={false} />

      <div className="relative w-full max-w-[340px] px-4">
        <Wordmark size="md" className="mb-6 block text-center" />

        {atLimit ? (
          <div aria-disabled className={`${newGameClass} cursor-not-allowed opacity-40`}>
            {t("startScreen.newGame")}
          </div>
        ) : (
          <a
            href="/new-game"
            className={`${newGameClass} hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
          >
            {t("startScreen.newGame")}
          </a>
        )}
        {atLimit && (
          <p className="mt-2 text-center text-xs text-muted-foreground">{t("common.saveLimitReached")}</p>
        )}

        <p className="mb-2 mt-6 text-xs text-muted-foreground">{t("startScreen.savedGames")}</p>
        {saves.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("startScreen.noSavedGames")}</p>
        ) : (
          <ul className="m-0 list-none border-b border-border p-0">
            {saves.map((save) => (
              <li key={save.id} className="flex items-center gap-3 border-t border-border py-3">
                <ClubLogo
                  className="h-[22px] w-[22px] shrink-0 rounded-full"
                  logoUrl={squadLogoUrl(save.clubId)}
                  primaryColor={save.clubColors[0]}
                  secondaryColor={save.clubColors[1]}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{save.clubName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {save.leagueName} · {formatDate(save.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoad(save.id)}
                  disabled={loadingId !== null}
                  className="h-10 cursor-pointer border-0 bg-transparent px-1 text-xs text-primary transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {t("startScreen.continue")}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(save.id)}
                  disabled={loadingId !== null}
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="absolute inset-x-6 bottom-4 flex items-center justify-between text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="h-10 cursor-pointer border-0 bg-transparent p-0 text-inherit transition-colors hover:text-foreground"
        >
          {t("startScreen.settings")}
        </button>
        <div className="flex items-center gap-3">
          <span>{t("common.version", { version: CURRENT_VERSION })}</span>
          <button
            type="button"
            onClick={openChangelog}
            className="h-10 cursor-pointer border-0 bg-transparent p-0 text-inherit transition-colors hover:text-foreground"
          >
            {t("startScreen.whatsNew")}
          </button>
          {showChangelogNotice && (
            <ChangelogNoticePill
              version={CURRENT_VERSION}
              onOpen={openChangelog}
              onDismiss={markChangelogSeen}
            />
          )}
        </div>
      </div>

      <SettingsOverlay open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ChangelogModal open={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
      <ConfirmDialog
        open={pendingDeleteSave !== null}
        title={t("startScreen.deleteConfirmTitle")}
        body={
          pendingDeleteSave
            ? t("startScreen.deleteConfirmBody", {
                clubName: pendingDeleteSave.clubName,
                leagueName: pendingDeleteSave.leagueName,
              })
            : ""
        }
        confirmLabel={t("startScreen.deleteConfirmAction")}
        onConfirm={handleConfirmDelete}
        onClose={() => setPendingDeleteId(null)}
        busy={deleting}
      />
    </div>
  );
}
