import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
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
import { StandingsTable } from "@/GameInterface/World/StandingsTable";
import { seatManagerId } from "@/Domain/seats/seats";
import { GroupAdvanceBand, MemberAdvanceStatus } from "@/GameInterface/World/GroupAdvanceBand";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import type { WorldDeadline, WorldMemberView, WorldView } from "@/types/multiplayerTypes";
import type { StandingsView } from "@/types/standingsTypes";

type DeadlineKey = "12" | "24" | "48" | "none";
const toKey = (d: WorldDeadline): DeadlineKey => (d === null ? "none" : (String(d) as DeadlineKey));
const fromKey = (k: DeadlineKey): WorldDeadline => (k === "none" ? null : (Number(k) as 12 | 24 | 48));

type WorldTab = "league" | "standings";
const initialTab = (): WorldTab =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "standings" ? "standings" : "league";

type Pending = { kind: "remove" | "owner"; member: WorldMemberView } | { kind: "leave" } | { kind: "code" } | null;

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
  const [copyFailed, setCopyFailed] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<WorldTab>(initialTab);
  const [standings, setStandings] = useState<StandingsView | null>(null);
  const [standingsError, setStandingsError] = useState<WorldApiError | null>(null);

  const load = useCallback(async () => {
    if (!saveId) return;
    const r = await worldApi.view(saveId);
    if (r.ok) { setView(r.data); setError(null); }
    else if (r.error === "notMember" || r.error === "notFound") { forgetSession(saveId); window.location.href = "/start"; }
    else setError(r.error);
  }, [saveId]);

  useEffect(() => { void load(); }, [load, social.worldVersion]);

  // The standings tab (multiplayer part 5a): only with 2+ managers; reloads with the league's member events.
  const showTabs = (view?.members.length ?? 0) >= 2;
  const activeTab: WorldTab = showTabs ? tab : "league";
  useEffect(() => {
    if (!saveId || activeTab !== "standings") return;
    let cancelled = false;
    void worldApi.standings(saveId).then((r) => {
      if (cancelled) return;
      if (r.ok) { setStandings(r.data); setStandingsError(null); } else setStandingsError(r.error);
    });
    return () => { cancelled = true; };
  }, [saveId, activeTab, social.worldVersion]);

  function changeTab(next: WorldTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "standings") url.searchParams.set("tab", "standings");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

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
    else if (pending.kind === "code") await run(worldApi.newCode(saveId), () => { setCopied(false); setCopyFailed(false); });
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
      setCopyFailed(false);
    } catch {
      setCopied(false);
      linkRef.current?.select();
      setCopyFailed(true);
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

      {view?.phase !== "lobby" && <GroupAdvanceBand />}

      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!view && !error && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {view && showTabs && (
        <SegmentedTabs<WorldTab>
          aria-label={t("world.standings.tabsLabel")}
          active={activeTab}
          onChange={changeTab}
          tabs={[
            { key: "league", label: t("world.standings.tabLeague") },
            { key: "standings", label: t("world.standings.tab") },
          ]}
        />
      )}

      {view && activeTab === "standings" && (
        <section className="flex flex-col gap-3">
          <SectionTitle>{t("world.standings.title")}</SectionTitle>
          <p className="text-sm text-muted-foreground m-0">{t("world.standings.hint")}</p>
          {standingsError && <Notice kind="error">{t(`world.errors.${standingsError}`)}</Notice>}
          {!standings && !standingsError && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
          {standings && <StandingsTable view={standings} mySeatId={view.mySeatId} />}
        </section>
      )}

      {view && (
        <>
          {activeTab === "league" && (
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
                    {view.phase !== "lobby" && <th className={`${TABLE_CELL.head} text-left`}>{t("world.advance.status.column")}</th>}
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
                        {view.phase !== "lobby" && (
                          <td className={TABLE_CELL.body}><MemberAdvanceStatus seatId={m.seatId} /></td>
                        )}
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
                ref={linkRef}
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
                  <Button variant="secondary" onClick={() => setPending({ kind: "code" })} disabled={busy}>
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
            {copyFailed && <Notice kind="warning">{t("world.invite.copyFailed")}</Notice>}
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
            <Button
              variant="danger"
              onClick={() => setPending({ kind: "leave" })}
              disabled={owner && view.members.length > 1}
              title={owner && view.members.length > 1 ? t("world.leave.transferFirst") : undefined}
            >
              <Icon name="log-out" size={16} />
              {t("world.leave.button")}
            </Button>
            {owner && view.members.length > 1 && (
              <p className="text-sm text-muted-foreground m-0">{t("world.leave.transferFirst")}</p>
            )}
          </section>
          </>
          )}

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
                : pending?.kind === "code" ? t("world.invite.newCodeConfirmTitle")
                : pending?.kind === "owner" ? t("world.members.transferConfirmTitle")
                : t("world.leave.confirmTitle")
            }
            body={
              pending?.kind === "remove" ? (pending.member.unemployed
                  ? t("world.members.removeConfirmBodyNoClub", { manager: pending.member.managerName })
                  : t("world.members.removeConfirmBody", { manager: pending.member.managerName, club: pending.member.clubName }))
                : pending?.kind === "code" ? t("world.invite.newCodeConfirmBody")
                : pending?.kind === "owner" ? t("world.members.transferConfirmBody", { manager: pending.member.managerName })
                : owner && view.members.length === 1 ? t("world.leave.deleteBody")
                : t("world.leave.confirmBody")
            }
            confirmLabel={
              pending?.kind === "remove" ? t("world.members.remove")
                : pending?.kind === "code" ? t("world.invite.newCode")
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
