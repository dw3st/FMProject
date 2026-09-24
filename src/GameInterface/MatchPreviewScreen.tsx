import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud,
  MapPin,
  Clock,
  User,
  ChevronRight,
  Settings,
  Search,
  Swords,
  ArrowRightLeft,
  Play,
  X,
} from "lucide-react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { capture } from "@/analytics";
import type { Squad, RosterPlayer, LeagueData } from "@/types/playerTypes";
import { squadIdToClubSlugMap } from "@/backend/squadIdResolve";
import { Player } from "@/Domain/Player";
import type { Fixture } from "@/types/calendarTypes";
import {
  DEFAULT_TACTICAL_STYLE,
  TACTICAL_STYLE_OPTIONS,
} from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import { getMainRole, MAIN_ROLE_ABBR, getPositionColor, MAIN_ROLE_BADGE_CLASSES } from "@/GameInterface/positionHelpers";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ratingTextClassDisplay100, ratingTextClass10 } from "@/GameInterface/scoreColors";
import { autoFillLineup } from "@/Domain/lineupHelpers";
import { catalogLeagueBySquadId, competitionName } from "@/Domain/world/labels";
import {
  FALLBACK_AWAY_ACCENT,
  FALLBACK_HOME_ACCENT,
  resolveMatchTeamKitColors,
  squadPrimaryColor,
  squadSecondaryColor,
  tacticPillStyle,
} from "@/GameInterface/matchTeamColors";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayRating(avg: number): string {
  return avg.toFixed(1);
}

function tacticalStyleLabel(style: TacticalStyle): string {
  return TACTICAL_STYLE_OPTIONS.find((o) => o.value === style)?.label ?? style;
}

function squadIdToName(squadId: string, leagueSlug: string): string {
  const clubSlug = squadId.startsWith(leagueSlug + "_")
    ? squadId.slice(leagueSlug.length + 1)
    : squadId;
  return clubSlug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getOrderedPlayers(players: RosterPlayer[], lineup: string[]): RosterPlayer[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const slotCount = Math.max(lineup.length, 11);
  const ordered: (RosterPlayer | undefined)[] = new Array(slotCount).fill(undefined);
  const used = new Set<string>();

  for (let i = 0; i < lineup.length; i++) {
    const id = lineup[i];
    if (id) {
      const p = byId.get(id);
      if (p) { ordered[i] = p; used.add(id); }
    }
  }

  const remaining = players.filter((p) => !used.has(p.id));
  let ri = 0;
  for (let i = 0; i < slotCount; i++) {
    if (!ordered[i] && ri < remaining.length) {
      ordered[i] = remaining[ri];
      used.add(remaining[ri]!.id);
      ri++;
    }
  }

  const result = ordered.filter((p): p is RosterPlayer => p !== undefined);
  for (const p of players) {
    if (!used.has(p.id)) result.push(p);
  }
  return result;
}

const WEATHER_OPTIONS = [
  { icon: "☀", label: "Clear" },
  { icon: "⛅", label: "Partly Cloudy" },
  { icon: "🌧", label: "Light Rain" },
  { icon: "🌫", label: "Foggy" },
  { icon: "❄", label: "Cold" },
];

const REFEREES = ["M. Oliver", "A. Taylor", "S. Attwell", "P. Tierney", "C. Kavanagh"];

function getMatchMeta(date: string, clubName: string, isHome: boolean) {
  const seed = parseInt(date.replace(/-/g, ""), 10);
  return {
    weather: WEATHER_OPTIONS[seed % WEATHER_OPTIONS.length]!,
    referee: REFEREES[seed % REFEREES.length]!,
    venue: isHome ? `${clubName} Stadium` : "Away Ground",
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FormationSlotDef { role: string; }

/** Returns the label to show for a role in the match preview.
 *  Specific roles (CB, CM, ST…) are shown as-is.
 *  Main roles (Defender, Midfielder, Forward) fall back to their abbreviation. */
function roleLabel(role: string): string {
  // If the role is already a main-role key, show the short abbreviation
  if (role in MAIN_ROLE_ABBR) return MAIN_ROLE_ABBR[role as keyof typeof MAIN_ROLE_ABBR];
  // Otherwise it's a specific role — display it directly (CB, CM, ST…)
  return role;
}

function RoleBadge({ role, align }: { role: string; align: "left" | "right" }) {
  const color = getPositionColor(role);
  return (
    <span
      className={`text-[9px] font-black uppercase tracking-wider shrink-0 w-7 ${align === "right" ? "text-right" : ""} ${color}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function HomePlayerRow({ player, slotRole }: { player: RosterPlayer; slotRole?: string }) {
  const role = slotRole ?? player.positions[0] ?? "CM";
  const avg = Player.weightedScore(player.stats, role);
  const rating = toDisplayRating(avg);
  const lastName = player.name.split(" ").pop() ?? player.name;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <RoleBadge role={role} align="left" />
      <span className="flex-1 text-[13px] text-foreground font-medium truncate">{lastName}</span>
      <span className={`text-[13px] font-bold tabular-nums shrink-0 ${ratingTextClassDisplay100(Number(rating))}`}>
        {rating}
      </span>
    </div>
  );
}

function AwayPlayerRow({ player, slotRole }: { player: RosterPlayer; slotRole?: string }) {
  const role = slotRole ?? player.positions[0] ?? "CM";
  const avg = Player.weightedScore(player.stats, role);
  const rating = toDisplayRating(avg);
  const lastName = player.name.split(" ").pop() ?? player.name;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className={`text-[13px] font-bold tabular-nums shrink-0 ${ratingTextClassDisplay100(Number(rating))}`}>
        {rating}
      </span>
      <span className="flex-1 text-[13px] text-foreground font-medium truncate text-right">{lastName}</span>
      <RoleBadge role={role} align="right" />
    </div>
  );
}

function TacticsRow({
  tacticalStyle,
  side,
  accentHex,
}: {
  tacticalStyle: TacticalStyle;
  side: "home" | "away";
  accentHex: string;
}) {
  const { t } = useTranslation();
  const isHome = side === "home";
  const pillStyle = tacticPillStyle(accentHex);

  return (
    <div className="flex items-center gap-2 pt-3 border-t border-border/30">
      <div className={`flex-1 flex items-center gap-2 ${isHome ? "" : "flex-row-reverse"}`}>
        <Swords className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] text-muted-foreground">{t("matchPreview.style")}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-border" style={pillStyle}>
          {tacticalStyleLabel(tacticalStyle)}
        </span>
      </div>
    </div>
  );
}

function TeamCard({
  side,
  squadName,
  squad,
  lineup,
  formation,
  formationSlots,
  tacticalStyle,
  logoUrl,
  accentHex,
  squadUrl,
}: {
  side: "home" | "away";
  squadName: string;
  squad: Squad | null;
  lineup: string[];
  formation: string;
  formationSlots: FormationSlotDef[];
  tacticalStyle: TacticalStyle;
  logoUrl?: string;
  accentHex: string;
  squadUrl?: string;
}) {
  const { t } = useTranslation();
  const allOrdered = squad ? getOrderedPlayers(squad.players, lineup) : [];
  const starting = allOrdered.slice(0, 11);
  const benchCount = Math.max(0, allOrdered.length - 11);
  const isHome = side === "home";

  const accentBorder =
    isHome
      ? { borderLeftWidth: 2, borderLeftStyle: "solid" as const, borderLeftColor: accentHex }
      : { borderRightWidth: 2, borderRightStyle: "solid" as const, borderRightColor: accentHex };

  return (
    <div
      className="flex-1 rounded-xl bg-card/60 backdrop-blur-sm p-5 flex flex-col gap-3 border border-border"
      style={accentBorder}
    >
      {/* Club header */}
      <div className={`flex items-center gap-3 ${isHome ? "" : "flex-row-reverse"}`}>
        {squadUrl ? (
          <a href={squadUrl} className="shrink-0 rounded-full hover:opacity-80 transition-opacity">
            <ClubLogo
              logoUrl={logoUrl}
              className="w-10 h-10 rounded-full"
              imgClassName="w-full h-full object-contain p-1"
            />
          </a>
        ) : (
          <ClubLogo
            logoUrl={logoUrl}
            className="w-10 h-10 rounded-full shrink-0"
            imgClassName="w-full h-full object-contain p-1"
          />
        )}
        <div className={`min-w-0 ${isHome ? "" : "text-right"}`}>
          {squadUrl ? (
            <a href={squadUrl} className="no-underline hover:opacity-70 transition-opacity">
              <h2 className="text-base font-black font-display text-foreground uppercase tracking-wider m-0 leading-tight truncate">
                {squadName}
              </h2>
            </a>
          ) : (
            <h2 className="text-base font-black font-display text-foreground uppercase tracking-wider m-0 leading-tight truncate">
              {squadName}
            </h2>
          )}
          <p className="text-[10px] font-bold uppercase tracking-widest m-0" style={{ color: accentHex }}>
            {formation}
          </p>
        </div>
        <div className="flex-1" />
      </div>

      <div className="border-t border-border/30" />

      {/* Starting XI — all 11 */}
      <div className="flex-1">
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
          {t("matchPreview.startingXI")}
        </p>
        <div>
          {starting.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">{t("matchPreview.noLineupSet")}</p>
          ) : (
            starting.map((player, idx) => {
              const slotRole = formationSlots[idx]?.role;
              return isHome ? (
                <HomePlayerRow key={player.id} player={player} slotRole={slotRole} />
              ) : (
                <AwayPlayerRow key={player.id} player={player} slotRole={slotRole} />
              );
            })
          )}
        </div>

        {benchCount > 0 && (
          <p className={`text-[10px] text-muted-foreground mt-2 m-0 ${isHome ? "" : "text-right"}`}>
            + {benchCount} {t(benchCount !== 1 ? "matchPreview.substitutes" : "matchPreview.substitutes")}
          </p>
        )}
      </div>

      {/* Tactics */}
      <TacticsRow tacticalStyle={tacticalStyle} side={side} accentHex={accentHex} />
    </div>
  );
}

// ── Last-Minute Subs Modal ────────────────────────────────────────────────────

function fitnessBarClass(v: number): string {
  if (v >= 60) return "bg-emerald-500";
  if (v >= 35) return "bg-amber-500";
  return "bg-red-500";
}

function LastMinuteSubsModal({
  players,
  lineup,
  formationSlots,
  onSwap,
  onClose,
}: {
  players: RosterPlayer[];
  lineup: string[];
  formationSlots: FormationSlotDef[];
  onSwap: (newLineup: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [swapLog, setSwapLog] = useState<Array<{ outName: string; inName: string }>>([]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const inLineupSet = new Set(lineup);

  const starters = lineup
    .map((id, i) => ({ player: byId.get(id), slotIndex: i, role: formationSlots[i]?.role ?? "CM" }))
    .filter((s): s is { player: RosterPlayer; slotIndex: number; role: string } => !!s.player);

  const bench = players.filter((p) => !inLineupSet.has(p.id));
  const selectedOut = selectedSlot !== null ? starters.find((s) => s.slotIndex === selectedSlot) : undefined;

  function handleSelectOut(slotIdx: number) {
    setSelectedSlot((prev) => (prev === slotIdx ? null : slotIdx));
  }

  function handleSelectIn(benchPlayer: RosterPlayer) {
    if (selectedSlot === null || !selectedOut) return;
    const newLineup = [...lineup];
    newLineup[selectedSlot] = benchPlayer.id;
    setSwapLog((prev) => [
      ...prev,
      {
        outName: selectedOut.player.name.split(" ").pop()!,
        inName: benchPlayer.name.split(" ").pop()!,
      },
    ]);
    onSwap(newLineup);
    setSelectedSlot(null);
  }

  function SubRoleBadge({ role }: { role: string }) {
    const main = getMainRole(role);
    const cls = MAIN_ROLE_BADGE_CLASSES[main];
    return (
      <span className={`inline-flex items-center justify-center min-w-[2rem] px-1 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 ${cls}`}>
        {role}
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[80vw] h-[80vh] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            <h2 className="font-black font-display uppercase tracking-wider text-foreground m-0 text-base">
              {t("matchPreview.lastMinuteSubs")}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {swapLog.length > 0 && (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-2 py-1 rounded-full">
                {swapLog.length} {t(swapLog.length !== 1 ? "matchPreview.changes" : "matchPreview.change")}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Swap log strip */}
          {swapLog.length > 0 && (
            <div className="shrink-0 px-4 py-2 border-b border-border/60 bg-emerald-400/5">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 m-0 mb-1.5">
                {t("matchPreview.changesThisSession")}
              </p>
              <div className="flex flex-wrap gap-2">
                {swapLog.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-emerald-400/10 border border-emerald-400/20 text-xs">
                    <span className="text-red-400 font-medium truncate max-w-[8rem]">{s.outName}</span>
                    <ArrowRightLeft className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400 font-medium truncate max-w-[8rem]">{s.inName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="shrink-0 px-4 pt-2 pb-1 text-xs text-muted-foreground">
            {selectedSlot !== null
              ? t("matchPreview.chooseABench")
              : t("matchPreview.chooseStarter")}
          </p>

          {/* 1v1 preview strip */}
          {selectedOut && (
            <div className="shrink-0 px-4 pb-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-stretch rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-col gap-1 min-w-0 rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{t("matchPreview.out")}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <SubRoleBadge role={selectedOut.role} />
                    <span className={`text-sm font-bold truncate ${getPositionColor(selectedOut.role)}`}>
                      {selectedOut.player.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className={ratingTextClass10(Player.weightedScore(selectedOut.player.stats, selectedOut.role))}>
                      {Player.weightedScore(selectedOut.player.stats, selectedOut.role).toFixed(1)} {t("matchPreview.rating")}
                    </span>
                    <span>{t("matchPreview.fitness")} {Math.round(selectedOut.player.seasonLog?.fitness ?? 100)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center py-1 sm:py-0">
                  <ArrowRightLeft className="w-6 h-6 text-primary shrink-0" aria-hidden />
                </div>
                <div className="flex flex-col gap-1 min-w-0 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-3 py-2 justify-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{t("matchPreview.in")}</span>
                  <p className="text-sm text-muted-foreground m-0">{t("matchPreview.tapAPlayer")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Side by side: XI | Bench */}
          <div className="flex-1 min-h-0 flex gap-3 px-4 pb-3">
            {/* Starting XI */}
            <div className="flex-1 min-w-0 flex flex-col border border-border/50 rounded-xl overflow-hidden bg-secondary/20">
              <div className="shrink-0 px-3 py-2 border-b border-border/50">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("matchPreview.startingXI")}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {starters.map(({ player, slotIndex, role }) => {
                  const isSelected = slotIndex === selectedSlot;
                  const avg = Player.weightedScore(player.stats, role);
                  const lastName = player.name.split(" ").pop() ?? player.name;
                  return (
                    <button
                      key={slotIndex}
                      type="button"
                      onClick={() => handleSelectOut(slotIndex)}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-primary/20 border-primary/60 ring-1 ring-primary/40"
                          : "border-border/60 hover:border-primary/40 hover:bg-secondary/40"
                      }`}
                    >
                      <SubRoleBadge role={role} />
                      <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${getPositionColor(role)}`}>
                        {lastName}
                      </span>
                      <span className={`text-xs font-black tabular-nums shrink-0 w-8 text-right ${ratingTextClass10(avg)}`}>
                        {avg.toFixed(1)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 w-[4.5rem]">
                        <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden min-w-0">
                          <div
                            className={`h-full rounded-full ${fitnessBarClass(player.seasonLog?.fitness ?? 100)}`}
                            style={{ width: `${player.seasonLog?.fitness ?? 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-5 text-right">
                          {Math.round(player.seasonLog?.fitness ?? 100)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedSlot !== null && (
                <div className="shrink-0 px-2 py-1.5 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => setSelectedSlot(null)}
                    className="text-xs text-muted-foreground hover:text-foreground w-full py-1 cursor-pointer bg-transparent border-0"
                  >
                    {t("matchPreview.cancelSelection")}
                  </button>
                </div>
              )}
            </div>

            {/* Bench */}
            <div className="flex-1 min-w-0 flex flex-col border border-border/50 rounded-xl overflow-hidden bg-secondary/10">
              <div className="shrink-0 px-3 py-2 border-b border-border/50">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("matchPreview.bench")}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {bench.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-4 text-center">{t("matchPreview.noBenchPlayers")}</p>
                ) : (
                  bench.map((p) => {
                    const role = p.positions[0] ?? "CM";
                    const avg = Player.weightedScore(p.stats, role);
                    const canPick = selectedSlot !== null;
                    const lastName = p.name.split(" ").pop() ?? p.name;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => canPick && handleSelectIn(p)}
                        disabled={!canPick}
                        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg border text-left transition-all ${
                          canPick
                            ? "border-emerald-500/25 hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer"
                            : "border-border/40 opacity-70 cursor-default"
                        }`}
                      >
                        <SubRoleBadge role={role} />
                        <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${getPositionColor(role)}`}>
                          {lastName}
                        </span>
                        <span className={`text-xs font-black tabular-nums shrink-0 w-8 text-right ${ratingTextClass10(avg)}`}>
                          {avg.toFixed(1)}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 w-[4.5rem]">
                          <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden min-w-0">
                            <div
                              className={`h-full rounded-full ${fitnessBarClass(p.seasonLog?.fitness ?? 100)}`}
                              style={{ width: `${p.seasonLog?.fitness ?? 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-5 text-right">
                            {Math.round(p.seasonLog?.fitness ?? 100)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

interface MatchSetupData {
  mySquad: Squad;
  opponentSquad: Squad | null;
  myFormation: { id: string; attacking: FormationSlotDef[] };
  oppFormation: { id: string; attacking: FormationSlotDef[] };
  myLineup: string[];
  myTactics?: TacticsSave;
}

export function MatchPreviewScreen() {
  const { session, loading: saveLoading, fixtures, currentDate: simDate } = useGameSave();
  const [matchSetup, setMatchSetup] = useState<MatchSetupData | null>(null);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [mySquadId, setMySquadId] = useState<string>("");
  const [opponentSquad, setOpponentSquad] = useState<Squad | null>(null);
  const [activeLeagueData, setActiveLeagueData] = useState<LeagueData | null>(null);
  const [catalogLeagues, setCatalogLeagues] = useState<LeagueData[]>([]);
  // Static catalog lookups: origin league (crest folder) + club slug/name for any squadId.
  const catalogLeague = useMemo(() => catalogLeagueBySquadId(catalogLeagues), [catalogLeagues]);
  const catalogSlugs = useMemo(
    () => squadIdToClubSlugMap(catalogLeagues.flatMap((l) => l.standings)),
    [catalogLeagues],
  );
  const catalogNames = useMemo(
    () => new Map(catalogLeagues.flatMap((l) => l.standings.map((row) => [row.squadId, row.name] as const))),
    [catalogLeagues],
  );
  const [loading, setLoading] = useState(true);
  const [noMatchDay, setNoMatchDay] = useState(false);
  const [needsTactics, setNeedsTactics] = useState(false);
  const [matchSetupError, setMatchSetupError] = useState<string | null>(null);
  const [commencing, setCommencing] = useState(false);
  const [localLineup, setLocalLineup] = useState<string[]>([]);
  const [showLastMinuteSubs, setShowLastMinuteSubs] = useState(false);

  useEffect(() => {
    if (saveLoading) return;
    if (!session) {
      window.location.href = "/new-game";
      return;
    }

    const s = session;
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setMatchSetupError(null);
    setNoMatchDay(false);
    setNeedsTactics(false);

    void (async () => {
      try {
        const [mySquadR, leaguesR] = await Promise.all([
          fetch(`/api/saves/${s.saveId}/squad/${s.leagueSlug}/${s.clubId}`),
          fetch(`/api/leagues`).then((r) => r.json() as Promise<LeagueData[]>),
        ]);

        if (cancelled) return;

        const leagueRows = leaguesR.find((l) => l.slug === s.leagueSlug) ?? null;
        setActiveLeagueData(leagueRows);
        setCatalogLeagues(leaguesR);

        let myInternalId: string;
        if (mySquadR.ok) {
          const mySquad = (await mySquadR.json()) as Squad;
          myInternalId = mySquad.id;
        } else {
          myInternalId = s.clubId;
        }
        setMySquadId(myInternalId);

        const currentDate = simDate ?? s.currentDate ?? "";
        const todayFixture =
          fixtures.find(
            (f) =>
              f.date === currentDate &&
              (f.home === myInternalId || f.away === myInternalId) &&
              !f.played,
          ) ?? null;

        if (!todayFixture) {
          setNoMatchDay(true);
          redirectTimer = setTimeout(() => {
            window.location.href = "/dashboard";
          }, 1500);
          return;
        }

        setFixture(todayFixture);

        const setupRes = await fetch(`/api/match-setup?saveId=${encodeURIComponent(s.saveId)}`);
        const setupJson = (await setupRes.json()) as Record<string, unknown>;
        if (!setupRes.ok) {
          throw new Error(typeof setupJson.error === "string" ? setupJson.error : `match-setup failed (${setupRes.status})`);
        }
        const setupR = setupJson as unknown as MatchSetupData;
        if (cancelled) return;
        setMatchSetup(setupR);

        const isHome = todayFixture.home === myInternalId;
        const oppId = isHome ? todayFixture.away : todayFixture.home;

        try {
          // The squad route resolves the club by squadId anywhere in the save, so the opponent
          // is found even if it changed league (membership lives in the save, not in leagueData).
          const oppR = await fetch(`/api/saves/${s.saveId}/squad/${s.leagueSlug}/${encodeURIComponent(oppId)}`);
          if (oppR.ok) setOpponentSquad((await oppR.json()) as Squad);
          else setOpponentSquad(setupR.opponentSquad);
        } catch {
          setOpponentSquad(setupR.opponentSquad);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          // No tactics saved, or an incomplete lineup → guide the manager to
          // Formation & Tactics. Show a brief message, then auto-redirect.
          if (
            msg.includes("starting lineup must have 11") ||
            msg.toLowerCase().includes("tactics not found")
          ) {
            setNeedsTactics(true);
            redirectTimer = setTimeout(() => {
              window.location.href = "/formation";
            }, 3000);
            return;
          }
          setMatchSetupError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [saveLoading, session?.saveId, session?.leagueSlug, session?.clubId, fixtures, simDate]);

  useEffect(() => {
    if (matchSetup?.myLineup) setLocalLineup(matchSetup.myLineup);
  }, [matchSetup?.myLineup]);

  async function handleLastMinuteSub(newLineup: string[]) {
    if (!session) return;
    setLocalLineup(newLineup);
    try {
      await fetch(`/api/saves/${session.saveId}/tactics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineup: newLineup }),
      });
    } catch {
      // local state already updated; backend failure is non-fatal
    }
  }

  async function handleSendAssistant() {
    if (!session || commencing) return;
    setCommencing(true);
    void capture("match_played", { mode: "sim" });
    const matchDate = session.currentDate ?? "";
    try {
      await fetch(`/api/advance-day/${session.saveId}`, { method: "POST" });
    } catch {
      // continue even on error — match result may still load from day log
    }
    if (matchDate) {
      window.location.href = `/match-result?date=${encodeURIComponent(matchDate)}`;
    } else {
      window.location.href = "/match-result";
    }
  }

  function handleStartGame() {
    void capture("match_played", { mode: "watch" });
    window.location.href = "/match";
  }

  // ── Loading / guard states ────────────────────────────────────────────────

  const { t } = useTranslation();

  if (saveLoading || loading || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{t("matchPreview.loadingMatchPreview")}</p>
        </div>
      </div>
    );
  }

  if (matchSetupError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-3">
          <p className="text-destructive font-bold text-lg">{t("matchPreview.cannotLoadMatchSetup")}</p>
          <p className="text-muted-foreground text-sm m-0">{matchSetupError}</p>
          <p className="text-muted-foreground text-xs m-0">Save Formation and Tactics (11 starters) then try again.</p>
        </div>
      </div>
    );
  }

  if (noMatchDay) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-foreground font-bold text-lg">{t("matchPreview.noMatchToday")}</p>
          <p className="text-muted-foreground text-sm">{t("matchPreview.redirectingToDashboard")}</p>
        </div>
      </div>
    );
  }

  if (needsTactics) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <Settings className="w-10 h-10 text-primary mx-auto" />
          <p className="text-foreground font-bold text-lg m-0">{t("matchPreview.noTacticsTitle")}</p>
          <p className="text-muted-foreground text-sm m-0">{t("matchPreview.noTacticsSubtitle")}</p>
          <a
            href="/formation"
            className="inline-flex items-center gap-2 mt-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary hover:scale-[1.02] active:scale-[0.98] transition-all no-underline"
          >
            {t("matchPreview.goToTacticsNow")}
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const isHome = fixture ? fixture.home === mySquadId : true;
  const opponentId = fixture ? (isHome ? fixture.away : fixture.home) : "";
  const opponentFileSlug = opponentId
    ? (catalogSlugs.get(opponentId) ?? opponentId)
    : undefined;
  const opponentName =
    (opponentId ? catalogNames.get(opponentId) : undefined) ??
    opponentSquad?.name ??
    (opponentId ? squadIdToName(opponentId, session.leagueSlug) : "Opponent");

  const myFormationId = matchSetup?.myFormation?.id ?? session.formation;
  const oppFormationId = matchSetup?.oppFormation?.id ?? "4-3-3";
  const myFormationSlots = matchSetup?.myFormation?.attacking ?? [];
  const oppFormationSlots = matchSetup?.oppFormation?.attacking ?? [];
  const myLineup = localLineup.length > 0 ? localLineup : (matchSetup?.myLineup ?? []);

  const myTactics: TacticalStyle = session.tactical_style;
  const oppTactics: TacticalStyle = DEFAULT_TACTICAL_STYLE;

  const currentDate = session.currentDate ?? "";
  const { weather, referee, venue } = getMatchMeta(currentDate, session.clubName, isHome);
  const competition = fixture
    ? competitionName(fixture.competition, activeLeagueData ? [activeLeagueData] : [])
    : "Premier Division";
  const matchday = fixture?.round ?? 1;

  // Crests are filed by the club's catalog (origin) league, not its current league.
  const myLogoUrl  = mySquadId
    ? squadLogoUrl(mySquadId, catalogLeague.get(mySquadId) ?? session.leagueSlug, catalogSlugs.get(mySquadId) ?? session.clubId)
    : squadLogoUrl(session.clubId, session.leagueSlug);
  const oppLogoUrl = opponentId
    ? squadLogoUrl(opponentId, catalogLeague.get(opponentId) ?? session.leagueSlug, opponentFileSlug)
    : undefined;

  // Assign home/away
  const homeSquadName    = isHome ? session.clubName       : opponentName;
  const awaySquadName    = isHome ? opponentName           : session.clubName;
  const homeSquad        = isHome ? matchSetup?.mySquad ?? null : opponentSquad;
  const awaySquad        = isHome ? opponentSquad          : matchSetup?.mySquad ?? null;
  const oppAutoLineup = opponentSquad
    ? autoFillLineup(oppFormationSlots as { role: string; x?: number; y?: number }[], opponentSquad.players)
    : [];
  const homeLineup       = isHome ? myLineup               : oppAutoLineup;
  const awayLineup       = isHome ? oppAutoLineup           : myLineup;
  const homeFormationId  = isHome ? myFormationId          : oppFormationId;
  const awayFormationId  = isHome ? oppFormationId         : myFormationId;
  const homeSlots        = isHome ? myFormationSlots       : oppFormationSlots;
  const awaySlots        = isHome ? oppFormationSlots      : myFormationSlots;
  const homeTactics      = isHome ? myTactics              : oppTactics;
  const awayTactics      = isHome ? oppTactics             : myTactics;
  const homeLogoUrl      = isHome ? myLogoUrl              : oppLogoUrl;
  const awayLogoUrl      = isHome ? oppLogoUrl             : myLogoUrl;
  const homePrimary = squadPrimaryColor(homeSquad, FALLBACK_HOME_ACCENT);
  const awayPrimary = squadPrimaryColor(awaySquad, FALLBACK_AWAY_ACCENT);
  const { teamA: homeHex, teamB: awayHex } = resolveMatchTeamKitColors(
    { primary: homePrimary, secondary: squadSecondaryColor(homeSquad, homePrimary) },
    { primary: awayPrimary, secondary: squadSecondaryColor(awaySquad, awayPrimary) },
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-8 gap-7 overflow-y-auto">

      {/* Match title */}
      <div className="text-center space-y-1 shrink-0">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.2em] m-0 bg-clip-text text-transparent"
          style={{
            backgroundImage: `linear-gradient(90deg, ${homeHex}, ${awayHex})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          Matchday {matchday} &bull; {competition}
        </p>
        <h1 className="text-4xl font-black font-display text-foreground uppercase tracking-wider m-0">
          {t("matchPreview.title")}
        </h1>
        <div
          className="w-16 h-0.5 mx-auto rounded-full opacity-80"
          style={{ background: `linear-gradient(to right, ${homeHex}, ${awayHex})` }}
        />
      </div>

      {/* Team cards */}
      <div className="w-full max-w-5xl flex items-stretch gap-5">
        <TeamCard
          side="home"
          squadName={homeSquadName}
          squad={homeSquad}
          lineup={homeLineup}
          formation={homeFormationId}
          formationSlots={homeSlots}
          tacticalStyle={homeTactics}
          logoUrl={homeLogoUrl}
          accentHex={homeHex}
          squadUrl={isHome ? `/squad/${session.leagueSlug}/${session.clubId}` : (opponentFileSlug ? `/squad/${session.leagueSlug}/${opponentFileSlug}` : undefined)}
        />

        {/* VS separator */}
        <div className="flex flex-col items-center justify-center shrink-0 gap-3 py-4">
          <div className="w-px flex-1 bg-border/30" />
          <div className="w-11 h-11 rounded-full border border-border/50 bg-card/40 flex items-center justify-center">
            <span className="text-xs font-black text-muted-foreground/50 uppercase tracking-wider">
              vs
            </span>
          </div>
          <div className="w-px flex-1 bg-border/30" />
        </div>

        <TeamCard
          side="away"
          squadName={awaySquadName}
          squad={awaySquad}
          lineup={awayLineup}
          formation={awayFormationId}
          formationSlots={awaySlots}
          tacticalStyle={awayTactics}
          logoUrl={awayLogoUrl}
          accentHex={awayHex}
          squadUrl={isHome ? (opponentFileSlug ? `/squad/${session.leagueSlug}/${opponentFileSlug}` : undefined) : `/squad/${session.leagueSlug}/${session.clubId}`}
        />
      </div>

      {/* Match info */}
      <div className="w-full max-w-5xl shrink-0">
        <div className="card-arcade rounded-xl px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <InfoCell icon={MapPin} label={t("matchPreview.venue")} value={venue} />
            <InfoCell icon={Cloud} label={t("matchPreview.weather")} value={`${weather.icon} ${weather.label}`} />
            <InfoCell icon={Clock} label={t("matchPreview.kickoff")} value="20:00 GMT" />
            <InfoCell icon={User} label={t("matchPreview.officials")} value={referee} />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-4 shrink-0 pb-2 flex-wrap justify-center">
        <a
          href="/formation"
          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card/60 text-foreground font-bold text-sm uppercase tracking-wider hover:bg-card hover:border-border/80 transition-all no-underline"
        >
          <Settings className="w-4 h-4" />
          {t("matchPreview.editTactics")}
        </a>

        <button
          type="button"
          onClick={() => setShowLastMinuteSubs(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card/60 text-foreground font-bold text-sm uppercase tracking-wider hover:bg-card hover:border-border/80 transition-all cursor-pointer"
        >
          <ArrowRightLeft className="w-4 h-4" />
          {t("matchPreview.lastMinuteSubs")}
        </button>

        <button
          type="button"
          onClick={handleSendAssistant}
          disabled={commencing}
          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card/60 text-foreground font-bold text-sm uppercase tracking-wider hover:bg-card hover:border-border/80 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {commencing ? t("matchPreview.simulating") : t("matchPreview.sendAssistant")}
          {!commencing && <ChevronRight className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={handleStartGame}
          disabled={commencing}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
        >
          {t("matchPreview.startGame")}
          <Play className="w-4 h-4" />
        </button>
      </div>

      {showLastMinuteSubs && matchSetup && (
        <LastMinuteSubsModal
          players={matchSetup.mySquad.players}
          lineup={myLineup}
          formationSlots={myFormationSlots}
          onSwap={handleLastMinuteSub}
          onClose={() => setShowLastMinuteSubs(false)}
        />
      )}
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground m-0">{value}</p>
    </div>
  );
}
