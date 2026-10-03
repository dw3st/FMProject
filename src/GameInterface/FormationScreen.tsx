import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { updateSaveFormation, updateSaveTacticalStyle, saveFormationAndTactics } from "@/GameInterface/gameSession";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationSlot, FormationShape } from "@/types/formationSlots";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { useDragDrop, DragGhost } from "@/GameInterface/Components/useDragDrop";
import type { DragSource, DropTarget } from "@/GameInterface/Components/useDragDrop";
import { dropOnLineup } from "@/Domain/formation/lineupDrop";
import {
  CUSTOM_FORMATION_ID,
  ZONE_COLS,
  ZONE_ROWS,
  customShape,
  customToFormation,
  slotForZone,
  snapToZones,
  validateCustomFormation,
  zoneCenter,
  zoneRole,
} from "@/Domain/formation/zones";
import { FORMATION_IDS } from "@/Domain/matchFormations";
import {
  TACTICAL_STYLE_OPTIONS,
  DEFAULT_TACTICAL_STYLE,
  getTacticalStyleMeta,
  axesFor,
  effectiveAxes,
  hasAxesOverride,
} from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave, TacticalAxes, CustomFormation, CustomFormationSlot } from "@/types/tacticsTypes";
import type { Squad, RosterPlayer } from "@/types/playerTypes";
import { getDetailedPositionColor, getMainRole, MAIN_ROLE_ABBR, positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { PlayerFace, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { aptitudeFor, preferredRole, slotValue, type Aptitude } from "@/Domain/positions/positionAptitude";
import { sortBenchByPosition } from "@/Domain/positions/positionLineup";

/** Aptitudes that deserve a warning on the formation screen. */
const isPoorFit = (apt: Aptitude) => apt === "training" || apt === "unsuitable";

const APT_DOT: Record<Aptitude, string> = {
  natural: "bg-chart-2",
  apt: "bg-chart-2",
  training: "bg-chart-4",
  unsuitable: "bg-destructive",
};
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { LoadIndicator } from "@/GameInterface/Components/LoadIndicator";
import {
  autoFillLineupWithFitness,
  buildSlotAlignedLineup,
  slotRoleFitRank,
  remapLineupToFormation,
} from "@/Domain/lineupHelpers";
import { isSuspended, isUnavailable } from "@/Domain/discipline/discipline";
import { Icon } from "@/GameInterface/Icons";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { Chip } from "@/GameInterface/ui/Chip";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SetPieceTakersPanel } from "@/GameInterface/Components/SetPieceTakersPanel";
import { FamiliarityBars } from "@/GameInterface/Components/FamiliarityBars";

interface FormationOption {
  id: string;
}

const DEFAULT_FORMATION = "4-3-3";

/** English fallback. UI prefers the i18n key `formations.blurbs.<id>` when available. */
const FORMATION_BLURBS: Record<string, string> = {
  "4-3-3": "Three forwards up top with midfield control and defensive stability.",
  "4-4-2": "Paired strikers backed by a balanced flat four across midfield.",
  "3-5-2": "Five midfielders dominate possession with wing-backs providing width.",
};

function getEnergyColor(energy: number) {
  if (energy >= 80) return "bg-chart-2";
  if (energy >= 50) return "bg-chart-4";
  return "bg-destructive";
}

export function FormationScreen() {
  const { t } = useTranslation();
  const { session, squad, loading: saveLoading, mergeSession, currentDate } = useGameSave();
  const [formations, setFormations] = useState<FormationOption[]>([]);
  const [baseSlots, setSlots] = useState<FormationSlot[]>([]);
  const [attacking, setAttacking] = useState<{ role: string; x: number; y: number }[]>([]);
  const [savedLineup, setSavedLineup] = useState<string[]>([]);
  const [customFormation, setCustomFormation] = useState<CustomFormation | null>(null);
  const [axesOverride, setAxesOverride] = useState<Partial<TacticalAxes> | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ slot: CustomFormationSlot; playerId: string }[] | null>(null);
  const [assistantRotation, setAssistantRotation] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [tacticsUpdating, setTacticsUpdating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);
  const [benchTab, setBenchTab] = useState<"starting" | "bench">("starting");
  const [lineupReady, setLineupReady] = useState(false);

  const formationId = session?.formation ?? DEFAULT_FORMATION;

  // While editing the formation the pitch and the lineup come from the draft.
  const draftSlots = useMemo(
    () =>
      draft
        ? getFormationSlots({ id: "draft", attacking: draft.map((d) => d.slot) } as FormationShape)
        : null,
    [draft],
  );
  const slots = editing && draftSlots ? draftSlots : baseSlots;
  const lineup = editing && draft ? draft.map((d) => d.playerId) : savedLineup;
  const validation = editing && draft ? validateCustomFormation(draft.map((d) => d.slot)) : null;

  function setLineup(next: string[]) {
    if (editing && draft) setDraft(draft.map((d, i) => ({ ...d, playerId: next[i] ?? "" })));
    else setSavedLineup(next);
  }

  const { drag, dragProps, consumeClick } = useDragDrop(handleDrop);

  useEffect(() => {
    if (!saveLoading && !session) {
      window.location.href = "/new-game";
    }
  }, [saveLoading, session]);

  useEffect(() => {
    if (!session) return;
    const saveId = session.saveId;
    fetch(`/api/saves/${saveId}/tactics`)
      .then((r) => r.json())
      .then((t: TacticsSave) => {
        if (t.lineup?.length) setSavedLineup(t.lineup);
        setCustomFormation(t.customFormation ?? null);
        setAxesOverride(t.axesOverride);
        setAssistantRotation(t.assistantRotation === true);
        mergeSession({
          formation: t.formation,
          tactical_style: t.tactical_style,
        });
        setLineupReady(true);
      })
      .catch(() => { setLineupReady(true); });
  }, [session?.saveId, mergeSession]);

  // Auto-fill lineup when no saved lineup exists and both slots and squad are available.
  useEffect(() => {
    if (!lineupReady || !squad || baseSlots.length === 0 || savedLineup.length > 0) return;
    setSavedLineup(autoFillLineupWithFitness(baseSlots, squad.players, currentDate));
  }, [lineupReady, baseSlots, squad, savedLineup.length, currentDate]);

  useEffect(() => {
    fetch("/api/formations")
      .then((r) => r.json())
      .then((data: FormationOption[]) => setFormations(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!formationId) return;
    if (formationId === CUSTOM_FORMATION_ID) {
      if (!customFormation) return;
      const f = customToFormation(customFormation);
      setAttacking(f.attacking);
      setSlots(getFormationSlots(f as unknown as FormationShape));
      return;
    }
    fetch(`/api/formations/${formationId}`)
      .then((r) => r.json())
      .then((data: { id: string; attacking: { role: string; x: number; y: number }[] }) => {
        setAttacking(data.attacking);
        setSlots(getFormationSlots(data));
      })
      .catch(() => setSlots([]));
  }, [formationId, customFormation]);

  useEffect(() => {
    if (selectedSlotIdx === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedSlotIdx(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedSlotIdx]);

  async function handleSelectFormation(id: string) {
    if (!session || id === formationId || updating) return;
    setUpdating(true);
    try {
      // Resolve the target slots so the current XI follows its best-fit slots in the new shape.
      let nextSlots: FormationSlot[] | null = null;
      try {
        if (id === CUSTOM_FORMATION_ID) {
          if (customFormation) nextSlots = getFormationSlots(customToFormation(customFormation) as unknown as FormationShape);
        } else {
          const data = (await (await fetch(`/api/formations/${id}`)).json()) as { id: string; attacking: { role: string; x: number; y: number }[] };
          nextSlots = getFormationSlots(data);
        }
      } catch {
        nextSlots = null;
      }
      if (nextSlots && squad && savedLineup.length > 0) {
        const remapped = remapLineupToFormation(savedLineup, nextSlots, squad.players, currentDate);
        const updated = await saveFormationAndTactics(session.saveId, {
          formation: id,
          tactical_style: session.tactical_style ?? DEFAULT_TACTICAL_STYLE,
          lineup: remapped,
          ...(id === CUSTOM_FORMATION_ID && customFormation ? { customFormation } : {}),
        });
        mergeSession(updated);
        setSavedLineup(remapped);
      } else {
        const updated = await updateSaveFormation(session.saveId, id);
        mergeSession(updated);
      }
    } finally {
      setUpdating(false);
    }
  }

  async function handleStyleChange(style: TacticalStyle) {
    if (!session || tacticsUpdating) return;
    if (session.tactical_style === style && !hasAxesOverride(style, axesOverride)) return;
    setTacticsUpdating(true);
    try {
      const updated = await updateSaveTacticalStyle(session.saveId, style);
      setAxesOverride(undefined);
      mergeSession(updated);
    } finally {
      setTacticsUpdating(false);
    }
  }

  /** Edits one axis on top of the style; going back to the style's own value drops the override. */
  async function handleAxis<K extends keyof TacticalAxes>(key: K, value: TacticalAxes[K]) {
    if (!session) return;
    const style = session.tactical_style ?? DEFAULT_TACTICAL_STYLE;
    const next: Partial<TacticalAxes> = { ...axesOverride, [key]: value };
    if (axesFor(style)[key] === value) delete next[key];
    const nextOrUndefined = Object.keys(next).length ? next : undefined;
    const prev = axesOverride;
    setAxesOverride(nextOrUndefined);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/tactics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ axesOverride: nextOrUndefined ?? {} }),
      });
      if (!res.ok) setAxesOverride(prev);
    } catch {
      setAxesOverride(prev);
    }
  }

  // ── Formation editor (zone grid) ───────────────────────────────────────────

  function startEditing() {
    if (!squad) return;
    const base: CustomFormationSlot[] =
      formationId === CUSTOM_FORMATION_ID && customFormation ? customFormation.slots : snapToZones(attacking);
    if (base.length !== 11) return;
    setDraft(base.map((slot, i) => ({ slot, playerId: savedLineup[i] ?? "" })));
    setEditing(true);
    setSelectedSlotIdx(null);
  }

  function cancelEditing() {
    setEditing(false);
    setDraft(null);
    setSelectedSlotIdx(null);
  }

  function moveDraftSlot(index: number, row: number, col: number) {
    if (!draft) return;
    const target = slotForZone(row, col);
    if (!target || index < 0 || index >= draft.length) return;
    const taken = draft.some((d, i) => i !== index && d.slot.x === target.x && d.slot.y === target.y);
    if (taken) return;
    setDraft(draft.map((d, i) => (i === index ? { ...d, slot: target } : d)));
  }

  async function applyEditing() {
    if (!draft || !session || validation?.ok !== true || saveStatus === "saving") return;
    // Canonical slot order (goalkeeper first, then depth, then left to right); the lineup follows.
    const sorted = [...draft].sort((a, b) => a.slot.x - b.slot.x || a.slot.y - b.slot.y);
    const custom: CustomFormation = { slots: sorted.map((d) => d.slot) };
    const ids = sorted.map((d) => d.playerId);
    setSaveStatus("saving");
    try {
      const updated = await saveFormationAndTactics(session.saveId, {
        formation: CUSTOM_FORMATION_ID,
        tactical_style: session.tactical_style ?? DEFAULT_TACTICAL_STYLE,
        lineup: ids,
        customFormation: custom,
      });
      mergeSession(updated);
      setCustomFormation(custom);
      setSavedLineup(ids);
      setEditing(false);
      setDraft(null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  function handleDrop(source: DragSource, target: DropTarget) {
    if (target.kind === "zone") {
      if (editing && source.kind === "slot") moveDraftSlot(Number(source.key), target.row, target.col);
      return;
    }
    const from = source.kind === "slot" ? { kind: "slot" as const, index: Number(source.key) } : { kind: "bench" as const, playerId: source.key };
    const to = target.kind === "slot" ? { kind: "slot" as const, index: target.index } : { kind: "bench" as const, playerId: target.playerId };
    const next = dropOnLineup(lineup, from, to, (id) => {
      const p = squad?.players.find((x) => x.id === id);
      return p ? isUnavailable(p, currentDate) : false;
    });
    if (next) {
      setLineup(next);
      setSelectedSlotIdx(null);
    }
  }

  async function handleAssistantRotation(next: boolean) {
    if (!session) return;
    setAssistantRotation(next);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/tactics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantRotation: next }),
      });
      if (!res.ok) setAssistantRotation(!next);
    } catch {
      setAssistantRotation(!next);
    }
  }

  function handleAutoFill() {
    if (!squad || slots.length === 0 || editing) return;
    setLineup(autoFillLineupWithFitness(slots, squad.players, currentDate));
    setSelectedSlotIdx(null);
  }

  async function handleSave() {
    if (!session || saveStatus === "saving" || !squad) return;
    setSaveStatus("saving");
    try {
      const starting11Ids = [...lineup];
      while (starting11Ids.length < 11) starting11Ids.push("");
      const toSave = starting11Ids.slice(0, 11);
      const updated = await saveFormationAndTactics(session.saveId, {
        formation:      formationId,
        tactical_style: session.tactical_style ?? DEFAULT_TACTICAL_STYLE,
        lineup:         toSave,
      });
      mergeSession(updated);
      setSavedLineup(toSave);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }

  function handleSlotClick(slotIdx: number) {
    if (consumeClick()) return;
    if (selectedSlotIdx === null) {
      setSelectedSlotIdx(slotIdx);
      setBenchTab("bench");
    } else if (selectedSlotIdx === slotIdx) {
      setSelectedSlotIdx(null);
    } else {
      // Swap two slots
      const newLineup = [...lineup];
      while (newLineup.length <= Math.max(selectedSlotIdx, slotIdx)) newLineup.push("");
      const tmp = newLineup[selectedSlotIdx]!;
      newLineup[selectedSlotIdx] = newLineup[slotIdx]!;
      newLineup[slotIdx] = tmp;
      setLineup(newLineup);
      setSelectedSlotIdx(null);
    }
  }

  function handleAssignPlayer(player: RosterPlayer) {
    if (consumeClick()) return;
    if (selectedSlotIdx === null) return;
    if (isUnavailable(player, currentDate)) return;
    const newLineup = [...lineup];
    while (newLineup.length <= selectedSlotIdx) newLineup.push("");
    // If player is already in lineup, swap positions
    const existingIdx = newLineup.indexOf(player.id);
    if (existingIdx !== -1) {
      newLineup[existingIdx] = newLineup[selectedSlotIdx] ?? "";
    }
    newLineup[selectedSlotIdx] = player.id;
    setLineup(newLineup);
    setSelectedSlotIdx(null);
    setBenchTab("starting");
  }

  const activeStyle: TacticalStyle = session?.tactical_style ?? DEFAULT_TACTICAL_STYLE;

  const shapeLabel =
    editing && draft
      ? customShape(draft.map((d) => d.slot))
      : formationId === CUSTOM_FORMATION_ID && customFormation
        ? customShape(customFormation.slots)
        : formationId;
  const parts = shapeLabel.split("-").map(Number);
  const defenders = parts[0] ?? 0;
  const forwards = parts[parts.length - 1] ?? 0;
  const midfielders = parts.slice(1, -1).reduce((a, b) => a + b, 0);
  const dropHover = drag?.over ?? null;
  const occupiedZones = new Set(
    (draft ?? []).map((d) => {
      for (let r = 0; r < ZONE_ROWS; r++)
        for (let c = 0; c < ZONE_COLS; c++) {
          const z = zoneCenter(r, c);
          if (z.x === d.slot.x && z.y === d.slot.y) return `${r}:${c}`;
        }
      return "";
    }),
  );

  const startingBySlot = squad ? buildSlotAlignedLineup(squad.players, lineup) : Array<RosterPlayer | undefined>(11).fill(undefined);
  const usedInXi = new Set(
    startingBySlot.filter((p): p is RosterPlayer => p !== undefined).map((p) => p.id),
  );
  const bench = squad ? sortBenchByPosition(squad.players.filter((p) => !usedInXi.has(p.id))) : [];

  const targetSlotRole =
    selectedSlotIdx !== null && slots[selectedSlotIdx] ? slots[selectedSlotIdx]!.role : undefined;

  const benchOrderedForSlot =
    targetSlotRole && bench.length > 0
      ? [...bench].sort((a, b) => {
          const fit = slotRoleFitRank(b, targetSlotRole) - slotRoleFitRank(a, targetSlotRole);
          if (fit !== 0) return fit;
          return (
            slotValue(b, targetSlotRole) - slotValue(a, targetSlotRole)
          );
        })
      : bench;

  if (saveLoading || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <ScreenContainer>
          <PageHeadline
            backHref="/dashboard"
            subtitle={t("formations.subtitleHelp")}
            trailing={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={!squad || slots.length === 0 || editing}
                  className="flex items-center gap-2 py-3 px-4 rounded-md bg-secondary text-foreground font-bold text-sm uppercase tracking-[0.08em] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-transform border border-border/50 hover:border-primary/40 hover:bg-primary/10 font-display"
                >
                  <Icon name="staff" className="w-4 h-4" />
                  {t("formations.autoPosition")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === "saving" || !session || editing}
                  className="flex items-center gap-2 h-10 px-6 rounded bg-primary text-primary-foreground font-semibold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
                >
                  <Icon name="save" className="w-4 h-4" />
                  {saveStatus === "saving" ? t("formations.saving") : saveStatus === "saved" ? t("formations.saved") : t("common.save")}
                </button>
              </div>
            }
          >
            {t("formations.title")} <span className="text-primary">{t("formations.subtitleTactics")}</span>
          </PageHeadline>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Formation Selector — absolute inside cell so pitch dictates row height */}
            <div className="lg:col-span-3 lg:relative">
              <div className="card-arcade rounded-md p-4 lg:absolute lg:inset-0 overflow-y-auto">
                <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-4">
                  {t("formations.selectFormation")}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {formations.map((f) => {
                    const supported = FORMATION_IDS.includes(f.id);
                    const isActive = f.id === formationId;
                    return (
                      <div key={f.id} className="relative group">
                        <Chip
                          selected={isActive}
                          onClick={() => supported ? handleSelectFormation(f.id) : undefined}
                          disabled={updating || !supported}
                          className="w-full py-2.5 tabular-nums"
                        >
                          {f.id}
                        </Chip>
                        {!supported && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-card border border-border text-sm text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            {t("common.comingSoon")}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-card border-r border-b border-border rotate-45 -mt-1" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {formations.length === 0 && (
                  <p className="text-muted-foreground text-sm py-4 text-center m-0">{t("formations.noFormations")}</p>
                )}
                {customFormation && (
                  <Chip
                    selected={formationId === CUSTOM_FORMATION_ID}
                    onClick={() => handleSelectFormation(CUSTOM_FORMATION_ID)}
                    disabled={updating || editing}
                    className="mt-2 w-full tabular-nums"
                  >
                    {t("formations.custom")} {customShape(customFormation.slots)}
                  </Chip>
                )}
                <Chip
                  selected={editing}
                  onClick={editing ? cancelEditing : startEditing}
                  disabled={!squad || attacking.length === 0}
                  className="mt-3 w-full"
                >
                  <Icon name="formation" className="w-4 h-4" />
                  {editing ? t("formations.editor.cancel") : t("formations.editor.edit")}
                </Chip>

                <div className="mt-6 pt-4 border-t border-border/30">
                  <h4 className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] mb-2 font-display font-bold">{t("formations.formationInfo")}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("formations.title")}</span>
                      <span className="font-bold text-foreground">{shapeLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("roles.groups.Defender")}</span>
                      <span className="font-bold text-foreground">{defenders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("roles.groups.Midfielder")}</span>
                      <span className="font-bold text-foreground">{midfielders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("roles.groups.Forward")}</span>
                      <span className="font-bold text-foreground">{forwards}</span>
                    </div>
                  </div>
                  {(t(`formations.blurbs.${formationId}`, { defaultValue: FORMATION_BLURBS[formationId] ?? "" }) as string) && (
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed m-0">
                      {t(`formations.blurbs.${formationId}`, { defaultValue: FORMATION_BLURBS[formationId] ?? "" })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Pitch Preview */}
            <div className="lg:col-span-6">
              {editing && (
                <div className="mb-3 rounded-md border border-primary/50 p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-48">
                    <p className="font-display font-black uppercase text-base leading-none m-0">
                      {t("formations.editor.title")} · {shapeLabel}
                    </p>
                    <p className={`text-sm m-0 mt-1 ${validation && !validation.ok ? "text-destructive" : "text-muted-foreground"}`}>
                      {validation && !validation.ok
                        ? t(`formations.editor.invalid.${validation.reason}` as never)
                        : t("formations.editor.hint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-0"
                  >
                    {t("formations.editor.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={applyEditing}
                    disabled={validation?.ok !== true || saveStatus === "saving"}
                    title={validation && !validation.ok ? t(`formations.editor.invalid.${validation.reason}` as never) : undefined}
                    className="flex items-center gap-2 h-10 px-5 rounded bg-primary text-primary-foreground font-semibold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
                  >
                    <Icon name="save" className="w-4 h-4" />
                    {t("formations.editor.apply")}
                  </button>
                </div>
              )}
              <FormationPitch
                slots={slots}
                formationId={formationId === CUSTOM_FORMATION_ID ? `${t("formations.custom")} ${shapeLabel}` : formationId}
                editing={editing}
                occupiedZones={occupiedZones}
                dragProps={dragProps}
                dropHover={dropHover}
                players={startingBySlot}
                selectedSlotIdx={selectedSlotIdx}
                onSlotClick={handleSlotClick}
                getOutOfPosition={(player, slotRole) => isPoorFit(aptitudeFor(player, slotRole))}
                clubColors={squad?.colors}
              />
            </div>

            {/* Squad Panel — absolute inside cell so pitch dictates row height */}
            <div className="lg:col-span-3 lg:relative">
              <div className="card-arcade rounded-md p-4 flex flex-col lg:absolute lg:inset-0 overflow-hidden">
                <SegmentedTabs
                  fill
                  compact
                  className="mb-4 shrink-0"
                  tabs={[
                    { key: "starting", label: <><Icon name="staff" className="w-4 h-4" />{t("formations.starting11")}</> },
                    { key: "bench", label: <><Icon name="user-plus" className="w-4 h-4" />{t("formations.bench")}</> },
                  ]}
                  active={benchTab}
                  onChange={setBenchTab}
                />

                {selectedSlotIdx !== null ? (
                  <p className="text-sm text-primary mb-3 px-2 py-1.5 bg-primary/10 rounded-lg border border-primary/30 m-0 shrink-0">
                    {t("formations.selectPlayerForSlot")} <span className="font-bold">{slots[selectedSlotIdx]?.role ?? selectedSlotIdx + 1}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mb-3 m-0 shrink-0">
                    {benchTab === "starting" ? t("formations.currentStartingLineup") : t("formations.clickSlotHint")}
                  </p>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {benchTab === "starting" ? (
                    startingBySlot.map((player, idx) =>
                      player ? (
                        <SquadPlayerRow
                          key={player.id}
                          player={player}
                          slotLabel={slots[idx]?.role}
                          ratingRole={slots[idx]?.role}
                          showSlot
                          rowProps={{
                            "data-drop": `slot:${idx}`,
                            ...dragProps({ kind: "slot", key: String(idx) }, player.name),
                          }}
                          dropHover={dropHover === `slot:${idx}`}
                          selected={selectedSlotIdx === idx}
                          outOfPosition={slots[idx] ? isPoorFit(aptitudeFor(player, slots[idx]!.role)) : false}
                          aptitude={slots[idx] ? aptitudeFor(player, slots[idx]!.role) : undefined}
                          onClick={() => handleSlotClick(idx)}
                          injured={isUnavailable(player, currentDate)}
                        />
                      ) : (
                        <button
                          key={`empty-slot-${idx}`}
                          type="button"
                          data-drop={`slot:${idx}`}
                          onClick={() => handleSlotClick(idx)}
                          className={`flex w-full items-center gap-2 p-2 rounded-lg border text-left transition-colors cursor-pointer border-dashed ${
                            dropHover === `slot:${idx}`
                              ? "bg-primary/20 border-primary"
                              : selectedSlotIdx === idx
                              ? "bg-primary/20 border-primary/50"
                              : "bg-muted/20 border-border/50 hover:bg-muted/40"
                          }`}
                        >
                          <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground w-6 shrink-0 font-display">
                            {slots[idx]?.role?.slice(0, 2) ?? "—"}
                          </span>
                          <span className="text-sm text-muted-foreground">{t("formations.emptySlotTapToFill")}</span>
                        </button>
                      ),
                    )
                  ) : (
                    bench.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4 m-0">{t("formations.noBenchPlayers")}</p>
                    ) : (
                      benchOrderedForSlot.map((player) => {
                        const injured = isUnavailable(player, currentDate);
                        return (
                          <SquadPlayerRow
                            key={player.id}
                            player={player}
                            ratingRole={targetSlotRole}
                            rowProps={{
                              "data-drop": `bench:${player.id}`,
                              ...(injured ? {} : dragProps({ kind: "bench", key: player.id }, player.name)),
                            }}
                            dropHover={dropHover === `bench:${player.id}`}
                            onClick={selectedSlotIdx !== null && !injured ? () => handleAssignPlayer(player) : undefined}
                            highlight={selectedSlotIdx !== null && !injured}
                            injured={injured}
                          />
                        );
                      })
                    )
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border/30 shrink-0">
                  <p className="text-sm text-muted-foreground text-center m-0">
                    {benchTab === "starting"
                      ? t("formations.playersInStartingLineup", { count: startingBySlot.filter(Boolean).length })
                      : t("formations.playersOnBench", { count: bench.length })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Assistant rotation */}
          <label className="card-arcade rounded-md p-5 flex items-center justify-between gap-4 cursor-pointer">
            <span>
              <span className="block font-display font-bold text-sm uppercase tracking-[0.08em] text-primary">
                {t("tactics.assistantRotation")}
              </span>
              <span className="block text-sm text-muted-foreground mt-1">{t("tactics.assistantRotationHint")}</span>
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 accent-primary cursor-pointer"
              checked={assistantRotation}
              onChange={(e) => handleAssistantRotation(e.target.checked)}
            />
          </label>

          {session && squad && <SetPieceTakersPanel saveId={session.saveId} players={squad.players} />}

          {/* Tactical Style */}
          <div className="card-arcade rounded-md p-5">
            <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-6">
              {t("tactics.tacticalStyle")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {TACTICAL_STYLE_OPTIONS.map((opt) => {
                const isActive = activeStyle === opt.value;
                const meta = getTacticalStyleMeta(opt.value, t as never);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleStyleChange(opt.value)}
                    disabled={tacticsUpdating}
                    className={`text-left p-4 rounded-md border-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? "bg-primary/10 border-primary"
                        : "bg-secondary/30 border-border/50 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-bold text-sm uppercase font-display tracking-[0.08em] ${isActive ? "text-primary" : "text-foreground"}`}>
                        {meta.label}
                      </span>
                      {isActive && (
                        <span className="text-[13px] px-2 py-0.5 rounded bg-primary text-primary-foreground font-bold uppercase tracking-[0.08em] font-display">
                          {t("common.active")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3 m-0">
                      {meta.description}
                    </p>
                    <div className="space-y-1.5">
                      {meta.strengths.map((s) => (
                        <div key={s} className="flex items-start gap-1.5 text-sm text-chart-2/90">
                          <Icon name="check-circle" className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </div>
                      ))}
                      {meta.weaknesses.map((w) => (
                        <div key={w} className="flex items-start gap-1.5 text-sm text-destructive/80">
                          <Icon name="xcircle" className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <FamiliarityBars familiarity={squad?.styleFamiliarity} current={activeStyle} />

          {/* Team instructions (the four axes) */}
          <div className="rounded-md border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="font-display font-black uppercase text-xl leading-none m-0">
                {t("tactics.axes.title")}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-primary font-semibold">
                  {hasAxesOverride(activeStyle, axesOverride)
                    ? t("tactics.axes.custom", { style: getTacticalStyleMeta(activeStyle, t as never).label })
                    : getTacticalStyleMeta(activeStyle, t as never).label}
                </span>
                {hasAxesOverride(activeStyle, axesOverride) && (
                  <button
                    type="button"
                    onClick={() => handleStyleChange(activeStyle)}
                    disabled={tacticsUpdating}
                    className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-0"
                  >
                    {t("tactics.axes.reset")}
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground m-0 mb-4">{t("tactics.axes.hint")}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {AXIS_CHOICES.map((axis) => {
                const current = effectiveAxes(activeStyle, axesOverride)[axis.key];
                return (
                  <div key={axis.key}>
                    <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">
                      {t(`tactics.axes.${axis.key}` as never)}
                    </p>
                    <OptionChips
                      aria-label={t(`tactics.axes.${axis.key}` as never)}
                      options={axis.values.map((v) => ({ key: v as string, label: t(`tactics.axes.values.${v}` as never) }))}
                      value={current as string}
                      onChange={(v) => handleAxis(axis.key, v as never)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        <DragGhost drag={drag} />
    </ScreenContainer>
  );
}

const AXIS_CHOICES: { key: keyof TacticalAxes; values: string[] }[] = [
  { key: "pressing_style", values: ["low_block", "mid_block", "high_press"] },
  { key: "defensive_line", values: ["deep", "normal", "high"] },
  { key: "width", values: ["narrow", "normal", "wide"] },
  { key: "build_up", values: ["direct", "balanced", "possession"] },
];

function SquadPlayerRow({
  player,
  slotLabel,
  ratingRole,
  showSlot,
  selected,
  highlight,
  outOfPosition,
  aptitude,
  onClick,
  injured,
  rowProps,
  dropHover,
}: {
  rowProps?: Record<string, unknown>;
  /** A dragged item is hovering over this row. */
  dropHover?: boolean;
  player: RosterPlayer;
  slotLabel?: string;
  /** Role used for weighted rating (formation slot). Falls back to slotLabel then primary position. */
  ratingRole?: string;
  showSlot?: boolean;
  selected?: boolean;
  highlight?: boolean;
  outOfPosition?: boolean;
  /** Aptitude of the player for the slot's role (coloured dot). */
  aptitude?: Aptitude;
  onClick?: () => void;
  injured?: boolean;
}) {
  const { t } = useTranslation();
  const scorePos = ratingRole ?? slotLabel ?? player.positions[0] ?? "CM";
  const avg = slotValue(player, scorePos);
  const energy = player.seasonLog?.fitness ?? 100;
  // Slot rows show the slot's detailed role; bench rows show the player's natural one (#40).
  const badgeRole = showSlot && slotLabel ? slotLabel : preferredRole(player);
  const badgeLabel = positionLabel(t, badgeRole, badgeRole);
  const textColor = positionLabelColor(badgeRole, badgeRole);

  return (
    <div
      className={`flex items-center gap-2 select-none ${onClick ? "cursor-pointer" : injured ? "opacity-60 cursor-not-allowed" : ""}`}
      onClick={onClick}
      {...rowProps}
    >
      {(showSlot && slotLabel) ? (
        <div className="flex items-center justify-center shrink-0 touch-none" data-drag-handle>
          <span className={`text-[13px] font-black uppercase font-display tracking-[0.08em] ${textColor}`}>
            {badgeLabel}
          </span>
        </div>
      ) : (
        <div className="shrink-0 touch-none" data-drag-handle>
          <span className={`text-[13px] font-black uppercase font-display tracking-[0.08em] ${textColor}`}>
            {badgeLabel}
          </span>
        </div>
      )}
      <div className={`flex-1 flex items-center gap-3 p-2 rounded-lg border transition-colors ${
        dropHover
          ? "bg-primary/20 border-primary"
          : highlight
          ? "bg-primary/10 border-primary/40 hover:bg-primary/20"
          : selected
          ? "bg-primary/20 border-primary/50"
          : outOfPosition
          ? "bg-chart-4/10 border-chart-4/40"
          : "bg-secondary/30 border-border/30"
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm text-foreground truncate m-0">{player.name}</p>
            {aptitude && (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${APT_DOT[aptitude]}`}
                title={t("roles.atSlot", { aptitude: t(`roles.aptitude.${aptitude}` as never), role: t(`roles.detailed.${ratingRole ?? slotLabel}` as never) })}
              />
            )}
            {outOfPosition && (
              <span title={t("formations.outOfPosition")}>
                <Icon name="alert" className="w-3 h-3 text-chart-4 shrink-0" aria-hidden />
              </span>
            )}
            {injured && player.injury && (
              <span
                className="text-sm font-black px-2 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 shrink-0"
                title={t(`formations.injurySeverity.${player.injury.severity}` as never)}
              >
                {t("formations.injuredUntil", { date: player.injury.returnDate })}
              </span>
            )}
            {injured && isSuspended(player) && (
              <span
                className="text-sm font-black px-2 py-0.5 rounded bg-chart-4/20 text-chart-4 border border-chart-4/40 shrink-0"
                title={t("formations.suspendedMatches", { count: player.suspension!.matches })}
              >
                {t("formations.suspended")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm tabular-nums mt-0.5">
            <div className="flex items-center gap-1">
              <Icon name="star" className="w-3 h-3 text-muted-foreground" />
              <span className={`font-bold ${ratingTextClass10(avg)}`}>{avg.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Icon name="zap" className="w-3 h-3" />
              <span>{Math.round(energy)}%</span>
              <LoadIndicator load={player.seasonLog?.load ?? 0} size={11} />
            </div>
          </div>
        </div>
        <div className="w-12 shrink-0">
          <div className="h-1.5 bg-border rounded overflow-hidden w-full min-w-16">
            <div
              className={`h-full rounded-full ${getEnergyColor(energy)}`}
              style={{ width: `${energy}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FormationPitch({
  slots,
  formationId,
  players,
  selectedSlotIdx,
  onSlotClick,
  getOutOfPosition,
  editing,
  occupiedZones,
  dragProps,
  dropHover,
  clubColors,
}: {
  /** Kit colours of the club, used for the generated faces on the markers. */
  clubColors?: readonly string[];
  editing?: boolean;
  /** "row:col" of the zones already used by a position (edit mode). */
  occupiedZones?: Set<string>;
  dragProps: (source: DragSource, label: string) => Record<string, unknown>;
  dropHover?: string | null;
  slots: FormationSlot[];
  formationId: string;
  /** One entry per slot index; undefined = empty slot. */
  players: (RosterPlayer | undefined)[];
  selectedSlotIdx: number | null;
  onSlotClick: (slotIdx: number) => void;
  getOutOfPosition?: (player: RosterPlayer, slotRole: string) => boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="card-arcade rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">
          {t("formations.preview")} — {formationId}
        </h3>
        <span className="text-sm text-muted-foreground">
          {t("formations.clickPositionHint")}
        </span>
      </div>

      {/* Field layer is clipped; markers sit outside so hover cards are not cut off */}
      <div className="relative w-full aspect-[3/4] rounded-md border border-chart-2/50">
        <div className="absolute inset-0 rounded-md overflow-hidden">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="5" y="5" width="90" height="90" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.3)" />
            <rect x="25" y="5" width="50" height="18" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <rect x="35" y="5" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <rect x="25" y="77" width="50" height="18" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
            <rect x="35" y="87" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
          </svg>
        </div>

        {editing &&
          Array.from({ length: ZONE_ROWS }).flatMap((_, row) =>
            Array.from({ length: ZONE_COLS }).map((__, col) => {
              const role = zoneRole(row, col);
              if (!role || occupiedZones?.has(`${row}:${col}`)) return null;
              const c = zoneCenter(row, col);
              const key = `zone:${row}:${col}`;
              return (
                <div
                  key={key}
                  data-drop={key}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full border border-dashed flex items-center justify-center text-sm font-semibold ${
                    dropHover === key ? "border-primary bg-primary/30 text-primary" : "border-white/40 text-white/60"
                  }`}
                  style={{ left: `${(c.y / PITCH_WIDTH) * 100}%`, top: `${100 - (c.x / PITCH_LENGTH) * 100}%` }}
                >
                  {role}
                </div>
              );
            }),
          )}

        {slots.map((slot, i) => {
          // slot.y is already a top offset with the attack end at the top (see getFormationSlots).
          // Inverting it drew the keeper at the top, so the team attacked downward and its left
          // side (LB/LWB/LW) appeared on the screen's right.
          const topPct = slot.y;
          const player = players[i];
          const isSelected = selectedSlotIdx === i;
          const oop = player && getOutOfPosition ? getOutOfPosition(player, slot.role) : false;
          const avg = player ? slotValue(player, slot.role ?? player.positions[0] ?? "CM") : 0;
          const energy = player?.seasonLog?.fitness ?? 100;
          const tipAlign =
            slot.x < 38 ? "left" : slot.x > 62 ? "right" : "center";
          const tipPanelPos =
            tipAlign === "left"
              ? "left-0 translate-x-0"
              : tipAlign === "right"
                ? "right-0 left-auto translate-x-0"
                : "left-1/2 -translate-x-1/2";
          const tipArrowPos =
            tipAlign === "left"
              ? "left-6 -translate-x-1/2"
              : tipAlign === "right"
                ? "right-6 -translate-x-1/2"
                : "left-1/2 -translate-x-1/2";

          return (
            <div
              key={`${slot.role}-${i}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 group ${
                isSelected ? " z-20" : " z-10 hover:z-[100]"
              }`}
              style={{ left: `${slot.x}%`, top: `${topPct}%` }}
            >
              <button
                onClick={() => onSlotClick(i)}
                data-drop={`slot:${i}`}
                data-pitch-marker
                {...dragProps({ kind: "slot", key: String(i) }, player ? player.name : slot.role)}
                className={`relative w-12 h-12 rounded-full flex flex-col items-center justify-center transition-all duration-200 cursor-pointer select-none touch-none border-0 p-0 ${
                  dropHover === `slot:${i}` || isSelected
                    ? `${player ? "bg-transparent" : "bg-primary"} ring-2 ring-primary ring-offset-2 ring-offset-background`
                    : player
                    ? "bg-transparent hover:brightness-110"
                    : "bg-primary/80 hover:bg-primary border-2 border-primary/50"
                }`}
              >
                {player ? (
                  <>
                    <PlayerFace
                      playerId={player.id}
                      nationality={player.nationality}
                      clubColors={clubColors}
                      size={48}
                      fallback={playerInitials(player.name)}
                      ringClassName={`border-2 border-current ${getDetailedPositionColor(slot.role)}`}
                    />
                    <span
                      className={`absolute -top-2 -left-3 min-w-7 rounded border border-current bg-background/95 px-1 text-center text-[13px] font-bold uppercase font-display leading-tight pointer-events-none ${getDetailedPositionColor(slot.role)}`}
                    >
                      {slot.role.length <= 3 ? slot.role : slot.role.slice(0, 2)}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] font-bold text-primary-foreground uppercase font-display">
                    {slot.role.length <= 3 ? slot.role : slot.role.slice(0, 2)}
                  </span>
                )}
              </button>

              {oop && !isSelected && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-chart-4 flex items-center justify-center pointer-events-none">
                  <Icon name="alert" className="w-2.5 h-2.5 text-chart-4" />
                </div>
              )}

              {player && (
                <>
                  <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-semibold px-2 py-0.5 rounded ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : oop
                      ? "bg-chart-4/20 text-chart-4"
                      : "bg-background/80 text-foreground"
                  }`}>
                    {player.name.split(" ").pop()}
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <div
                      className={`absolute z-[100] bottom-full mb-2 w-48 p-3 rounded-md bg-card border  ${oop ? "border-chart-4/40" : "border-border"} ${tipPanelPos}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-foreground text-sm">{player.name}</span>
                        <span className={`text-sm px-2 py-0.5 rounded font-semibold ${oop ? "bg-chart-4/20 text-chart-4" : "bg-primary/20 text-primary"}`}>
                          {positionLabel(t, preferredRole(player), player.positions[0] ?? "CM")}
                        </span>
                      </div>
                      {oop && (
                        <div className="flex items-center gap-1 mb-2 text-sm text-chart-4">
                          <Icon name="alert" className="w-3 h-3" />
                          <span>
                            {t("formations.outOfPositionPrimary", {
                              position: positionLabel(t, preferredRole(player), player.positions[0] ?? "CM"),
                              role: MAIN_ROLE_ABBR[getMainRole(player.positions[0] ?? "CM")],
                            })}
                          </span>
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Icon name="star" className="w-3 h-3" />
                            <span>{t("formations.rating")}</span>
                          </div>
                          <span className={`font-bold text-sm tabular-nums ${ratingTextClass10(avg)}`}>{avg.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Icon name="zap" className="w-3 h-3" />
                            <span>{t("formations.energy")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-border rounded overflow-hidden w-full min-w-16">
                              <div className={`h-full rounded-full ${getEnergyColor(energy)}`} style={{ width: `${energy}%` }} />
                            </div>
                            <span className="font-bold text-sm text-foreground">{Math.round(energy)}%</span>
                            <LoadIndicator load={player.seasonLog?.load ?? 0} size={11} />
                          </div>
                        </div>
                      </div>
                      <div
                        className={`absolute -bottom-2 w-4 h-4 bg-card border-r border-b rotate-45 ${oop ? "border-chart-4/40" : "border-border"} ${tipArrowPos}`}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
