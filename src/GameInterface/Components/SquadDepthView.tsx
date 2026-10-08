import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DetailedRole, Squad } from "@/types/playerTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { formationForTactics } from "@/Domain/matchFormations";
import { squadDepth, type DepthCell, type DepthPlayer, type DepthStatus } from "@/Domain/squad/depth";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { PitchMarkingsSvg } from "@/GameInterface/Components/PitchMarkingsSvg";

/** Rows shown per card before "+N". */
const VISIBLE_ROWS = 5;

/** Card centre on the pitch (percent of width / height), attacking to the right; the left flank is on top. */
const SPOT: Record<DetailedRole, { x: number; y: number }> = {
  GK: { x: 8, y: 50 },
  CB: { x: 23, y: 50 }, LB: { x: 23, y: 15 }, RB: { x: 23, y: 85 },
  LWB: { x: 38, y: 15 }, RWB: { x: 38, y: 85 },
  CDM: { x: 38, y: 50 }, CM: { x: 53, y: 50 }, CAM: { x: 68, y: 50 },
  LM: { x: 53, y: 15 }, RM: { x: 53, y: 85 },
  LW: { x: 72, y: 15 }, RW: { x: 72, y: 85 },
  ST: { x: 89, y: 50 },
};

const SECTORS: { key: string; roles: DetailedRole[] }[] = [
  { key: "gk", roles: ["GK"] },
  { key: "def", roles: ["CB", "LB", "RB", "LWB", "RWB"] },
  { key: "mid", roles: ["CDM", "CM", "CAM", "LM", "RM"] },
  { key: "att", roles: ["LW", "ST", "RW"] },
];

const STATUS_BORDER: Record<DepthStatus, string> = {
  ok: "border-t-emerald-400",
  thin: "border-t-card-yellow",
  short: "border-t-destructive",
  unused: "border-t-border",
};

const STATUS_TEXT: Record<DepthStatus, string> = {
  ok: "text-emerald-400",
  thin: "text-card-yellow",
  short: "text-destructive",
  unused: "text-muted-foreground",
};

const STATUS_SWATCH: Record<DepthStatus, string> = {
  ok: "bg-emerald-400",
  thin: "bg-card-yellow",
  short: "bg-destructive",
  unused: "bg-border",
};

function DepthRow({ p, href }: { p: DepthPlayer; href: string }) {
  const { t } = useTranslation();
  const out = p.unavailable !== undefined;
  const right = p.unavailable === "injured"
    ? t("squadDepth.injured", { days: p.daysOut ?? 0 })
    : p.unavailable === "suspended"
      ? t("squadDepth.suspended")
      : p.natural
        ? t("squadDepth.age", { age: p.age })
        : `${t("squadDepth.age", { age: p.age })} · ${t("squadDepth.adapts")}`;
  return (
    <a
      href={href}
      className={`flex items-center justify-between gap-2 min-h-8 text-sm no-underline hover:text-primary ${
        out ? "text-destructive" : p.natural ? "text-foreground font-semibold" : "text-muted-foreground"
      }`}
    >
      <span className="truncate">{p.name}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground font-normal">
        <span className={`font-bold ${out ? "text-destructive" : ratingTextClass10(p.value)}`}>{Math.round(p.value * 10)}</span>
        {" · "}
        <span className={out ? "text-destructive" : ""}>{right}</span>
      </span>
    </a>
  );
}

function DepthCard({ cell, playerHref, className = "" }: { cell: DepthCell; playerHref: (id: string) => string; className?: string }) {
  const { t } = useTranslation();
  const status: DepthStatus = cell.inFormation ? cell.status : "unused";
  const shown = cell.players.slice(0, VISIBLE_ROWS);
  const extra = cell.players.length - shown.length;
  return (
    <div
      className={`rounded-md border border-border border-t-[3px] ${STATUS_BORDER[status]} ${
        cell.inFormation ? "bg-card" : "bg-card/80"
      } px-2.5 py-2 ${className}`}
      title={cell.inFormation ? undefined : t("squadDepth.notInFormation")}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${getDetailedPositionColor(cell.role)}`}>
          {t(`roles.detailedAbbr.${cell.role}`)}
          <span className="sr-only"> — {t("squadDepth.groupStatus", { status: t(`squadDepth.legend.${status}`) })}</span>
        </span>
        <span
          className={`font-display font-bold tabular-nums text-sm ${STATUS_TEXT[status]}`}
          title={t("squadDepth.naturalsCount", { count: cell.naturals })}
          aria-label={t("squadDepth.naturalsCount", { count: cell.naturals })}
        >
          {cell.naturals}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{t("squadDepth.nobody")}</p>
      ) : (
        shown.map((p) => <DepthRow key={p.id} p={p} href={playerHref(p.id)} />)
      )}
      {extra > 0 && <p className="m-0 text-sm text-muted-foreground tabular-nums">{t("squadDepth.more", { count: extra })}</p>}
    </div>
  );
}

/** "Profundidade" tab of the squad screen (#86): who plays each position, on a pitch. */
export function SquadDepthView({ squad, leagueSlug, clubSlug }: { squad: Squad; leagueSlug: string; clubSlug: string }) {
  const { t } = useTranslation();
  const { session, currentDate } = useGameSave();
  // The club's formation comes from tactics.json (the free formation included); nothing is shown
  // until it arrives, so the verdict is never computed against a guessed formation.
  const [tactics, setTactics] = useState<
    { state: "loading" } | { state: "error" } | { state: "ok"; tactics: TacticsSave | null }
  >({ state: "loading" });

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setTactics({ state: "loading" });
    fetch(`/api/saves/${session.saveId}/tactics`)
      .then((r) => {
        if (!r.ok) throw new Error(`tactics ${r.status}`);
        return r.json() as Promise<TacticsSave | null>;
      })
      .then((tc) => { if (alive) setTactics({ state: "ok", tactics: tc }); })
      .catch(() => { if (alive) setTactics({ state: "error" }); });
    return () => { alive = false; };
  }, [session?.saveId]);

  const formation = useMemo(
    () => (tactics.state === "ok" ? formationForTactics(tactics.tactics) : null),
    [tactics],
  );
  const depth = useMemo(
    () => (formation ? squadDepth(squad.players, currentDate, formation.attacking.map((s) => s.role)) : null),
    [squad.players, currentDate, formation],
  );
  const playerHref = (id: string) =>
    `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(clubSlug)}/${encodeURIComponent(id)}`;
  if (tactics.state === "error") {
    return <p className="m-0 text-sm text-muted-foreground">{t("warnings.errors.loadFailed")}</p>;
  }
  if (!formation || !depth) {
    return <p className="m-0 text-sm text-muted-foreground">{t("squadDepth.loading")}</p>;
  }
  const cells = Object.values(depth.cells).filter((c) => !c.hidden);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1">
          {(["ok", "thin", "short", "unused"] as const).map((s) => (
            <li key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={`inline-block w-3 h-3 rounded-sm ${STATUS_SWATCH[s]}`} aria-hidden="true" />
              {t(`squadDepth.legend.${s}`)}
            </li>
          ))}
        </ul>
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("squadDepth.formation", { formation: formation.id === "custom" ? t("squadDepth.customFormation") : formation.id })}
        </span>
      </div>
      <p className="m-0 text-sm text-muted-foreground">{t("squadDepth.hint")}</p>

      {/* Wide screens: the pitch. */}
      <div className="hidden xl:block relative w-full aspect-[115/74] rounded-md overflow-hidden border border-border">
        <PitchMarkingsSvg />
        {cells.map((cell) => (
          <div
            key={cell.role}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-44"
            style={{ left: `${SPOT[cell.role].x}%`, top: `${SPOT[cell.role].y}%` }}
          >
            <DepthCard cell={cell} playerHref={playerHref} className="shadow-sm" />
          </div>
        ))}
      </div>

      {/* Narrower screens: one list per sector. */}
      <div className="xl:hidden flex flex-col gap-5">
        {SECTORS.map((sector) => {
          const list = sector.roles.map((r) => depth.cells[r]).filter((c) => !c.hidden);
          if (list.length === 0) return null;
          return (
            <section key={sector.key}>
              <h3 className="m-0 mb-2 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t(`squadDepth.sector.${sector.key}`)}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((cell) => <DepthCard key={cell.role} cell={cell} playerHref={playerHref} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
