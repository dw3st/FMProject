import { dateLocale } from "@/GameInterface/formatDate";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadGameSave, deleteGameSave, forgetSession } from "@/GameInterface/gameSession";
import { SettingsOverlay } from "@/GameInterface/SettingsScreen";
import { GAME_VERSION as CURRENT_VERSION } from "@/Domain/saveVersion";
import { useChangelogNotice } from "@/GameInterface/changelog/useChangelogNotice";
import { ChangelogModal } from "@/GameInterface/Components/ChangelogModal";
import { ChangelogNoticePill } from "@/GameInterface/Components/ChangelogNoticePill";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";
import { worldApi } from "@/GameInterface/World/worldApi";
import { WORLD } from "@/Domain/multiplayer/worldConfig";
import { brasiliaTime } from "@/GameInterface/World/publicTime";
import type { PublicWorldInfo } from "@/types/multiplayerTypes";
import { LanguageSwitch } from "@/GameInterface/Components/LanguageSwitch";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { FriendsButton } from "@/GameInterface/Social/FriendsButton";

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
  /** Game version that created the save; absent = before 4.22 (`@/Domain/saveVersion`). */
  gameVersion?: string;
  /** False when the save predates `MIN_COMPATIBLE_SAVE_VERSION`: loading asks first. */
  compatible?: boolean;
  role?: "owner" | "member";
  mode?: "solo" | "multi";
  world?: { phase: "lobby" | "running"; kind?: "friends" | "public" };
  /** Members of a world of friends (`GET /api/saves`). */
  members?: number;
}

export function StartScreen() {
  const { t, i18n } = useTranslation();
  const [saves, setSaves] = useState<SaveEntry[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const { showNotice: showChangelogNotice, markSeen: markChangelogSeen } = useChangelogNotice();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pendingDeleteSave = saves.find((s) => s.id === pendingDeleteId) ?? null;
  const [pendingOutdatedId, setPendingOutdatedId] = useState<string | null>(null);
  const [pendingLeaveId, setPendingLeaveId] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const pendingLeaveSave = saves.find((s) => s.id === pendingLeaveId) ?? null;
  const pendingOutdatedSave = saves.find((s) => s.id === pendingOutdatedId) ?? null;
  const [publicWorld, setPublicWorld] = useState<PublicWorldInfo | null>(null);
  const social = useSocial();

  function openChangelog() {
    setIsChangelogOpen(true);
    markChangelogSeen();
  }

  const MAX_SAVES = 5;
  const atLimit = saves.filter((s) => s.role !== "member").length >= MAX_SAVES;

  useEffect(() => {
    fetch("/api/saves")
      .then((r) => r.json())
      .then((data: SaveEntry[]) => setSaves(data))
      .catch(() => {});
    void worldApi.publicInfo().then((r) => {
      if (r.ok) setPublicWorld(r.data);
    });
  }, []);

  /** "Continue" in the public world block: the save of the list (it may ask about the version first). */
  function continuePublic(info: PublicWorldInfo) {
    const save = saves.find((s) => s.id === info.saveId);
    if (save) requestLoad(save);
    else void handleLoad(info.saveId);
  }

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      await loadGameSave(id);
      const save = saves.find((s) => s.id === id);
      window.location.href = save?.world?.phase === "lobby" ? "/world" : "/dashboard";
    } catch {
      setLoadingId(null);
    }
  }

  /** An outdated save asks for confirmation before loading. */
  function requestLoad(save: SaveEntry) {
    if (save.compatible === false) setPendingOutdatedId(save.id);
    else void handleLoad(save.id);
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

  async function handleConfirmLeave() {
    if (!pendingLeaveId) return;
    setDeleting(true);
    try {
      const r = await worldApi.leave(pendingLeaveId);
      if (r.ok) {
        setSaves((prev) => prev.filter((s) => s.id !== pendingLeaveId));
        forgetSession(pendingLeaveId);
        setLeaveError(null);
      } else {
        setLeaveError(r.error);
      }
      setPendingLeaveId(null);
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(dateLocale(i18n.language), { month: "short", day: "numeric", year: "numeric" });
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

        {publicWorld && (
          <div className="mt-6 flex items-center gap-3 rounded-md border border-border bg-card py-3 pl-4">
            <Icon name="globe" size={16} className="shrink-0 text-chart-2" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-foreground tabular-nums">
                {t("startScreen.publicWorld", { count: publicWorld.members, max: publicWorld.max })}
              </div>
              <div className="truncate text-sm text-muted-foreground tabular-nums">
                {t("startScreen.publicNext", { time: brasiliaTime(publicWorld.nextSlotAt, i18n.language) })}
              </div>
            </div>
            {publicWorld.joined ? (
              <Button className="w-24 shrink-0 px-0" onClick={() => continuePublic(publicWorld)} disabled={loadingId !== null}>
                {t("startScreen.continue")}
              </Button>
            ) : (
              <Button
                className="w-24 shrink-0 px-0"
                onClick={() => { window.location.href = "/new-game?mode=public"; }}
                disabled={publicWorld.members >= publicWorld.max}
              >
                {publicWorld.members >= publicWorld.max ? t("startScreen.publicFull") : t("startScreen.publicJoin")}
              </Button>
            )}
            {/* Same width as the delete / leave button of a saved game, so the blue buttons line up. */}
            <span aria-hidden className="w-10 shrink-0" />
          </div>
        )}

        {social.worldInvites.length > 0 && (
          <>
            <SectionTitle className="mt-8 mb-3">{t("world.invites.title")}</SectionTitle>
            <ul className="m-0 list-none border-b border-border bg-transparent p-0">
              {social.worldInvites.map((inv) => (
                <li key={inv.saveId} className="flex items-center gap-3 border-t border-border py-3">
                  <Icon name="users" size={16} className="shrink-0 text-chart-2" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-foreground">
                      {t("world.leagueOf", { owner: inv.from })}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{t("startScreen.inviteHint")}</div>
                  </div>
                  <Button
                    className="w-24 shrink-0 px-0"
                    onClick={() => { window.location.href = `/join/${inv.code}`; }}
                    disabled={loadingId !== null}
                  >
                    {t("world.invites.accept")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void social.declineWorldInvite(inv.saveId)}
                    aria-label={t("world.invites.decline")}
                    title={t("world.invites.decline")}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-destructive"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <SectionTitle className="mt-8 mb-3">{t("startScreen.savedGames")}</SectionTitle>
        {leaveError && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {t(`world.errors.${leaveError}`)}
          </p>
        )}
        {saves.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("startScreen.noSavedGames")}</p>
        ) : (
          <ul className="m-0 list-none border-b border-border bg-transparent p-0">
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
                  <div className="flex min-w-0 overflow-hidden text-sm text-muted-foreground">
                    <span className="min-w-[3ch] truncate">{save.leagueName}</span>
                    {save.unemployed && <span className="shrink-0 whitespace-nowrap text-destructive">&nbsp;· {t("startScreen.unemployed")}</span>}
                    <span className="shrink-0 whitespace-nowrap tabular-nums">&nbsp;· {formatDate(save.updatedAt)}</span>
                    {save.gameVersion && save.compatible !== false && (
                      <span className="shrink-0 whitespace-nowrap tabular-nums">
                        &nbsp;· {t("startScreen.saveVersion", { version: save.gameVersion })}
                      </span>
                    )}
                  </div>
                  {save.mode === "multi" && save.world?.kind === "public" && (
                    <div className="truncate text-sm text-chart-2">{t("world.public.name")}</div>
                  )}
                  {save.mode === "multi" && save.world?.kind !== "public" && (
                    <div className="truncate text-sm text-muted-foreground tabular-nums">
                      <span className="text-chart-2">
                        {t("startScreen.withFriends", { count: save.members ?? 1, max: WORLD.MAX_MEMBERS })}
                      </span>
                      {" · "}
                      {save.role === "owner" ? t("startScreen.owner") : t("startScreen.member")}
                      {save.world?.phase === "lobby" && <> · {t("startScreen.lobby")}</>}
                    </div>
                  )}
                  {save.compatible === false && (
                    <div className="flex items-center gap-1 text-sm text-destructive">
                      <Icon name="alert" size={16} />
                      <span className="truncate tabular-nums">
                        {save.gameVersion
                          ? t("startScreen.outdatedVersion", { version: save.gameVersion })
                          : t("startScreen.outdatedUnknown")}
                      </span>
                    </div>
                  )}
                </div>
                <Button className="w-24 shrink-0 px-0" onClick={() => requestLoad(save)} disabled={loadingId !== null}>
                  {t("startScreen.continue")}
                </Button>
                {save.role === "member" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLeaveError(null);
                      setPendingLeaveId(save.id);
                    }}
                    disabled={loadingId !== null}
                    aria-label={t("startScreen.leave")}
                    title={t("startScreen.leave")}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-destructive disabled:opacity-50"
                  >
                    <Icon name="log-out" size={16} />
                  </button>
                ) : (
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
                )}
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
        <LanguageSwitch />
        <FriendsButton />
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
            ? pendingDeleteSave.mode === "multi" && (pendingDeleteSave.members ?? 1) > 1
              ? t("startScreen.deleteWorldBody", {
                  clubName: pendingDeleteSave.clubName,
                  leagueName: pendingDeleteSave.leagueName,
                  count: (pendingDeleteSave.members ?? 1) - 1,
                })
              : t("startScreen.deleteConfirmBody", {
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
      <ConfirmDialog
        open={pendingLeaveSave !== null}
        title={t("startScreen.leaveConfirmTitle")}
        body={pendingLeaveSave ? t("startScreen.leaveConfirmBody", { clubName: pendingLeaveSave.clubName }) : ""}
        confirmLabel={t("startScreen.leave")}
        onConfirm={handleConfirmLeave}
        onClose={() => setPendingLeaveId(null)}
        busy={deleting}
      />
      <ConfirmDialog
        open={pendingOutdatedSave !== null}
        title={t("startScreen.outdatedTitle")}
        body={
          pendingOutdatedSave
            ? t("startScreen.outdatedBody", {
                clubName: pendingOutdatedSave.clubName,
                version: pendingOutdatedSave.gameVersion ?? t("startScreen.outdatedUnknownVersion"),
              })
            : ""
        }
        confirmLabel={t("startScreen.outdatedLoad")}
        onConfirm={() => {
          const id = pendingOutdatedId;
          setPendingOutdatedId(null);
          if (id) void handleLoad(id);
        }}
        onClose={() => setPendingOutdatedId(null)}
        busy={loadingId !== null}
      />
    </div>
  );
}
