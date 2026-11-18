// Blocks of the account profile (`docs/superpowers/specs/2026-11-18-account-profile-design.md`): the start screen
// and a friend's profile use the same pieces.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { gameArtUrl } from "@/Domain/art/paintedFaces";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { ManagerFaceImage } from "@/GameInterface/Components/PersonFace";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { dateLocale } from "@/GameInterface/formatDate";
import type { AccountProfileView, AccountTier } from "@/types/accountTypes";

/** Frame around the face, by unlocked account achievements. */
export function accountFrame(unlocked: number): "none" | "bronze" | "silver" | "gold" | "legend" {
  return unlocked >= 30 ? "legend" : unlocked >= 20 ? "gold" : unlocked >= 10 ? "silver" : unlocked >= 3 ? "bronze" : "none";
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="px-4 py-3.5 border-b sm:border-b-0 sm:border-r border-border last:border-0 min-w-0">
      <div className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground truncate">{label}</div>
      <div className={`mt-1.5 font-display font-bold text-3xl leading-none tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

export function ProfileHeader({ view, action }: { view: AccountProfileView; action?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const since = view.since
    ? new Date(`${view.since}T12:00:00`).toLocaleDateString(dateLocale(i18n.language), { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  return (
    <div className="flex flex-wrap items-center gap-6">
      {view.face ? (
        <ManagerFaceImage
          manager={{ id: view.face.managerId, name: view.nickname, face: view.face.face, nationality: managerFaceCountry(view.face.nationalityIso) }}
          clubColors={view.face.clubColors}
          size={96}
          frame={accountFrame(view.achievements.unlocked)}
        />
      ) : (
        <span className="w-24 h-24 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground">
          <Icon name="user" size={32} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {view.mine && (
          <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0">
            <TitleParts accent={t("screenTitles.account.accent")}>{t("screenTitles.account.main")}</TitleParts>
          </h1>
        )}
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display font-bold uppercase text-3xl leading-none">{view.nickname}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {[
              since && t("account.since", { date: since }),
              t("account.careers", { count: view.summary.careers }),
              view.summary.friendsCareers > 0 && t("account.withFriends", { count: view.summary.friendsCareers }),
            ].filter(Boolean).join(" · ")}
          </span>
        </div>
        {view.badges.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {view.badges.map((b) => (
              <span key={b} className="text-sm rounded px-2 py-0.5 border border-chart-4 text-chart-4">{t(`account.badge.${b}`)}</span>
            ))}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

export function ProfileStats({ view }: { view: AccountProfileView }) {
  const { t, i18n } = useTranslation();
  const s = view.summary;
  const n = (v: number) => v.toLocaleString(dateLocale(i18n.language));
  return (
    <div className="rounded-md border border-border bg-card grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-10">
      <Stat label={t("account.stats.titles")} value={n(s.titles.total)} accent />
      <Stat label={t("account.stats.promotions")} value={n(s.titles.promotion)} />
      <Stat label={t("account.stats.seasons")} value={n(s.seasons)} />
      <Stat label={t("account.stats.clubs")} value={n(s.clubs)} />
      <Stat label={t("account.stats.matches")} value={n(s.matches)} />
      <Stat label={t("account.stats.winPct")} value={`${s.winPct}%`} />
      <Stat label={t("account.stats.awards")} value={n(s.awards.total)} />
      <Stat label={t("account.stats.sackings")} value={n(s.sackings)} />
      <Stat label={t("account.stats.cards")} value={<span><span className="text-chart-4">{s.cards.yellow}</span><span className="text-muted-foreground text-xl"> / </span><span className="text-destructive">{s.cards.red}</span></span>} />
      <Stat label={t("account.stats.achievements")} value={<span>{view.achievements.unlocked}<span className="text-muted-foreground text-xl">/{view.achievements.total}</span></span>} />
    </div>
  );
}

function Trophy({ src, count, label, tint }: { src?: string; count: number; label: string; tint?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center min-w-0">
      <div className="h-24 flex items-center justify-center">
        {src
          ? <img src={gameArtUrl(src)} alt="" aria-hidden="true" className={`h-24 w-auto ${count === 0 ? "grayscale opacity-30" : ""} ${tint ? "hue-rotate-[160deg] saturate-50" : ""}`} />
          : <Icon name="chevron-up" size={40} className={count === 0 ? "text-muted-foreground/40" : "text-muted-foreground"} />}
      </div>
      <div className="mt-1 font-display font-bold text-3xl leading-none tabular-nums">{count}</div>
      <div className="mt-1 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function TrophyCabinet({ view }: { view: AccountProfileView }) {
  const { t } = useTranslation();
  const s = view.summary;
  return (
    <section className="rounded-md border border-border bg-card px-5 py-4.5">
      <SectionTitle><TitleParts accent={t("account.trophies.accent")}>{t("account.trophies.main")}</TitleParts></SectionTitle>
      <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
        <Trophy src="season/trophy-league.webp" count={s.titles.league} label={t("account.trophies.league")} />
        <Trophy src="season/trophy-cup.webp" count={s.titles.cup} label={t("account.trophies.cup")} />
        <Trophy src="season/trophy-continental.webp" count={s.titles.continental} label={t("account.trophies.continental")} />
        <Trophy src="season/trophy-cup.webp" count={s.titles.national} label={t("account.trophies.national")} tint />
        <Trophy count={s.titles.promotion} label={t("account.trophies.promotion")} />
      </div>
      <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-7 gap-y-1">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("account.trophies.worldBest")} <span className="text-foreground text-lg tabular-nums">{s.awards.world}</span>
        </span>
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("account.trophies.leagueBest")} <span className="text-foreground text-lg tabular-nums">{s.awards.league}</span>
        </span>
      </div>
    </section>
  );
}

const nextTier = (tier: AccountTier | null): AccountTier | null => (tier === null ? "bronze" : tier === "bronze" ? "silver" : tier === "silver" ? "gold" : null);
const tierIndex = { bronze: 0, silver: 1, gold: 2 } as const;

export function AccountAchievements({ view, onPickBadges }: { view: AccountProfileView; onPickBadges?: () => void }) {
  const { t } = useTranslation();
  const a = view.achievements;
  return (
    <section className="rounded-md border border-border bg-card px-5 py-4.5">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle><TitleParts accent={t("account.achievements.accent")}>{t("account.achievements.main")}</TitleParts></SectionTitle>
        <span className="flex items-center gap-4">
          {onPickBadges && a.tracks.some((x) => x.tier === "gold") && (
            <button type="button" onClick={onPickBadges} className="h-8 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-muted-foreground hover:text-foreground">
              {t("account.badges.pick")}
            </button>
          )}
          <span className="text-sm text-muted-foreground tabular-nums">{t("account.achievements.count", { done: a.unlocked, total: a.total })}</span>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-4 text-center text-sm max-h-[420px] overflow-y-auto pr-1">
        {a.tracks.map((tr) => {
          const shown = tr.tier ?? "bronze";
          const next = nextTier(tr.tier);
          return (
            <div key={tr.id} className="flex flex-col items-center min-w-0">
              <img src={gameArtUrl(`medals/medal-${shown}.svg`)} alt="" aria-hidden="true" className={`w-12 h-12 ${tr.tier ? "drop-shadow" : "grayscale opacity-30"}`} />
              <div className={tr.tier ? "text-foreground" : "text-muted-foreground"}>{t(`account.track.${tr.id}`)}</div>
              <div className="text-muted-foreground tabular-nums">
                {next ? `${tr.value}/${tr.thresholds[tierIndex[next]]}` : t("account.achievements.done")}
              </div>
            </div>
          );
        })}
        {a.singles.map((s) => (
          <div key={s.id} className="flex flex-col items-center min-w-0">
            <img src={gameArtUrl("medals/medal-gold.svg")} alt="" aria-hidden="true" className={`w-12 h-12 ${s.unlocked ? "drop-shadow" : "grayscale opacity-30"}`} />
            <div className={s.unlocked ? "text-foreground" : "text-muted-foreground"}>{t(`account.single.${s.id}`)}</div>
          </div>
        ))}
        {a.secrets.map((s, i) => (
          <div key={s.unlocked ? s.id : `secret-${i}`} className="flex flex-col items-center min-w-0">
            <img src={gameArtUrl("medals/medal-secret.svg")} alt="" aria-hidden="true" className={`w-12 h-12 ${s.unlocked ? "drop-shadow" : "grayscale opacity-40"}`} />
            <div className={s.unlocked ? "text-foreground" : "text-muted-foreground"}>{s.unlocked ? t(`account.secret.${s.id}`) : "???"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CareersTable({ view }: { view: AccountProfileView }) {
  const { t } = useTranslation();
  if (view.careers.length === 0) return <p className="text-sm text-muted-foreground">{t("account.careersEmpty")}</p>;
  return (
    <div className={TABLE_STYLE.shell}>
      <table className="w-full border-collapse">
        <thead className={TABLE_STYLE.head}>
          <tr>
            <th className={`${TABLE_CELL.head} text-left`}>{t("account.table.manager")}</th>
            <th className={`${TABLE_CELL.head} text-left`}>{t("account.table.clubs")}</th>
            <th className={`${TABLE_CELL.head} text-center`}>{t("account.table.seasons")}</th>
            <th className={`${TABLE_CELL.head} text-center`}>{t("account.table.titles")}</th>
          </tr>
        </thead>
        <tbody className={TABLE_STYLE.body}>
          {view.careers.map((c) => (
            <tr key={c.saveId + c.managerName} className={`${TABLE_STYLE.row} ${c.deleted ? "opacity-60" : ""}`}>
              <td className={TABLE_CELL.body}>
                <span className={TABLE_STYLE.name}>{c.managerName}</span>
                <span className="block text-sm text-muted-foreground">
                  {c.deleted ? t("account.deleted") : t(`account.mode.${c.mode}`)}
                </span>
              </td>
              <td className={TABLE_CELL.body}>
                <span className="flex flex-wrap items-center gap-1">
                  {c.clubs.slice(0, 6).map((club) => (
                    <ClubLogo key={club.squadId} className={TABLE_STYLE.crest} logoUrl={squadLogoUrl(club.squadId)} title={club.clubName} />
                  ))}
                  {c.clubs.length > 6 && <span className="text-sm text-muted-foreground tabular-nums">+{c.clubs.length - 6}</span>}
                </span>
              </td>
              <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{c.seasons}</td>
              <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{c.titles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
