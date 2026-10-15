import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { dmRoomParam } from "@/Domain/social/rooms";
import { Icon } from "@/GameInterface/Icons";
import { FRIENDS_BUTTON_ID } from "@/GameInterface/Social/FriendsButton";
import { socialApi, type ApiResult, type RequestAnswer } from "@/GameInterface/Social/socialApi";
import { groupFriends } from "@/GameInterface/Social/socialState";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { Button } from "@/GameInterface/ui/Button";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TextField } from "@/GameInterface/ui/TextField";
import type { FriendStatus, FriendView, SearchResult, SocialErrorCode } from "@/types/socialTypes";

type PanelTab = "friends" | "requests" | "add";

const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent";
const GROUP_LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const BADGE =
  "min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold leading-5 text-center tabular-nums";
const DOT: Record<FriendStatus, string> = {
  playing: "bg-primary",
  online: "bg-chart-2",
  offline: "bg-muted-foreground/50",
};

/** Friends panel above the status bar, bottom right (Steam style). Escape closes it. */
export function FriendsPanel() {
  const { t } = useTranslation();
  const s = useSocial();
  const [tab, setTab] = useState<PanelTab>("friends");
  const { panelOpen, setPanelOpen } = s;
  const panelRef = useRef<HTMLElement>(null);

  // Opening moves the focus to the panel's first control; closing gives it back to the Friends button.
  useEffect(() => {
    if (!panelOpen) return;
    panelRef.current?.querySelector<HTMLElement>("button, input, textarea, select, [tabindex]:not([tabindex='-1'])")?.focus();
    return () => document.getElementById(FRIENDS_BUTTON_ID)?.focus();
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, setPanelOpen]);

  if (!panelOpen) return null;
  const me = s.me;
  const requestCount = s.lists.incoming.length + s.worldInvites.length;

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-label={t("social.panelTitle")}
      className="fixed bottom-14 right-6 z-40 w-[340px] max-h-[60vh] flex flex-col rounded-md border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="font-display font-black uppercase text-xl leading-none">{t("social.panelTitle")}</h2>
        <button type="button" className={ICON_BUTTON} onClick={() => setPanelOpen(false)} aria-label={t("social.close")} title={t("social.close")}>
          <Icon name="close" size={16} />
        </button>
      </header>
      {me === null ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("social.loading")}</p>
      ) : !me.nickname ? (
        <NicknameForm />
      ) : (
        <>
          <IdentityRow />
          <div className="px-4 pt-3">
            <SegmentedTabs
              fill
              compact
              aria-label={t("social.panelTitle")}
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "friends", label: t("social.tabs.friends") },
                { key: "requests", label: requestCount > 0 ? `${t("social.tabs.requests")} · ${requestCount}` : t("social.tabs.requests") },
                { key: "add", label: t("social.tabs.add") },
              ]}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {tab === "friends" ? <FriendsTab /> : tab === "requests" ? <RequestsTab /> : <AddTab />}
          </div>
        </>
      )}
    </section>
  );
}

function IdentityRow() {
  const { t } = useTranslation();
  const { me } = useSocial();
  const [copied, setCopied] = useState(false);
  if (!me?.nickname) return null;
  const copy = () => {
    void navigator.clipboard
      ?.writeText(me.friendCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <div className="px-4 pt-3 flex flex-col gap-1">
      <span className="font-semibold text-foreground truncate">{me.nickname}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t("social.yourCode")} <span className="font-semibold text-foreground tabular-nums">{me.friendCode}</span>
        </span>
        <Button variant="secondary" flush onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={16} />
          {copied ? t("social.copied") : t("social.copy")}
        </Button>
      </div>
    </div>
  );
}

function NicknameForm() {
  const { t } = useTranslation();
  const { setMe } = useSocial();
  const [value, setValue] = useState("");
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await socialApi.setNickname(value);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMe(r.data);
  }

  return (
    <form onSubmit={(e) => void save(e)} className="px-4 py-3 flex flex-col gap-3">
      <h3 className="font-display font-black uppercase text-xl leading-none">{t("social.nickname.title")}</h3>
      <TextField
        id="social-nickname"
        variant="box"
        label={t("social.nickname.label")}
        value={value}
        maxLength={20}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="text-sm text-muted-foreground">{t("social.nickname.hint")}</p>
      <p className="text-sm text-muted-foreground">{t("social.nicknameFinal")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`social.errors.${error}`)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || value.trim().length < 3}>
          {t("social.nickname.save")}
        </Button>
      </div>
    </form>
  );
}

function FriendsTab() {
  const { t } = useTranslation();
  const s = useSocial();
  const groups = groupFriends(s.lists.friends);
  if (s.lists.friends.length === 0 && s.lists.worlds.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.noFriends")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {s.lists.worlds.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className={GROUP_LABEL}>{t("social.groups.worlds")}</p>
          {s.lists.worlds.map((w) => {
            const unread = s.unread[w.room] ?? 0;
            return (
              <button
                key={w.room}
                type="button"
                onClick={() => s.openChat(w.room)}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left cursor-pointer border-0 bg-transparent hover:bg-secondary/30"
              >
                <Icon name="globe" size={16} className="text-muted-foreground" />
                <span className="font-semibold text-foreground truncate">{w.name || t("social.chat.world")}</span>
                {unread > 0 && <span className={`ml-auto ${BADGE}`}>{unread}</span>}
              </button>
            );
          })}
        </div>
      )}
      {(["playing", "online", "offline"] as const).map(
        (k) =>
          groups[k].length > 0 && (
            <div key={k} className="flex flex-col gap-1">
              <p className={GROUP_LABEL}>
                {t(`social.groups.${k}`)} · {groups[k].length}
              </p>
              {groups[k].map((f) => (
                <FriendRow key={f.nickname} friend={f} />
              ))}
            </div>
          ),
      )}
    </div>
  );
}

function FriendRow({ friend }: { friend: FriendView }) {
  const { t } = useTranslation();
  const s = useSocial();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"unfriend" | "block" | null>(null);
  const room = dmRoomParam(friend.nickname);
  const unread = s.unread[room] ?? 0;
  const statusText =
    friend.status === "playing" && friend.club
      ? t("social.status.playing", { club: friend.club })
      : t(`social.status.${friend.status === "playing" ? "online" : friend.status}`);

  async function run(kind: "unfriend" | "block") {
    if (confirm !== kind) {
      setConfirm(kind);
      return;
    }
    const r = kind === "unfriend" ? await socialApi.unfriend(friend.nickname) : await socialApi.block(friend.nickname);
    if (r.ok) {
      s.closeChat(room);
      await s.refreshFriends();
    }
    setConfirm(null);
    setMenu(false);
  }

  return (
    <div className="rounded-md hover:bg-secondary/30">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => s.openChat(room)}
          className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left cursor-pointer border-0 bg-transparent"
        >
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[friend.status]}`} aria-hidden="true" />
          <span className="min-w-0 flex flex-col">
            <span className="font-semibold text-foreground truncate">{friend.nickname}</span>
            <span className="text-sm text-muted-foreground truncate">{statusText}</span>
          </span>
          {unread > 0 && (
            <span className={`ml-auto ${BADGE}`} aria-label={t("social.unreadBadge", { count: unread })}>
              {unread}
            </span>
          )}
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-expanded={menu}
          aria-label={t("social.actions")}
          title={t("social.actions")}
          onClick={() => {
            setMenu(!menu);
            setConfirm(null);
          }}
        >
          <Icon name="more" size={16} />
        </button>
      </div>
      {menu && (
        <div className="flex items-center gap-4 px-2 pb-2">
          <Button variant="secondary" flush onClick={() => void run("unfriend")}>
            {confirm === "unfriend" ? t("social.confirmUnfriend") : t("social.unfriend")}
          </Button>
          <Button variant="danger" flush onClick={() => void run("block")}>
            <Icon name="ban" size={16} />
            {confirm === "block" ? t("social.confirmBlock") : t("social.block")}
          </Button>
        </div>
      )}
    </div>
  );
}

function RequestsTab() {
  const { t } = useTranslation();
  const s = useSocial();
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const { incoming, outgoing } = s.lists;

  async function act(p: Promise<ApiResult<unknown>>) {
    const r = await p;
    setError(r.ok ? null : r.error);
    await s.refreshFriends();
  }

  if (incoming.length === 0 && outgoing.length === 0 && s.worldInvites.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("social.requests.none")}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`social.errors.${error}`)}
        </p>
      )}
      {s.worldInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL}>
            {t("world.invites.title")} · {s.worldInvites.length}
          </p>
          {s.worldInvites.map((inv) => (
            <div key={inv.saveId} className="flex items-center justify-between gap-2">
              <span className="text-sm text-foreground truncate">{t("world.invites.from", { from: inv.from, name: inv.name })}</span>
              <div className="flex items-center gap-3">
                <Button onClick={() => { window.location.href = `/join/${inv.code}`; }}>{t("world.invites.accept")}</Button>
                <Button variant="secondary" flush onClick={() => void s.declineWorldInvite(inv.saveId)}>
                  {t("world.invites.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {incoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL}>
            {t("social.requests.incoming")} · {incoming.length}
          </p>
          {incoming.map((r) => (
            <div key={r.nickname} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground truncate">{r.nickname}</span>
              <div className="flex items-center gap-3">
                <Button onClick={() => void act(socialApi.accept(r.nickname))}>{t("social.requests.accept")}</Button>
                <Button variant="secondary" flush onClick={() => void act(socialApi.decline(r.nickname))}>
                  {t("social.requests.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={GROUP_LABEL}>
            {t("social.requests.outgoing")} · {outgoing.length}
          </p>
          {outgoing.map((r) => (
            <div key={r.nickname} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground truncate">{r.nickname}</span>
              <Button variant="secondary" flush onClick={() => void act(socialApi.cancel(r.nickname))}>
                {t("social.requests.cancel")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTab() {
  const { t } = useTranslation();
  const s = useSocial();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string[] | null>(null);

  useEffect(() => {
    void socialApi.blocks().then((r) => setBlocked(r.ok ? r.data.blocked.map((b) => b.nickname) : []));
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults(null);
      return;
    }
    // A slower answer to an older query must not overwrite the newer one: the cleanup marks it stale.
    let stale = false;
    const timer = setTimeout(() => {
      void socialApi.search(query).then((r) => {
        if (!stale) setResults(r.ok ? r.data.results : []);
      });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q]);

  function report(r: ApiResult<RequestAnswer>) {
    if (r.ok) {
      const key = r.data.status === "friends" ? "social.add.befriended" : "social.add.requested";
      setFeedback({ ok: true, text: t(key, { nickname: r.data.nickname }) });
    } else {
      setFeedback({ ok: false, text: t(`social.errors.${r.error}`) });
    }
  }

  async function add(nickname: string) {
    const r = await socialApi.requestByNickname(nickname);
    report(r);
    if (!r.ok) return;
    const relation = r.data.status === "friends" ? "friend" : "pending_out";
    setResults((prev) => prev?.map((x) => (x.nickname === nickname ? { ...x, relation } : x)) ?? null);
    await s.refreshFriends();
  }

  async function addByCode(e: FormEvent) {
    e.preventDefault();
    const r = await socialApi.requestByCode(code);
    report(r);
    if (r.ok) {
      setCode("");
      await s.refreshFriends();
    }
  }

  async function unblock(nickname: string) {
    const r = await socialApi.unblock(nickname);
    if (r.ok) setBlocked((prev) => prev?.filter((n) => n !== nickname) ?? null);
  }

  const typed = q.trim().length;
  return (
    <div className="flex flex-col gap-4">
      <TextField
        id="social-search"
        variant="box"
        label={t("social.add.searchLabel")}
        value={q}
        maxLength={20}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
      />
      {typed > 0 && typed < 3 && <p className="text-sm text-muted-foreground">{t("social.add.searchHint")}</p>}
      {results &&
        (results.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("social.add.noResults")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((r) => (
              <li key={r.nickname} className="flex items-center justify-between gap-2 py-1">
                <span className="font-semibold text-foreground truncate">{r.nickname}</span>
                {r.relation === "none" || r.relation === "pending_in" ? (
                  <Button onClick={() => void add(r.nickname)}>
                    {t(r.relation === "none" ? "social.add.add" : "social.add.accept")}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t(r.relation === "friend" ? "social.add.friend" : "social.add.sent")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ))}
      <form onSubmit={(e) => void addByCode(e)} className="flex items-end gap-3">
        <TextField
          id="social-code"
          variant="box"
          className="flex-1"
          label={t("social.add.codeLabel")}
          placeholder="FM-XXXX-XXXX"
          value={code}
          maxLength={14}
          autoComplete="off"
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={code.trim().length < 8}>
          {t("social.add.sendCode")}
        </Button>
      </form>
      {feedback && (
        <p role="status" className={`text-sm ${feedback.ok ? "text-chart-2" : "text-destructive"}`}>
          {feedback.text}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className={GROUP_LABEL}>{t("social.add.blocked")}</p>
        {blocked !== null &&
          (blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("social.add.noBlocked")}</p>
          ) : (
            blocked.map((n) => (
              <div key={n} className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground truncate">{n}</span>
                <Button variant="secondary" flush onClick={() => void unblock(n)}>
                  {t("social.add.unblock")}
                </Button>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
