import { ACHIEVEMENTS } from "@/Domain/achievements/achievementsConfig";
import { RetiredList } from "@/GameInterface/StatsScreen";
import type { LeagueData } from "@/types/playerTypes";
import { DecorStylePicker } from "@/GameInterface/Achievements/DecorStylePicker";
import { squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { StadiumDecorPreview } from "@/GameInterface/Achievements/StadiumDecorPreview";
import { useCallback, useEffect, useMemo, useState } from "react";
import { seatManagerId } from "@/Domain/seats/seats";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { Chip } from "@/GameInterface/ui/Chip";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { LegendRoulette } from "@/GameInterface/Achievements/LegendRoulette";
import { AssetsTab } from "@/GameInterface/Achievements/AssetsTab";
import { DecorShopSection } from "@/GameInterface/Achievements/DecorShop";
import { BetsTab } from "@/GameInterface/Achievements/BetsTab";
import { TextField } from "@/GameInterface/ui/TextField";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { Flag } from "@/GameInterface/Components/Flag";
import { formatEuros } from "@/Domain/money";
import { nationalityFlagCode, NATIONALITY_NAMES } from "@/Domain/world/nationalityFlag";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { formatEffect } from "@/GameInterface/Staff/staffApi";
import { positionLabel } from "@/GameInterface/positionHelpers";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import {
  BADGE_ICON, FRAME_RING, MONEY_TRACKS, TIER_TEXT, achievementsCall, type AchievementsData,
} from "@/GameInterface/Achievements/achievementsApi";
import {
  ACHIEVEMENT_CATEGORIES, MANAGER_ATTRIBUTES, type Badge, type Frame, type StadiumDecor, type TrackId, type TrackView,
} from "@/types/achievementTypes";

// The manager's screen (user request, option A, 8.9.36): profile, achievements, shop (points and money), bets.
// The shop split into its own tabs (tester report, 8.9.38: one long page needed scrolling): players, legends, belongings.
// The stadium decorations got their own tab (9.1.1, user request).
type Tab = "profile" | "list" | "players" | "legends" | "belongings" | "stadium" | "bets";
const TABS: Tab[] = ["profile", "list", "players", "legends", "belongings", "stadium", "bets"];
/** Links from before the regrouping. */
const OLD_TABS: Record<string, Tab> = { manager: "profile", assets: "belongings", shop: "players" };
const TIERS = ["bronze", "silver", "gold"] as const;

function initialTab(): Tab {
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
  if (q && OLD_TABS[q]) return OLD_TABS[q]!;
  return (TABS as string[]).includes(q ?? "") ? (q as Tab) : "profile";
}

/** Achievements of the career (`.claude/rules/game/achievements.md`): tracks, secrets, profile items, attributes, shop. */
export function AchievementsScreen() {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;
  const [data, setData] = useState<AchievementsData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const { save } = useGameSave();
  // The manager's money, with the bets: the same wallet the shop's money purchases check.
  const [wallet, setWallet] = useState<number | null>(null);
  useEffect(() => {
    if (!saveId) return;
    fetch(`/api/saves/${saveId}/bets?summary=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { wallet: number } | null) => setWallet(v?.wallet ?? null))
      .catch(() => setWallet(null));
  }, [saveId, save?.managerSpent]);

  const load = useCallback(async () => {
    if (!saveId) return;
    const r = await achievementsCall<AchievementsData>(`/api/saves/${saveId}/achievements`);
    if (r.ok) { setData(r.data); setError(false); } else setError(true);
  }, [saveId]);
  useEffect(() => { void load(); }, [load]);

  const title = <ScreenTitle accent={t("screenTitles.achievements.accent")}>{t("screenTitles.achievements.main")}</ScreenTitle>;
  if (error) return <ScreenContainer>{title}<p className="text-sm text-muted-foreground m-0">{t("achievements.loadFailed")}</p></ScreenContainer>;
  if (!data || !saveId) return <ScreenContainer>{title}<p className="text-sm text-muted-foreground m-0">{t("achievements.loading")}</p></ScreenContainer>;

  const unlocked = data.tracks.reduce((n, tr) => n + Object.keys(tr.unlocked).length, 0) + data.secrets.filter((s) => s.unlocked).length;
  const total = data.tracks.length * 3 + data.secrets.length;
  const kpi = "font-display font-bold text-3xl tabular-nums leading-none text-foreground";
  const KPI_CARD = "rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-1.5 min-w-0";

  return (
    <ScreenContainer>
      {title}
      {/* Four equal cards (tester report, 9.0.1: the caption under the points opened a gap in the middle of the row). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={KPI_CARD}>
          <Label>{t("achievements.kpi.unlocked")}</Label>
          <span className={kpi}>{unlocked}<span className="text-muted-foreground text-xl">/{total}</span></span>
        </div>
        <div className={KPI_CARD}>
          <Label>{t("achievements.kpi.earned")}</Label>
          <span className={kpi}>{data.points.earned}</span>
          {data.points.campaign > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {t("achievements.kpi.split", { achievements: data.points.achievements, campaign: data.points.campaign })}
            </span>
          )}
        </div>
        <div className={KPI_CARD}>
          <Label>{t("achievements.kpi.balance")}</Label>
          <span className={`${kpi} text-primary`}>{data.points.balance}</span>
        </div>
        <div className={KPI_CARD}>
          <Label>{t("achievements.kpi.wallet")}</Label>
          <span className={`${kpi} text-star-green tabular-nums`}>{wallet !== null ? formatEuros(wallet) : "—"}</span>
        </div>
      </div>
      <SegmentedTabs
        tabs={TABS.map((k) => ({ key: k, label: t(`achievements.tabs.${k}`) }))}
        active={tab}
        onChange={setTab}
      />
      {tab === "list" && <ListTab data={data} />}
      {tab === "profile" && (
        <div className="flex flex-col gap-8">
          <ProfileTab data={data} saveId={saveId} onChange={setData} />
          <section className="flex flex-col gap-3">
            <SectionTitle>{t("achievements.tabs.manager")}</SectionTitle>
            <ManagerTab data={data} />
          </section>
        </div>
      )}
      {tab === "bets" && <BetsTab />}
      {tab === "stadium" && <StadiumTab data={data} saveId={saveId} onChange={setData} />}
      {(tab === "players" || tab === "legends" || tab === "belongings") && (
        <ShopTab section={tab} data={data} saveId={saveId} onChange={(d) => { setData(d); void refresh(); }} />
      )}
    </ScreenContainer>
  );
}

// ── Achievements ─────────────────────────────────────────────────────────────

function ListTab({ data }: { data: AchievementsData }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      {ACHIEVEMENT_CATEGORIES.map((cat) => (
        <section key={cat} className="flex flex-col gap-3">
          <SectionTitle className="flex items-center gap-2"><Icon name={BADGE_ICON[cat]} size={18} />{t(`achievements.categories.${cat}`)}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.tracks.filter((tr) => tr.category === cat).map((tr) => <TrackCard key={tr.id} track={tr} lang={i18n.language} />)}
          </div>
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <SectionTitle className="flex items-center gap-2"><Icon name="sparkles" size={18} />{t("achievements.secretsTitle")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.secrets.map((s) => (
            <div key={s.id} className={`rounded-md border p-3 flex flex-col gap-1 ${s.unlocked ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <span className="flex items-center gap-2 font-display font-bold uppercase text-base leading-tight">
                {newVisualOn()
                  ? <img src={gameArtUrl("medals/medal-secret.svg")} alt="" aria-hidden="true" className={`w-10 h-10 shrink-0 ${s.unlocked ? "drop-shadow" : "grayscale opacity-40"}`} />
                  : <Icon name={s.unlocked ? "sparkles" : "lock"} size={16} className={s.unlocked ? TIER_TEXT.secret : "text-muted-foreground"} />}
                {s.unlocked ? t(`achievements.secrets.${s.id}.name`) : t("achievements.secretLocked")}
              </span>
              <span className="text-sm text-muted-foreground">
                {s.unlocked ? t(`achievements.secrets.${s.id}.desc`) : t("achievements.secretHint")}
              </span>
              {s.unlocked && <span className="text-sm text-muted-foreground tabular-nums">{t("achievements.unlockedOn", { date: formatDate(s.unlocked, i18n.language) })}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(iso: string, lang: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function TrackCard({ track, lang }: { track: TrackView; lang: string }) {
  const { t } = useTranslation();
  const rank = track.id === "ranking";
  const fmt = (v: number) => (MONEY_TRACKS.has(track.id) ? formatEuros(v) : v.toLocaleString(lang));
  const thresholdLabel = (i: number): string => {
    if (i === 2 && track.id === "league_unbeaten") return t("achievements.goldRules.invincible");
    if (i === 2 && track.id === "manager_awards") return t("achievements.goldRules.world_manager");
    const v = track.thresholds[i]!;
    return rank ? t("achievements.rankTop", { n: v }) : fmt(v);
  };
  const next = TIERS.findIndex((tier) => !track.unlocked[tier]);
  const done = next === -1;
  // Progress towards the next tier (the special golds and the ranking show only the value).
  const special = !done && next === 2 && (track.id === "league_unbeaten" || track.id === "manager_awards");
  const target = done ? null : track.thresholds[next]!;
  const pct = done ? 100 : rank || special || target === null ? 0 : Math.min(100, (track.value / Math.max(1, target)) * 100);
  return (
    <div className="rounded-md border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-display font-bold uppercase text-base leading-tight">{t(`achievements.tracks.${track.id}.name`)}</span>
        <span className="text-sm text-muted-foreground">{t(`achievements.tracks.${track.id}.desc`)}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {TIERS.map((tier, i) => {
          const on = track.unlocked[tier];
          return (
            <div key={tier} className="flex flex-col items-center gap-0.5 text-center" title={on ? t("achievements.unlockedOn", { date: formatDate(on, lang) }) : t(`achievements.tiers.${tier}`)}>
              {newVisualOn()
                ? <img src={gameArtUrl(`medals/medal-${tier}.svg`)} alt="" aria-hidden="true" className={`w-12 h-12 ${on ? "drop-shadow" : "grayscale opacity-30"}`} />
                : <Icon name="medal" size={20} className={on ? TIER_TEXT[tier] : "text-muted-foreground/40"} />}
              <span className={`text-sm tabular-nums leading-tight ${on ? "text-foreground" : "text-muted-foreground"}`}>{thresholdLabel(i)}</span>
            </div>
          );
        })}
      </div>
      <div className="h-1.5 bg-border rounded overflow-hidden" aria-hidden="true">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-muted-foreground tabular-nums">
        {done
          ? t("achievements.complete")
          : rank
            ? (track.value > 0 ? t("achievements.rank", { n: track.value }) : "—")
            : special
              ? fmt(track.value)
              : t("achievements.progress", { value: fmt(track.value), target: fmt(target!) })}
      </span>
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

const BIO_MAX = ACHIEVEMENTS.BIO_MAX;

/** The latest medals under the photo (tester report, 8.9.38). */
function RecentAchievements({ data }: { data: AchievementsData }) {
  const { t, i18n } = useTranslation();
  const art = newVisualOn();
  const recent = data.tracks
    .flatMap((tr) => (["gold", "silver", "bronze"] as const).flatMap((tier) => (tr.unlocked[tier] ? [{ id: tr.id, tier, on: tr.unlocked[tier]! }] : [])))
    .sort((a, b) => b.on.localeCompare(a.on))
    .slice(0, 6);
  return (
    <div className="flex flex-col gap-2 w-full mt-2">
      <Label>{t("achievements.profile.recent")}</Label>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("achievements.profile.noRecent")}</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {recent.map((r) => (
            <li key={`${r.id}:${r.tier}`} className="flex items-center gap-2 text-sm">
              {art
                ? <img src={gameArtUrl(`medals/medal-${r.tier}.svg`)} alt="" aria-hidden="true" className="w-8 h-8 shrink-0" />
                : <Icon name="trophy" size={16} className="shrink-0 text-chart-4" />}
              <span className="font-semibold text-foreground truncate">{t(`achievements.tracks.${r.id}.name`)}</span>
              <span className="ml-auto text-muted-foreground tabular-nums shrink-0">{formatDate(r.on, i18n.language)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileTab({ data, saveId, onChange }: { data: AchievementsData; saveId: string; onChange: (d: AchievementsData) => void }) {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const [frame, setFrame] = useState<Frame>(data.profile.frame);
  const [badges, setBadges] = useState<Badge[]>(data.profile.badges);
  const [title, setTitle] = useState<TrackId | null>(data.profile.title);
  const [bio, setBio] = useState<string>(data.profile.bio ?? "");
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function save(path: "profile", body: unknown) {
    const r = await achievementsCall<AchievementsData>(`/api/saves/${saveId}/achievements/${path}`, "PUT", body);
    if (r.ok) { onChange(r.data); setMsg({ kind: "info", text: t("achievements.profile.saved") }); }
    else setMsg({ kind: "error", text: t(`achievements.errors.${r.error}`, { defaultValue: t("achievements.errors.generic") }) });
  }

  // The bio saves on its own, with the profile as stored (the other choices are saved with their own button).
  const [bioMsg, setBioMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  async function saveBio() {
    const p = data.profile;
    const r = await achievementsCall<AchievementsData>(`/api/saves/${saveId}/achievements/profile`, "PUT", { frame: p.frame, badges: p.badges, title: p.title, bio });
    if (r.ok) { onChange(r.data); setBioMsg({ kind: "info", text: t("achievements.profile.bioSaved") }); }
    else setBioMsg({ kind: "error", text: t(`achievements.errors.${r.error}`, { defaultValue: t("achievements.errors.generic") }) });
  }

  const allFrames: Frame[] = ["none", "bronze", "silver", "gold", "legend"];
  const toggleBadge = (b: Badge) => setBadges((cur) => cur.includes(b) ? cur.filter((x) => x !== b) : cur.length >= data.thresholds.maxBadges ? cur : [...cur, b]);
  const manager = session?.manager;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex flex-col items-center gap-3 rounded-md border border-border p-4">
        <Label>{t("achievements.profile.preview")}</Label>
        <ManagerFaceImage
          manager={{ id: session?.seatId ? seatManagerId(session.seatId) : "", name: manager?.name ?? session?.clubName ?? "", face: manager?.face ?? null }}
          clubColors={session?.clubColors}
          size={96}
          ringClassName={FRAME_RING[frame]}
          frame={frame}
        />
        <span className="font-semibold text-foreground">{manager?.name ?? "—"}</span>
        {title && <span className="text-sm font-semibold text-primary">{t(`achievements.titles.${title}`)}</span>}
        <div className="flex gap-2">
          {badges.map((b) => (
            <span key={b} title={t(`achievements.badges.${b}`)} aria-label={t(`achievements.badges.${b}`)} className="text-primary">
              <Icon name={BADGE_ICON[b]} size={20} />
            </span>
          ))}
        </div>
        {/* The manager's bio (tester report, 8.9.38): saved with the profile, shown on his page. */}
        <label className="flex flex-col gap-1 w-full mt-2">
          <Label>{t("achievements.profile.bio")}</Label>
          <textarea
            value={bio}
            maxLength={BIO_MAX}
            rows={4}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t("achievements.profile.bioPlaceholder")}
            className="w-full resize-y rounded border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <span className="text-sm text-muted-foreground tabular-nums self-end">{bio.length}/{BIO_MAX}</span>
        </label>
        {/* Saved right here (tester report: the only save button sat far away in the other column). */}
        <div className="flex items-center gap-3 self-start">
          <Button onClick={() => void saveBio()} disabled={bio === (data.profile.bio ?? "")}>{t("achievements.profile.saveBio")}</Button>
          {bioMsg && <span className={`text-sm ${bioMsg.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>{bioMsg.text}</span>}
        </div>
        <RecentAchievements data={data} />
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t("achievements.profile.frame")}</Label>
          {newVisualOn() ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2" role="radiogroup" aria-label={t("achievements.profile.frame")}>
              {allFrames.map((f) => {
                const open = data.available.frames.includes(f);
                const sel = frame === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    disabled={!open}
                    onClick={() => setFrame(f)}
                    className={`flex flex-col items-center gap-2 rounded-md border bg-card px-2 pt-4 pb-2 transition-colors ${sel ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/60"} ${open ? "" : "cursor-not-allowed"}`}
                  >
                    <span className={open ? "" : "grayscale opacity-40"}>
                      <ManagerFaceImage
                        manager={{ id: session?.seatId ? seatManagerId(session.seatId) : "", name: manager?.name ?? session?.clubName ?? "", face: manager?.face ?? null }}
                        clubColors={session?.clubColors}
                        size={64}
                        ringClassName={FRAME_RING[f]}
                        frame={f}
                      />
                    </span>
                    <span className="font-display font-bold uppercase text-sm tracking-[0.08em] text-foreground">{t(`achievements.frames.${f}`)}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                      {!open && <Icon name="lock" size={16} />}
                      {f === "none" ? " " : open ? t("achievements.profile.frameOpen") : t("achievements.profile.lockedAt", { n: data.thresholds.frames[f as Exclude<Frame, "none">] })}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <OptionChips
              value={frame}
              onChange={setFrame}
              options={allFrames.map((f) => ({
                key: f,
                label: f === "none" || data.available.frames.includes(f)
                  ? t(`achievements.frames.${f}`)
                  : `${t(`achievements.frames.${f}`)} · ${t("achievements.profile.lockedAt", { n: data.thresholds.frames[f as Exclude<Frame, "none">] })}`,
                disabled: !data.available.frames.includes(f),
              }))}
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("achievements.profile.badges", { n: data.thresholds.maxBadges })}</Label>
          {data.available.badges.length === 0
            ? <p className="text-sm text-muted-foreground m-0">{t("achievements.profile.noBadges")}</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {data.available.badges.map((b) => (
                  <Chip key={b} selected={badges.includes(b)} onClick={() => toggleBadge(b)}>
                    <Icon name={BADGE_ICON[b]} size={16} />{t(`achievements.badges.${b}`)}
                  </Chip>
                ))}
              </div>
            )}
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("achievements.profile.title")}</Label>
          {data.available.titles.length === 0
            ? <p className="text-sm text-muted-foreground m-0">{t("achievements.profile.noTitles")}</p>
            : (
              <OptionChips
                value={title ?? "none"}
                onChange={(k) => setTitle(k === "none" ? null : k as TrackId)}
                options={[
                  { key: "none", label: t("achievements.profile.noTitle") },
                  ...data.available.titles.map((id) => ({ key: id, label: t(`achievements.titles.${id}`) })),
                ]}
              />
            )}
        </div>
        <div>
          <Button onClick={() => void save("profile", { frame, badges, title, bio })}>{t("achievements.profile.save")}</Button>
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>
    </div>
  );
}

// ── Stadium decorations (9.1.1: own tab) ─────────────────────────────────────

function StadiumTab({ data, saveId, onChange }: { data: AchievementsData; saveId: string; onChange: (d: AchievementsData) => void }) {
  const { t } = useTranslation();
  const { session, save: game, refresh } = useGameSave();
  const [decor, setDecor] = useState<StadiumDecor>(data.decor);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  async function save(path: "stadium", body: unknown) {
    const r = await achievementsCall<AchievementsData>(`/api/saves/${saveId}/achievements/${path}`, "PUT", body);
    if (r.ok) { onChange(r.data); setMsg({ kind: "info", text: t("achievements.profile.saved") }); }
    else setMsg({ kind: "error", text: t(`achievements.errors.${r.error}`, { defaultValue: t("achievements.errors.generic") }) });
  }
  // After a purchase the chosen designs reload (a bought mosaic opens its design).
  async function bought() {
    await refresh({ background: true });
    const r = await achievementsCall<AchievementsData>(`/api/saves/${saveId}/achievements`, "GET");
    if (r.ok) onChange(r.data);
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <SectionTitle>{t("achievements.profile.stadium")}</SectionTitle>
        <p className="text-sm text-muted-foreground m-0">{t("achievements.profile.stadiumNote")}</p>
        <div className="flex flex-wrap gap-1.5">
          {(["banner", "mosaic"] as const).map((k) => (
            <Chip
              key={k}
              selected={decor[k]}
              disabled={!data.available.decor[k]}
              title={t(`achievements.decor.${k}.desc`)}
              onClick={() => setDecor((d) => ({ ...d, [k]: !d[k] }))}
            >
              {!data.available.decor[k] && <Icon name="lock" size={16} />}
              {t(`achievements.decor.${k}.name`)}
              {!data.available.decor[k] && ` · ${t("achievements.profile.lockedAt", { n: data.thresholds.decor[k] })}`}
            </Chip>
          ))}
        </div>
        <DecorStylePicker decor={decor} clubColor={session?.clubColors?.[0] ?? "#2d6cdf"} owned={data.ownedDecor ?? []} onChange={(patch) => setDecor((d) => ({ ...d, ...patch }))} />
        <StadiumDecorPreview decor={decor} clubColor={session?.clubColors?.[0] ?? "#2d6cdf"} crestUrl={session?.clubId ? squadLogoUrl(session.clubId) : undefined} />
        <div>
          <Button onClick={() => void save("stadium", decor)}>{t("achievements.profile.saveStadium")}</Button>
        </div>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <DecorShopSection owned={game?.managerDecor ?? []} onBought={bought} />
    </div>
  );
}

// ── Manager attributes ───────────────────────────────────────────────────────

function ManagerTab({ data }: { data: AchievementsData }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground m-0">{t("achievements.attributesNote")}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MANAGER_ATTRIBUTES.map((a) => {
          const v = data.attributes[a];
          return (
            <div key={a} className="rounded-md border border-border bg-card p-3 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-bold uppercase text-base">{t(`achievements.attributes.${a}.name`)}</span>
                <span className="font-display font-bold text-2xl tabular-nums leading-none">{Math.round(v)}</span>
              </div>
              <div className="h-1.5 bg-border rounded overflow-hidden" aria-hidden="true">
                <div className="h-full bg-primary" style={{ width: `${(v / 20) * 100}%` }} />
              </div>
              <span className="text-sm text-muted-foreground">{t(`achievements.attributes.${a}.desc`)}</span>
              <span className="text-sm tabular-nums">
                {t("achievements.attributeEffect", { value: formatEffect(data.effects[a], i18n.language, t("achievements.noEffect")) })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shop ─────────────────────────────────────────────────────────────────────

function ShopTab({ section, data, saveId, onChange }: {
  section: "players" | "legends" | "belongings"; data: AchievementsData; saveId: string; onChange: (d: AchievementsData) => void;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [position, setPosition] = useState<string>("ST");
  const [nationality, setNationality] = useState<string>("Brazil");
  const [foot, setFoot] = useState<"left" | "right">("right");
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  useEffect(() => {
    void fetch("/api/leagues").then((r) => (r.ok ? r.json() : [])).then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : [])).catch(() => setLeagues([]));
  }, []);
  const natOptions = useMemo(() => NATIONALITY_NAMES
    .map((n) => ({ value: n, label: nationalityDisplayName(n, i18n.language, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language)), [i18n.language, t]);

  async function call(path: string, body?: unknown, done?: (d: AchievementsData & { player?: { name: string } }) => string) {
    setBusy(true);
    setMsg(null);
    const r = await achievementsCall<AchievementsData & { player?: { name: string } }>(`/api/saves/${saveId}/achievements/${path}`, "POST", body);
    setBusy(false);
    if (r.ok) { onChange(r.data); if (done) setMsg({ kind: "info", text: done(r.data) }); }
    else setMsg({ kind: "error", text: t(`achievements.errors.${r.error}`, { defaultValue: t("achievements.errors.generic") }) });
    return r.ok;
  }

  const { costs, bought, spin, thisSeason } = data.shop;
  const canCreated = !thisSeason.created && data.points.balance >= costs.created && data.hasClub;
  const canLegend = !thisSeason.legend && data.hasClub;
  const card = "rounded-md border border-border bg-card p-4 flex flex-col gap-3";

  // The shop split into top tabs (tester report, 8.9.38): no more scrolling past everything.
  if (section === "legends") {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground m-0">{t("achievements.shop.clubLegend.desc")}</p>
        <RetiredList saveId={saveId} leagues={leagues} legendsOnly />
      </section>
    );
  }
  if (section === "belongings") return <AssetsTab />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground m-0">{t("achievements.shop.note")}</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <SectionTitle>{t("achievements.shop.created.title")}</SectionTitle>
            <span className="font-display font-bold tabular-nums text-primary">{t("achievements.shop.cost", { n: costs.created })}</span>
          </div>
          <p className="text-sm text-muted-foreground m-0">{t("achievements.shop.created.desc")}</p>
          {thisSeason.created && bought.created
            ? <p className="text-sm m-0">{t("achievements.shop.bought", { date: formatDate(bought.created, i18n.language) })}</p>
            : (
              <>
                <TextField id="created-name" variant="box" label={t("achievements.shop.created.name")} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
                <div className="flex flex-col gap-2">
                  <Label>{t("achievements.shop.created.position")}</Label>
                  <OptionChips value={position} onChange={setPosition} options={data.shop.positions.map((p) => ({ key: p, label: t(`roles.detailedAbbr.${p}`, { defaultValue: p }) }))} />
                </div>
                <SelectCombobox
                  label={t("achievements.shop.created.nationality")}
                  value={nationality}
                  onChange={setNationality}
                  options={natOptions}
                  leadingIcon={nationalityFlagCode(nationality) ? <Flag code={nationalityFlagCode(nationality)!} /> : undefined}
                />
                <div className="flex flex-col gap-2">
                  <Label>{t("achievements.shop.created.foot")}</Label>
                  <OptionChips value={foot} onChange={setFoot} options={[
                    { key: "left", label: t("achievements.shop.created.left") },
                    { key: "right", label: t("achievements.shop.created.right") },
                  ]} />
                </div>
                <div>
                  <Button
                    disabled={!canCreated || busy || name.trim().length < 2}
                    onClick={() => void call("shop/created", { name, position, nationality, foot }, (d) => t("achievements.shop.created.done", { name: d.player?.name ?? name }))}
                  >
                    {t("achievements.shop.created.buy")}
                  </Button>
                </div>
              </>
            )}
        </section>
        <section className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <SectionTitle>{t("achievements.shop.legend.title")}</SectionTitle>
            <span className="font-display font-bold tabular-nums text-primary">{t("achievements.shop.legend.from", { n: spin.price })}</span>
          </div>
          <p className="text-sm text-muted-foreground m-0">{t("achievements.shop.legend.desc")}</p>
          {thisSeason.legend && bought.legend
            ? <p className="text-sm m-0">{t("achievements.shop.bought", { date: formatDate(bought.legend, i18n.language) })}</p>
            : (
              <LegendRoulette
                spin={spin}
                balance={data.points.balance}
                wallet={null}
                canSpin={canLegend}
                busy={busy}
                onSpin={(pay) => call("shop/legend/spin", { pay })}
                onAccept={() => void call("shop/legend", {}, (d) => t("achievements.shop.legend.done", { name: d.player?.name ?? spin.pending?.name ?? "" }))}
              />
            )}
        </section>
      </div>
      <ShopHistory history={data.shop.history} />
    </div>
  );
}

/** The players bought with points, newest first (report of a tester: the legends had no history). */
function ShopHistory({ history }: { history: AchievementsData["shop"]["history"] }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("achievements.shop.history.title")}</SectionTitle>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("achievements.shop.history.empty")}</p>
      ) : (
        <div className={TABLE_STYLE.shell}>
          <table className="w-full border-collapse">
            <thead className={TABLE_STYLE.head}>
              <tr>
                <th className={`${TABLE_CELL.head} text-left`}>{t("achievements.shop.history.player")}</th>
                <th className={`${TABLE_CELL.head} text-left`}>{t("achievements.shop.history.item")}</th>
                <th className={`${TABLE_CELL.head} text-center`}>{t("achievements.shop.history.date")}</th>
                <th className={`${TABLE_CELL.head} text-center`}>{t("achievements.shop.history.price")}</th>
                <th className={`${TABLE_CELL.head} text-left`}>{t("achievements.shop.history.where")}</th>
              </tr>
            </thead>
            <tbody className={TABLE_STYLE.body}>
              {history.map((h) => (
                <tr key={`${h.item}:${h.playerId}`} className={TABLE_STYLE.row}>
                  <td className={`${TABLE_CELL.body} ${TABLE_STYLE.name}`}>
                    {h.href ? <a href={h.href} className="hover:text-primary">{h.name}</a> : h.name}
                    {h.position && <span className="ml-2 text-sm text-muted-foreground">{positionLabel(t, h.position, h.position)}</span>}
                  </td>
                  <td className={`${TABLE_CELL.body} text-sm`}>{t(`achievements.shop.history.kind.${h.item}`)}</td>
                  <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{h.date ? formatDate(h.date, i18n.language) : "–"}</td>
                  <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{h.price !== null ? t("achievements.shop.cost", { n: h.price }) : "–"}</td>
                  <td className={`${TABLE_CELL.body} text-sm text-muted-foreground`}>
                    {h.where === "other" && h.clubName
                      ? t("achievements.shop.history.at.otherClub", { club: h.clubName })
                      : t(`achievements.shop.history.at.${h.where}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
