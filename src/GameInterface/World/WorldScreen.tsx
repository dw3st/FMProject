import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { Label } from "@/GameInterface/ui/Label";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { PreSeasonLoadingScreen } from "@/GameInterface/PreSeasonLoadingScreen";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { forgetSession } from "@/GameInterface/gameSession";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";
import { joinLink } from "@/GameInterface/World/worldNav";
import { InviteFriendsModal } from "@/GameInterface/World/InviteFriendsModal";
import { seatManagerId } from "@/Domain/seats/seats";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import type { WorldDeadline, WorldMemberView, WorldView } from "@/types/multiplayerTypes";

type DeadlineKey = "12" | "24" | "48" | "none";
const toKey = (d: WorldDeadline): DeadlineKey => (d === null ? "none" : (String(d) as DeadlineKey));
const fromKey = (k: DeadlineKey): WorldDeadline => (k === "none" ? null : (Number(k) as 12 | 24 | 48));

type Pending = { kind: "remove" | "owner"; member: WorldMemberView } | { kind: "leave" } | null;

/** "YOUR LEAGUE": members, invite, deadline, start, leave (`.claude/rules/game/multiplayer.md`, part 2). */
export function WorldScreen() {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const social = useSocial();
  const saveId = session?.saveId ?? "";
  const [view, setView] = useState<WorldView | null>(null);
  const [error, setError] = useState<WorldApiError | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!saveId) return;
    const r = await worldApi.view(saveId);
    if (r.ok) setView(r.data);
    else setError(r.error);
  }, [saveId]);

  useEffect(() => { void load(); }, [load, social.worldVersion]);

  if (starting) return <PreSeasonLoadingScreen />;

  const owner = view?.myRole === "owner";
  const link = view ? joinLink(window.location.origin, view.inviteCode) : "";

  async function run(p: Promise<{ ok: boolean; error?: WorldApiError }>, after?: () => void) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) setError(r.error ?? "generic");
    else { setError(null); after?.(); await load(); }
  }

  async function start() {
    setStarting(true);
    const r = await worldApi.start(saveId);
    if (r.ok) window.location.href = "/dashboard";
    else { setStarting(false); setError(r.error); }
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === "remove") await run(worldApi.remove(saveId, pending.member.seatId));
    else if (pending.kind === "owner") await run(worldApi.transferOwner(saveId, pending.member.seatId));
    else {
      setBusy(true);
      const r = await worldApi.leave(saveId);
      setBusy(false);
      if (r.ok) { forgetSession(saveId); window.location.href = "/start"; return; }
      setError(r.error);
    }
    setPending(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <ScreenContainer>
      <ScreenTitle
        accent={t("screenTitles.world.accent")}
        subtitle={view ? `${view.name} · ${t(`world.status.${view.phase}`)} · ${t("world.members.count", { count: view.members.length, max: view.max })}` : undefined}
      >
        {t("screenTitles.world.main")}
      </ScreenTitle>

      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!view && !error && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {view && (
        <>
          <section className="flex flex-col gap-3">
            <SectionTitle>{t("world.members.title")}</SectionTitle>
            <div className={TABLE_STYLE.shell}>
              <table className="w-full">
                <thead className={TABLE_STYLE.head}>
                  <tr>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.members.manager")}</th>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.members.club")}</th>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.members.role")}</th>
                    {owner && <th className={TABLE_CELL.head} aria-label={t("world.members.actions")} />}
                  </tr>
                </thead>
                <tbody className={TABLE_STYLE.body}>
                  {view.members.map((m) => {
                    const me = m.seatId === view.mySeatId;
                    return (
                      <tr key={m.seatId} className={`${TABLE_STYLE.row} ${me ? TABLE_STYLE.rowHighlight : ""}`}>
                        <td className={TABLE_CELL.body}>
                          <div className="flex items-center gap-3 min-w-0">
                            <ManagerFaceImage
                              manager={{ id: seatManagerId(m.seatId), name: m.managerName, face: m.face, nationality: managerFaceCountry(m.nationalityIso) }}
                              clubColors={m.clubColors}
                              size={32}
                            />
                            <div className="min-w-0">
                              <div className={me ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name}>{m.managerName}</div>
                              {m.nickname && <div className="text-sm text-muted-foreground truncate">{m.nickname}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={TABLE_CELL.body}>
                          {m.unemployed ? (
                            <span className="text-sm text-muted-foreground">{t("world.members.unemployed")}</span>
                          ) : (
                            <div className="flex items-center gap-3 min-w-0">
                              <ClubLogo logoUrl={squadLogoUrl(m.clubId)} primaryColor={m.clubColors[0]} secondaryColor={m.clubColors[1]} className={TABLE_STYLE.crest} />
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">{m.clubName}</div>
                                <div className="text-sm text-muted-foreground truncate">{m.leagueName}</div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className={`${TABLE_CELL.body} text-sm text-muted-foreground`}>
                          {m.role === "owner" ? t("world.members.owner") : t("world.members.member")}
                        </td>
                        {owner && (
                          <td className={`${TABLE_CELL.body} text-right`}>
                            {!me && (
                              <div className="flex items-center justify-end gap-3">
                                <Button variant="secondary" flush onClick={() => setPending({ kind: "owner", member: m })}>{t("world.members.transfer")}</Button>
                                <Button variant="danger" flush onClick={() => setPending({ kind: "remove", member: m })}>{t("world.members.remove")}</Button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>{t("world.invite.title")}</SectionTitle>
            <Label htmlFor="world-invite-link">{t("world.invite.link")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="world-invite-link"
                readOnly
                value={link}
                className="h-10 flex-1 min-w-[280px] rounded border border-border bg-transparent px-3 text-sm text-foreground tabular-nums"
              />
              <Button onClick={() => void copyLink()}>
                <Icon name="copy" size={16} />
                {copied ? t("world.invite.copied") : t("world.invite.copy")}
              </Button>
              {owner && (
                <>
                  <Button variant="secondary" onClick={() => void run(worldApi.newCode(saveId), () => setCopied(false))} disabled={busy}>
                    <Icon name="refresh" size={16} />
                    {t("world.invite.newCode")}
                  </Button>
                  <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                    <Icon name="user-plus" size={16} />
                    {t("world.invite.friends")}
                  </Button>
                </>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle>{t("world.deadline.title")}</SectionTitle>
            <p className="text-sm text-muted-foreground m-0">{t("world.deadline.hint")}</p>
            {owner ? (
              <OptionChips<DeadlineKey>
                value={toKey(view.deadlineHours)}
                onChange={(k) => void run(worldApi.settings(saveId, fromKey(k)))}
                disabled={busy}
                options={[
                  { key: "12", label: t("world.deadline.hours", { count: 12 }) },
                  { key: "24", label: t("world.deadline.hours", { count: 24 }) },
                  { key: "48", label: t("world.deadline.hours", { count: 48 }) },
                  { key: "none", label: t("world.deadline.none") },
                ]}
              />
            ) : (
              <p className="text-sm text-foreground m-0">
                {view.deadlineHours === null ? t("world.deadline.none") : t("world.deadline.hours", { count: view.deadlineHours })}
              </p>
            )}
          </section>

          <section className="flex flex-wrap items-center gap-3">
            {view.phase === "lobby" && owner && (
              <Button onClick={() => void start()}>{t("world.start.button")}</Button>
            )}
            {view.phase === "lobby" && !owner && (
              <p className="text-sm text-muted-foreground m-0">{t("world.start.waiting")}</p>
            )}
            {view.members.length >= 2 && (
              <Button variant="secondary" onClick={() => social.openChat(`world:${saveId}`)}>
                <Icon name="message-square" size={16} />
                {t("world.chat")}
              </Button>
            )}
            <Button variant="danger" onClick={() => setPending({ kind: "leave" })}>
              <Icon name="log-out" size={16} />
              {t("world.leave.button")}
            </Button>
          </section>

          <InviteFriendsModal
            saveId={saveId}
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            members={view.members.map((m) => m.nickname).filter((n): n is string => !!n)}
          />
          <ConfirmDialog
            open={pending !== null}
            title={
              pending?.kind === "remove" ? t("world.members.removeConfirmTitle")
                : pending?.kind === "owner" ? t("world.members.transferConfirmTitle")
                : t("world.leave.confirmTitle")
            }
            body={
              pending?.kind === "remove" ? t("world.members.removeConfirmBody", { manager: pending.member.managerName, club: pending.member.clubName })
                : pending?.kind === "owner" ? t("world.members.transferConfirmBody", { manager: pending.member.managerName })
                : owner && view.members.length === 1 ? t("world.leave.deleteBody")
                : t("world.leave.confirmBody")
            }
            confirmLabel={
              pending?.kind === "remove" ? t("world.members.remove")
                : pending?.kind === "owner" ? t("world.members.transfer")
                : t("world.leave.button")
            }
            onConfirm={() => void confirmPending()}
            onClose={() => setPending(null)}
            busy={busy}
          />
        </>
      )}
    </ScreenContainer>
  );
}
