import { useState, useEffect, useMemo } from "react";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { slotValue, preferredRole } from "@/Domain/positions/positionAptitude";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { capture } from "@/analytics";
import type { Squad, RosterPlayer, LeagueData } from "@/types/playerTypes";
import { squadIdToClubSlugMap } from "@/backend/squadIdResolve";
import { Player } from "@/Domain/Player";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import {
  DEFAULT_TACTICAL_STYLE,
  TACTICAL_STYLE_OPTIONS,
} from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import { getMainRole, MAIN_ROLE_ABBR, getPositionColor, MAIN_ROLE_BADGE_CLASSES } from "@/GameInterface/positionHelpers";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { LoadIndicator } from "@/GameInterface/Components/LoadIndicator";
import { Icon, iconOf } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { competitionName } from "@/Domain/world/labels";
import { clearMatchSnapshot } from "@/GameInterface/matchResume";
import {
  FALLBACK_AWAY_ACCENT,
  FALLBACK_HOME_ACCENT,
  readableOnDark,
  resolveMatchTeamKitColors,
  squadPrimaryColor,
  squadSecondaryColor,
  tacticPillStyle,
} from "@/GameInterface/matchTeamColors";

const Clock = iconOf("clock");
const Cloud = iconOf("cloud");
const MapPin = iconOf("map-pin");
const User = iconOf("user");

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDisplayRating(avg: number): string {
  return avg.toFixed(1);
}

/**
 * Colour of a 0–10 rating next to a name in the preview (#52): the shared tiers from 6 up, and the
 * plain foreground colour below (the muted tiers were unreadable on the dark panels).
 */
function previewRatingClass(avg: number): string {
  return avg >= 6 ? ratingTextClass10(avg) : "text-foreground";
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
      className={`text-sm font-black uppercase font-display tracking-[0.06em] shrink-0 w-10 ${align === "right" ? "text-right" : ""} ${color}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function HomePlayerRow({ player, slotRole }: { player: RosterPlayer; slotRole?: string }) {
  const role = slotRole ?? preferredRole(player);
  const avg = slotValue(player, role);
  const rating = toDisplayRating(avg);
  const lastName = player.name.split(" ").pop() ?? player.name;
  return (
    <div className="flex items-center gap-2.5 min-h-9 [@media(min-height:900px)]:min-h-11">
      <RoleBadge role={role} align="left" />
      <span className="flex-1 text-base text-foreground font-medium truncate">{lastName}</span>
      <LoadIndicator load={player.seasonLog?.load ?? 0} size={11} />
      <span className={`w-10 text-right text-lg font-display font-bold tabular-nums shrink-0 ${previewRatingClass(avg)}`}>
        {rating}
      </span>
    </div>
  );
}

function AwayPlayerRow({ player, slotRole }: { player: RosterPlayer; slotRole?: string }) {
  const role = slotRole ?? preferredRole(player);
  const avg = slotValue(player, role);
  const rating = toDisplayRating(avg);
  const lastName = player.name.split(" ").pop() ?? player.name;
  return (
    <div className="flex items-center gap-2.5 min-h-9 [@media(min-height:900px)]:min-h-11">
      <span className={`w-10 text-left text-lg font-display font-bold tabular-nums shrink-0 ${previewRatingClass(avg)}`}>
        {rating}
      </span>
      <LoadIndicator load={player.seasonLog?.load ?? 0} size={11} />
      <span className="flex-1 text-base text-foreground font-medium truncate text-right">{lastName}</span>
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
        <Icon name="match" className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-base text-muted-foreground">{t("matchPreview.style")}</span>
        <span className="text-base font-bold px-2.5 py-0.5 rounded border border-border" style={pillStyle}>
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
      className="flex-1 rounded-md bg-card/60 backdrop-blur-sm p-5 flex flex-col gap-3 border border-border"
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
              <h2 className="font-display font-black uppercase text-2xl leading-none m-0 truncate">
                {squadName}
              </h2>
            </a>
          ) : (
            <h2 className="font-display font-black uppercase text-2xl leading-none m-0 truncate">
              {squadName}
            </h2>
          )}
          <p className="text-sm font-bold uppercase tracking-[0.08em] m-0 font-display" style={{ color: accentHex }}>
            {formation}
          </p>
        </div>
        <div className="flex-1" />
      </div>

      <div className="border-t border-border/30" />

      {/* Starting XI — all 11 */}
      <div className="flex-1">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.08em] mb-1.5 font-display">
          {t("matchPreview.startingXI")}
        </p>
        <div>
          {starting.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("matchPreview.noLineupSet")}</p>
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
          <p className={`text-base text-muted-foreground mt-2 m-0 ${isHome ? "" : "text-right"}`}>
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
  if (v >= 60) return "bg-chart-2";
  if (v >= 35) return "bg-chart-4";
  return "bg-destructive";
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
      <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded text-sm font-semibold border shrink-0 ${cls}`}>
        {role}
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-card border border-border rounded-md w-[80vw] h-[80vh] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-1.5rem)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Icon name="arrow-right-left" className="w-5 h-5 text-primary" />
            <h2 className="font-display font-black uppercase text-xl leading-none m-0">
              {t("matchPreview.lastMinuteSubs")}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {swapLog.length > 0 && (
              <span className="text-sm font-bold text-chart-2 bg-chart-2/10 border border-chart-2/30 px-2 py-1 rounded-full">
                {swapLog.length} {t(swapLog.length !== 1 ? "matchPreview.changes" : "matchPreview.change")}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Swap log strip */}
          {swapLog.length > 0 && (
            <div className="shrink-0 px-4 py-2 border-b border-border/60 bg-chart-2/5">
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-chart-2 m-0 mb-1.5 font-display">
                {t("matchPreview.changesThisSession")}
              </p>
              <div className="flex flex-wrap gap-2">
                {swapLog.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-chart-2/10 border border-chart-2/20 text-sm">
                    <span className="text-destructive font-medium truncate max-w-[8rem]">{s.outName}</span>
                    <Icon name="arrow-right-left" className="w-3 h-3 text-chart-2 shrink-0" />
                    <span className="text-chart-2 font-medium truncate max-w-[8rem]">{s.inName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="shrink-0 px-4 pt-2 pb-1 text-sm text-muted-foreground">
            {selectedSlot !== null
              ? t("matchPreview.chooseABench")
              : t("matchPreview.chooseStarter")}
          </p>

          {/* 1v1 preview strip */}
          {selectedOut && (
            <div className="shrink-0 px-4 pb-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-stretch rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-col gap-1 min-w-0 rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                  <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">{t("matchPreview.out")}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <SubRoleBadge role={selectedOut.role} />
                    <span className={`text-sm font-bold truncate ${getPositionColor(selectedOut.role)}`}>
                      {selectedOut.player.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground tabular-nums">
                    <span className={previewRatingClass(slotValue(selectedOut.player, selectedOut.role))}>
                      {slotValue(selectedOut.player, selectedOut.role).toFixed(1)} {t("matchPreview.rating")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {t("matchPreview.fitness")} {Math.round(selectedOut.player.seasonLog?.fitness ?? 100)}
                      <LoadIndicator load={selectedOut.player.seasonLog?.load ?? 0} size={11} />
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-center py-1 sm:py-0">
                  <Icon name="arrow-right-left" className="w-6 h-6 text-primary shrink-0" aria-hidden />
                </div>
                <div className="flex flex-col gap-1 min-w-0 rounded-lg border border-dashed border-chart-2/40 bg-chart-2/5 px-3 py-2 justify-center">
                  <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-chart-2 dark:text-chart-2 font-display">{t("matchPreview.in")}</span>
                  <p className="text-sm text-muted-foreground m-0">{t("matchPreview.tapAPlayer")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Side by side: XI | Bench */}
          <div className="flex-1 min-h-0 flex gap-3 px-4 pb-3">
            {/* Starting XI */}
            <div className="flex-1 min-w-0 flex flex-col border border-border/50 rounded-md overflow-hidden bg-secondary/20">
              <div className="shrink-0 px-3 py-2 border-b border-border/50">
                <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">{t("matchPreview.startingXI")}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {starters.map(({ player, slotIndex, role }) => {
                  const isSelected = slotIndex === selectedSlot;
                  const avg = slotValue(player, role);
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
                      <span className={`text-sm font-display font-bold tabular-nums shrink-0 w-8 text-right ${previewRatingClass(avg)}`}>
                        {avg.toFixed(1)}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 w-[5.5rem]">
                        <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden min-w-16">
                          <div
                            className={`h-full rounded-full ${fitnessBarClass(player.seasonLog?.fitness ?? 100)}`}
                            style={{ width: `${player.seasonLog?.fitness ?? 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold tabular-nums text-muted-foreground w-5 text-right">
                          {Math.round(player.seasonLog?.fitness ?? 100)}
                        </span>
                        <LoadIndicator load={player.seasonLog?.load ?? 0} size={11} />
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
                    className="text-sm text-muted-foreground hover:text-foreground w-full py-1 cursor-pointer bg-transparent border-0"
                  >
                    {t("matchPreview.cancelSelection")}
                  </button>
                </div>
              )}
            </div>

            {/* Bench */}
            <div className="flex-1 min-w-0 flex flex-col border border-border/50 rounded-md overflow-hidden bg-secondary/10">
              <div className="shrink-0 px-3 py-2 border-b border-border/50">
                <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">{t("matchPreview.bench")}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {bench.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-4 text-center">{t("matchPreview.noBenchPlayers")}</p>
                ) : (
                  bench.map((p) => {
                    const role = preferredRole(p);
                    const avg = slotValue(p, role);
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
                            ? "border-chart-2/25 hover:border-chart-2/60 hover:bg-chart-2/10 cursor-pointer"
                            : "border-border/40 opacity-70 cursor-default"
                        }`}
                      >
                        <SubRoleBadge role={role} />
                        <span className={`flex-1 min-w-0 text-sm font-semibold truncate ${getPositionColor(role)}`}>
                          {lastName}
                        </span>
                        <span className={`text-sm font-display font-bold tabular-nums shrink-0 w-8 text-right ${previewRatingClass(avg)}`}>
                          {avg.toFixed(1)}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 w-[5.5rem]">
                          <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden min-w-16">
                            <div
                              className={`h-full rounded-full ${fitnessBarClass(p.seasonLog?.fitness ?? 100)}`}
                              style={{ width: `${p.seasonLog?.fitness ?? 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold tabular-nums text-muted-foreground w-5 text-right">
                            {Math.round(p.seasonLog?.fitness ?? 100)}
                          </span>
                          <LoadIndicator load={p.seasonLog?.load ?? 0} size={11} />
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
  /** Saved-lineup starters auto-swapped for being injured on the match date — see Task 5 (UI warning). */
  injuredReplaced?: { out: string; in: string; reason?: "injured" | "suspended" }[];
  /** Tired-starter swaps the user can accept for this match. */
  rotationSuggestion?: { out: string; in: string }[];
  /** Tired-starter swaps already in the XI (assistant on, or accepted). */
  rotationApplied?: { out: string; in: string }[];
}

export function MatchPreviewScreen() {
  const { session, loading: saveLoading, fixtures, currentDate: simDate } = useGameSave();
  const [matchSetup, setMatchSetup] = useState<MatchSetupData | null>(null);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [mySquadId, setMySquadId] = useState<string>("");
  const [opponentSquad, setOpponentSquad] = useState<Squad | null>(null);
  const [catalogLeagues, setCatalogLeagues] = useState<LeagueData[]>([]);
  // Static catalog lookups: club slug/name for any squadId.
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
  const [rotationBusy, setRotationBusy] = useState(false);
  const [rotationHidden, setRotationHidden] = useState(false);

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

  // Cup tie: fetch the cup's stage metadata so the header can show the stage name
  // ("Quarter-finals") instead of a meaningless matchday number.
  const [cupMeta, setCupMeta] = useState<LeagueSeasonMeta | null>(null);
  useEffect(() => {
    if (!session?.saveId || !fixture || !isCupSlug(fixture.competition)) {
      setCupMeta(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/saves/${session.saveId}/cups/${fixture.competition}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ meta: LeagueSeasonMeta }>) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setCupMeta(data?.meta ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.saveId, fixture]);

  // Continental tie (UCL/UEL/Lib/Sud): same idea as the cup fetch above — the header needs the
  // group letter (group stage) or the knockout stage name, and a 2nd leg needs the first-leg score.
  const [continentalMeta, setContinentalMeta] = useState<LeagueSeasonMeta | null>(null);
  useEffect(() => {
    if (!session?.saveId || !fixture || !isContinentalSlug(fixture.competition)) {
      setContinentalMeta(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/saves/${session.saveId}/continental/${fixture.competition}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ meta: LeagueSeasonMeta }>) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setContinentalMeta(data?.meta ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.saveId, fixture]);

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
    // Simulating instead of watching abandons any half-played live match of today (#64).
    clearMatchSnapshot();
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

  const { t, i18n } = useTranslation();

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
          <p className="text-muted-foreground text-sm m-0">Save Formation and Tactics (11 starters) then try again.</p>
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
          <Icon name="settings" className="w-10 h-10 text-primary mx-auto" />
          <p className="text-foreground font-bold text-lg m-0">{t("matchPreview.noTacticsTitle")}</p>
          <p className="text-muted-foreground text-sm m-0">{t("matchPreview.noTacticsSubtitle")}</p>
          <a
            href="/formation"
            className="inline-flex items-center gap-2 mt-1 px-6 h-10 rounded bg-primary text-primary-foreground font-semibold text-sm no-underline"
          >
            {t("matchPreview.goToTacticsNow")}
            <Icon name="chevron-right" className="w-4 h-4" />
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

  // Starters of the player's own XI whose fitness is below the "risk" threshold — surfaced as a
  // warning line above the action buttons (spec §3 "a prévia avisa titular com fôlego < 70").
  const LOW_FITNESS_THRESHOLD = 70;
  const myPlayersById = new Map((matchSetup?.mySquad.players ?? []).map((p) => [p.id, p]));
  const lowFitnessStarterNames = myLineup
    .map((id) => myPlayersById.get(id))
    .filter((p): p is RosterPlayer => !!p && (p.seasonLog?.fitness ?? 100) < LOW_FITNESS_THRESHOLD)
    .map((p) => `${p.name} (${Math.round(p.seasonLog?.fitness ?? 100)})`);

  const playerName = (id: string) => myPlayersById.get(id)?.name ?? id;
  const playerFitness = (id: string) => Math.round(myPlayersById.get(id)?.seasonLog?.fitness ?? 100);

  async function postRotation(swaps: { out: string; in: string }[], optOut = false) {
    if (!session || rotationBusy) return;
    setRotationBusy(true);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/rotation-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: session.currentDate, swaps, optOut }),
      });
      if (!res.ok) return;
      const setupRes = await fetch(`/api/match-setup?saveId=${encodeURIComponent(session.saveId)}`);
      if (!setupRes.ok) return;
      setMatchSetup((await setupRes.json()) as MatchSetupData);
      setLocalLineup([]);
    } finally {
      setRotationBusy(false);
    }
  }

  const myTactics: TacticalStyle = session.tactical_style;
  const oppTactics: TacticalStyle = DEFAULT_TACTICAL_STYLE;

  const currentDate = session.currentDate ?? "";
  const { weather, referee, venue: venueOrHost } = getMatchMeta(currentDate, session.clubName, isHome);
  const venue = fixture?.neutral ? t("cups.neutral") : venueOrHost;
  const competition = fixture
    ? competitionName(fixture.competition, catalogLeagues, i18n.language)
    : "Premier Division";
  const matchday = fixture?.round ?? 1;
  const isCupTie = fixture ? isCupSlug(fixture.competition) : false;
  const cupStageName = isCupTie
    ? cupMeta?.cup?.stages.find((s) => s.round === fixture!.round)?.name
    : undefined;

  const isContinentalTie = fixture ? isContinentalSlug(fixture.competition) : false;
  const continentalStageName = isContinentalTie
    ? continentalMeta?.continental?.stages.find((s) => s.rounds.includes(fixture!.round))?.name
    : undefined;
  const continentalGroup = isContinentalTie
    ? continentalMeta?.continental?.groups.find((g) => g.clubs.includes(mySquadId || session.clubId))?.name
    : undefined;
  const continentalLegLabel =
    fixture?.leg === 1 ? t("continental.leg1") : fixture?.leg === 2 ? t("continental.leg2") : undefined;
  const continentalPhase =
    !isContinentalTie ? undefined :
    continentalStageName === "group" ? t("continental.groupRound", { group: continentalGroup ?? "?", round: matchday }) :
    continentalStageName ? [t(`continental.stage.${continentalStageName}`), continentalLegLabel].filter(Boolean).join(" · ") :
    undefined;

  const myLogoUrl  = squadLogoUrl(mySquadId || session.clubId);
  const oppLogoUrl = opponentId ? squadLogoUrl(opponentId) : undefined;

  // Assign home/away
  const homeSquadName    = isHome ? session.clubName       : opponentName;
  const awaySquadName    = isHome ? opponentName           : session.clubName;
  const homeSquad        = isHome ? matchSetup?.mySquad ?? null : opponentSquad;
  const awaySquad        = isHome ? opponentSquad          : matchSetup?.mySquad ?? null;
  const oppAutoLineup = opponentSquad
    ? autoFillLineupWithFitness(
        oppFormationSlots as Parameters<typeof autoFillLineupWithFitness>[0],
        opponentSquad.players,
        currentDate,
      )
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
  const kits = resolveMatchTeamKitColors(
    { primary: homePrimary, secondary: squadSecondaryColor(homeSquad, homePrimary) },
    { primary: awayPrimary, secondary: squadSecondaryColor(awaySquad, awayPrimary) },
  );
  // Drawn on the dark background: lift black/navy kits so accents stay readable.
  const homeHex = readableOnDark(kits.teamA);
  const awayHex = readableOnDark(kits.teamB);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-8 gap-7 overflow-y-auto">

      {/* Match title */}
      <div className="text-center space-y-1 shrink-0">
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">
          {isCupTie
            ? (cupStageName ? <>{t(`cups.stage.${cupStageName}`)} &bull; {competition}</> : competition)
            : isContinentalTie
            ? (continentalPhase ? <>{continentalPhase} &bull; {competition}</> : competition)
            : <>{t("leagues.matchday", { round: matchday })} &bull; {competition}</>}
        </p>
        <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0">
          <TitleParts accent={t("screenTitles.matchPreview.accent")}>{t("screenTitles.matchPreview.main")}</TitleParts>
        </h1>
        <div
          className="w-16 h-0.5 mx-auto rounded-full opacity-80"
          style={{ background: `linear-gradient(to right, ${homeHex} 50%, ${awayHex} 50%)` }}
        />
        {isContinentalTie && fixture?.leg === 2 && fixture.aggregate && (
          <div className="pt-1 space-y-0.5">
            {/* fixture.home/away are this (2nd) leg's sides; the 1st leg had them swapped, and
                `aggregate` holds each side's 1st-leg goals from THIS fixture's home/away point of
                view — so the 1st leg's home team is this fixture's AWAY side, and vice versa. */}
            <p className="text-sm text-muted-foreground m-0">
              {t("continental.firstLeg", {
                home: awaySquadName,
                away: homeSquadName,
                score: `${fixture.aggregate.away}–${fixture.aggregate.home}`,
              })}
            </p>
            <p className="text-sm text-muted-foreground/70 m-0">{t("continental.aggregateNote")}</p>
          </div>
        )}
      </div>

      {/* Team cards */}
      <div className="w-full max-w-5xl min-[1600px]:max-w-6xl flex items-stretch gap-5">
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
            <span className="text-[13px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em] font-display">
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
      <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
        <div className="card-arcade rounded-md px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <InfoCell icon={MapPin} label={t("matchPreview.venue")} value={venue} />
            <InfoCell icon={Cloud} label={t("matchPreview.weather")} value={`${weather.icon} ${weather.label}`} />
            <InfoCell icon={Clock} label={t("matchPreview.kickoff")} value="20:00 GMT" />
            <InfoCell icon={User} label={t("matchPreview.officials")} value={referee} />
          </div>
          {/* A 2nd leg with an aggregate already shows continental.aggregateNote under the header
              (same "extra time / penalties if level" info) — don't repeat it here. */}
          {fixture?.knockout && !fixture.aggregate && (
            <p className="text-sm text-muted-foreground text-center mt-3 mb-0">{t("cups.knockoutNote")}</p>
          )}
        </div>
      </div>

      {/* Low-fitness warning — starters of the player's own XI below the risk threshold */}
      {lowFitnessStarterNames.length > 0 && (
        <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
          <div className="flex items-start gap-2 rounded-md border border-chart-4/40 bg-chart-4/10 px-4 py-2.5">
            <Icon name="alert" size={16} className="text-chart-4 mt-0.5 shrink-0" />
            <p className="text-sm text-chart-4 m-0">
              {t("matchPreview.lowFitnessWarning", { names: lowFitnessStarterNames.join(", ") })}
            </p>
          </div>
        </div>
      )}

      {/* Rotation suggestion — tired starters the user can rest for this match */}
      {!rotationHidden && !!matchSetup?.rotationSuggestion && matchSetup.rotationSuggestion.length > 0 && (
        <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
          <div className="flex items-start gap-2 rounded-md border border-chart-4/40 bg-chart-4/10 px-4 py-2.5">
            <Icon name="alert" size={16} className="text-chart-4 mt-0.5 shrink-0" />
            <div className="text-sm text-chart-4 m-0 space-y-0.5 flex-1">
              <p className="m-0 font-bold">
                {t("matchPreview.rotationTitle", { count: matchSetup.rotationSuggestion.length })}
              </p>
              {matchSetup.rotationSuggestion.map((s, i) => (
                <p key={i} className="m-0">
                  {t("matchPreview.rotationSwap", {
                    out: playerName(s.out), outFit: playerFitness(s.out),
                    in: playerName(s.in), inFit: playerFitness(s.in),
                  })}
                </p>
              ))}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={rotationBusy}
                onClick={() => postRotation(matchSetup.rotationSuggestion ?? [])}
                className="px-3 py-1 rounded-lg bg-chart-4/20 text-chart-4 text-sm font-bold hover:bg-chart-4/30 disabled:opacity-50 cursor-pointer"
              >
                {t("matchPreview.rotationApply")}
              </button>
              <button
                type="button"
                onClick={() => setRotationHidden(true)}
                className="px-3 py-1 rounded-lg text-chart-4 text-sm hover:bg-foreground/10 cursor-pointer"
              >
                {t("matchPreview.rotationIgnore")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotation already applied (assistant or accepted suggestion) */}
      {!!matchSetup?.rotationApplied && matchSetup.rotationApplied.length > 0 && (
        <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
          <div className="flex items-start gap-2 rounded-md border border-chart-2/40 bg-chart-2/10 px-4 py-2.5">
            <Icon name="check-circle" size={16} className="text-chart-2 mt-0.5 shrink-0" />
            <div className="text-sm text-chart-2 m-0 space-y-0.5 flex-1">
              <p className="m-0 font-bold">
                {t("matchPreview.rotationApplied", { count: matchSetup.rotationApplied.length })}
              </p>
              {matchSetup.rotationApplied.map((s, i) => (
                <p key={i} className="m-0">
                  {t("matchPreview.rotationSwap", {
                    out: playerName(s.out), outFit: playerFitness(s.out),
                    in: playerName(s.in), inFit: playerFitness(s.in),
                  })}
                </p>
              ))}
            </div>
            <button
              type="button"
              disabled={rotationBusy}
              onClick={() => postRotation([], true)}
              className="px-3 py-1 rounded-lg text-chart-2 text-sm font-bold hover:bg-foreground/10 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {t("matchPreview.rotationUndo")}
            </button>
          </div>
        </div>
      )}

      {/* Injured-starter replacements — players the saved lineup wanted who were swapped out for being injured */}
      {!!matchSetup?.injuredReplaced && matchSetup.injuredReplaced.length > 0 && (
        <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5">
            <Icon name="alert" size={16} className="text-destructive mt-0.5 shrink-0" />
            <div className="text-sm text-destructive m-0 space-y-0.5">
              {matchSetup.injuredReplaced.map((swap, i) => (
                <p key={i} className="m-0">
                  {t(swap.reason === "suspended" ? "matchPreview.suspendedReplaced" : "matchPreview.injuredReplaced", { out: playerName(swap.out), in: playerName(swap.in) })}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons: the standard Button for all four (#65 follow-up) — secondary for the
          side actions, primary for Start game, same font and height. */}
      <div className="flex items-center gap-4 shrink-0 pb-2 flex-wrap justify-center">
        <Button variant="secondary" onClick={() => { window.location.href = "/formation"; }}>
          <Icon name="settings" size={16} />
          {t("matchPreview.editTactics")}
        </Button>

        <Button variant="secondary" onClick={() => setShowLastMinuteSubs(true)}>
          <Icon name="arrow-right-left" size={16} />
          {t("matchPreview.lastMinuteSubs")}
        </Button>

        <Button variant="secondary" onClick={handleSendAssistant} disabled={commencing}>
          {commencing ? t("matchPreview.simulating") : t("matchPreview.sendAssistant")}
          {!commencing && <Icon name="chevron-right" size={16} />}
        </Button>

        <Button variant="primary" onClick={handleStartGame} disabled={commencing}>
          {t("matchPreview.startGame")}
          <Icon name="play" size={16} />
        </Button>
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
        <Icon className="w-4 h-4" />
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] font-display">{label}</span>
      </div>
      <p className="text-base font-semibold text-foreground m-0">{value}</p>
    </div>
  );
}
