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
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";

interface SaveEntry {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  leagueName: string;
  clubColors: [string, string];
  updatedAt: string;
  /** Sacked: the career is over (`.claude/rules/game/board-fans.md`). */
  /** Sacked, without a club (`.claude/rules/game/jobs.md`). */
  unemployed?: { since: string; lastClubName: string };
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
    "flex h-10 w-full items-center justify-center rounded bg-primary text-sm font-semibold text-primary-foreground no-underline transition-colors";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background pb-14">
      <PitchBackdrop />

      <div className="relative w-full max-w-[440px] px-4">
        <Wordmark size="lg" className="mb-8 block text-center" />

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
          <p className="mt-2 text-center text-sm text-muted-foreground">{t("common.saveLimitReached")}</p>
        )}

        <SectionTitle className="mt-8 mb-3">{t("startScreen.savedGames")}</SectionTitle>
        {saves.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("startScreen.noSavedGames")}</p>
        ) : (
          <ul className="m-0 list-none border-b border-border p-0">
            {saves.map((save) => (
              <li key={save.id} className="flex items-center gap-3 border-t border-border py-3">
                <ClubLogo
                  className="h-9 w-9 shrink-0 rounded-full"
                  logoUrl={squadLogoUrl(save.clubId)}
                  primaryColor={save.clubColors[0]}
                  secondaryColor={save.clubColors[1]}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold text-foreground">{save.clubName}</div>
                  {/* The league may truncate; the date always shows in full. */}
                  <div className="flex min-w-0 text-sm text-muted-foreground">
                    <span className="truncate">{save.leagueName}</span>
                    {save.unemployed && <span className="shrink-0 whitespace-nowrap text-destructive">&nbsp;· {t("startScreen.unemployed")}</span>}
                    <span className="shrink-0 whitespace-nowrap tabular-nums">&nbsp;· {formatDate(save.updatedAt)}</span>
                  </div>
                </div>
                <Button className="px-4 shrink-0" onClick={() => handleLoad(save.id)} disabled={loadingId !== null}>
                  {t("startScreen.continue")}
                </Button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(save.id)}
                  disabled={loadingId !== null}
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-destructive disabled:opacity-50"
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="absolute inset-x-6 bottom-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="h-10 cursor-pointer border-0 bg-transparent p-0 text-inherit transition-colors hover:text-foreground"
        >
          {t("startScreen.settings")}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openChangelog}
            className="h-10 cursor-pointer border-0 bg-transparent p-0 text-inherit transition-colors hover:text-foreground"
          >
            {t("common.version", { version: CURRENT_VERSION })} · {t("startScreen.whatsNew")}
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
