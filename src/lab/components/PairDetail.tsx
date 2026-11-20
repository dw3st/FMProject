import { Fragment } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "@/lab/components/chartSetup";
import type { CongestionMatchResult, LabSlotView, PerMatchView, ScenarioResult } from "@/lab/types";
import { fmCountsFromViews, fmTargetRows } from "@/lab/fmTargets";

ensureChartsRegistered();

interface Props {
  result: ScenarioResult;
  aId: string;
  bId: string;
  labelFor: (id: string) => string;
}

export function PairDetail({ result, aId, bId, labelFor }: Props) {
  const pair = result.pairs.find((p) => p.variantAId === aId && p.variantBId === bId);
  if (!pair) {
    return (
      <div className="text-white/50 text-sm bg-white/[0.03] border border-white/10 rounded p-4">
        No data for {labelFor(aId)} vs {labelFor(bId)}.
      </div>
    );
  }

  const winA = (pair.teamA.wins / pair.matches) * 100;
  const winB = (pair.teamB.wins / pair.matches) * 100;
  const drawPct = (pair.draws / pair.matches) * 100;

  // Knockout-only rows: hidden entirely for non-knockout / quickSim runs where
  // neither side recorded any of the underlying events (all-zero on both sides).
  const knockoutRowDefs: { stat: string; key: keyof PerMatchView; gateKey: keyof PerMatchView }[] = [
    { stat: "Extra time%",       key: "extraTimePct",     gateKey: "extraTimePct" },
    { stat: "Shootout wins%",    key: "shootoutWinPct",   gateKey: "shootoutWinPct" },
    { stat: "Penalty conv%",     key: "penaltyConversionPct", gateKey: "avgPenaltiesTaken" },
  ];
  const knockoutRows = knockoutRowDefs.filter(
    (r) => Number(pair.teamA[r.gateKey]) > 0 || Number(pair.teamB[r.gateKey]) > 0,
  );

  const rows: { stat: string; key: keyof PerMatchView }[] = [
    { stat: "Avg goals",         key: "avgGoals" },
    { stat: "Avg xG",            key: "avgXg" },
    { stat: "Avg shots",         key: "avgShots" },
    { stat: "Shots on target",   key: "avgShotsOnTarget" },
    { stat: "Shot conv%",        key: "shotConversionPct" },
    { stat: "Avg assists",       key: "avgAssists" },
    { stat: "Pass attempts",     key: "avgPassesAttempted" },
    { stat: "Pass acc%",         key: "passAccuracyPct" },
    { stat: "Through balls",     key: "avgThroughBalls" },
    { stat: "TB completion%",    key: "throughBallCompletionPct" },
    { stat: "Loose balls won",   key: "avgLooseBallsWon" },
    { stat: "Switch passes",     key: "avgSwitchPlays" },
    ...knockoutRows,
    { stat: "Avg tackles",       key: "avgTackles" },
    { stat: "Avg intercept",     key: "avgInterceptions" },
    { stat: "Dribbles won",      key: "avgDribblesWon" },
    { stat: "Dribbles lost",     key: "avgDribblesLost" },
    { stat: "Drib success%",     key: "dribbleSuccessPct" },
    { stat: "Avg end energy",    key: "avgEndEnergy" },
    { stat: "Fatigue subs",      key: "avgFatigueSubs" },
    { stat: "AI subs (FM 3–4)",  key: "avgAiSubs" },
    { stat: "Tactical subs",     key: "avgTacticalSubs" },
    { stat: "AI sub minute",     key: "avgAiSubMinute" },
    { stat: "AI sub condition",  key: "avgAiSubCondition" },
    { stat: "Condition 45' (FM 77.5)", key: "condition45" },
    { stat: "Condition 90' (FM 73.5)", key: "condition90" },
    { stat: "Keeper end (FM 96.5)",    key: "keeperCondition" },
    { stat: "Injuries",          key: "avgInjuries" },
    { stat: "Injury restarts",   key: "avgInjuryStoppages" },
    { stat: "Near ball (def)",   key: "avgNearBall" },
    { stat: "Crowded ball%",     key: "crowdedPct" },
    { stat: "Out of position",   key: "avgOutOfPosition" },
    { stat: "Morale",            key: "avgMorale" },
    { stat: "New signings",      key: "avgNewcomers" },
    { stat: "Temperament",       key: "avgTemperament" },
    { stat: "Mgr discipline",    key: "avgManagerDiscipline" },
    { stat: "Pitch",             key: "avgPitchCondition" },
    { stat: "Turf injury ×",     key: "avgTurfInjuryMult" },
    { stat: "Weather",           key: "weatherShare" },
    { stat: "Prepared against",  key: "preparedShare" },
    { stat: "Referee",           key: "avgRefereeStrictness" },
    { stat: "Referee errors",    key: "avgRefereeErrors" },
    { stat: "VAR checks",        key: "avgVarReviews" },
    { stat: "VAR overturned",    key: "avgVarOverturned" },
    { stat: "Fouls",             key: "avgFouls" },
    { stat: "Yellow cards",      key: "avgYellowCards" },
    { stat: "Red cards",         key: "avgRedCards" },
    { stat: "Penalties won",     key: "avgPenaltiesAwarded" },
    { stat: "Penalty goals",     key: "avgPenaltyGoals" },
    { stat: "Offsides",          key: "avgOffsides" },
    { stat: "Line misreads",     key: "avgLineMisreads" },
    { stat: "Shadow presses",    key: "avgShadowPresses" },
    { stat: "Zone covers",       key: "avgZoneCovers" },
    { stat: "Shoulder runs",     key: "avgShoulderRuns" },
    { stat: "Early shoulder runs", key: "avgShoulderRunsEarly" },
    { stat: "Mind lapses",       key: "avgMindLapses" },
    { stat: "Marks dropped",     key: "avgMindMarkDrops" },
    { stat: "Mind intent shifts", key: "avgMindDefenseShifts" },
    { stat: "Contact fouls",     key: "avgContactFouls" },
    { stat: "Fouls won own 3rd%",   key: "foulsOwnThirdPct" },
    { stat: "Fouls won mid 3rd%",   key: "foulsMidThirdPct" },
    { stat: "Fouls won final 3rd%", key: "foulsFinalThirdPct" },
    { stat: "Fouls on carrier%",    key: "foulsOnCarrierPct" },
    { stat: "Crosses",           key: "avgCrosses" },
    { stat: "Cross completion%", key: "crossCompletionPct" },
    { stat: "Aerial duels won",  key: "avgAerialDuelsWon" },
    { stat: "Header goals",      key: "avgHeaderGoals" },
    { stat: "Long balls",        key: "avgLongBalls" },
    { stat: "Keeper sorties",    key: "avgKeeperSorties" },
    { stat: "Keeper sweeps",     key: "avgKeeperSweeps" },
    { stat: "Keeper smothers",   key: "avgKeeperSmothers" },
    { stat: "Saves held",        key: "avgKeeperHolds" },
    { stat: "Saves spilled",     key: "avgKeeperSpills" },
    { stat: "Distance (yd)",     key: "avgDistanceCovered" },
    { stat: "Sprints",           key: "avgSprints" },
    { stat: "Holder entropy",    key: "avgHolderEntropy" },
    { stat: "Off-ball entropy",  key: "avgOffBallEntropy" },
    { stat: "Defence entropy",   key: "avgDefenseEntropy" },
    { stat: "Holder near-tie%",  key: "holderNearTiePct" },
    { stat: "Off-ball near-tie%", key: "offBallNearTiePct" },
    { stat: "Defence near-tie%", key: "defenseNearTiePct" },
    { stat: "Holder pressure",   key: "avgHolderPressure" },
    { stat: "Holder off-argmax%", key: "holderOffArgmaxPct" },
    { stat: "Holder lapses%",    key: "holderLapsePct" },
    { stat: "Holder release%",   key: "holderReleasePct" },
    { stat: "Release% (high P)", key: "holderReleaseHighPct" },
    { stat: "Shields",           key: "avgShields" },
    { stat: "Cut-ins",           key: "avgCutIns" },
    { stat: "Lay-offs",          key: "avgLayOffs" },
    { stat: "Chips",             key: "avgChips" },
    { stat: "Chip goals",        key: "avgChipGoals" },
    { stat: "Round the keeper",  key: "avgRoundKeeper" },
    { stat: "Keeper rounded",    key: "avgRoundKeeperWon" },
    { stat: "Rolled out of play", key: "avgBallsOutOfPlay" },
    { stat: "Deflected passes", key: "avgDeflections" },
    { stat: "Shots blocked", key: "avgShotsBlocked" },
    { stat: "Chances (xG ≥ 0.15)", key: "avgChances" },
    { stat: "Clear-cut chances (xG ≥ 0.30)", key: "avgClearChances" },
    { stat: "Heavy touches", key: "avgHeavyTouches" },
    { stat: "Line step-ups", key: "avgLineStepUps" },
    { stat: "Line drops", key: "avgLineDrops" },
    { stat: "Second presser stand-offs", key: "avgPressStandOffs" },
    { stat: "Support comes short", key: "avgSupportShort" },
    { stat: "Anticipation reads", key: "avgAnticipationReads" },
    { stat: "Passes missed (launch error)", key: "avgPassesMissed" },
    { stat: "Lofted passes", key: "avgPassesLofted" },
    { stat: "High balls (peak > 1.2 m)", key: "avgHighBalls" },
    { stat: "Ball in the air (s)", key: "avgBallAirSeconds" },
    { stat: "Lances: main", key: "avgHighlightsMain" },
    { stat: "Lances: extended", key: "avgHighlightsExtended" },
    { stat: "Lances: full", key: "avgHighlightsFull" },
    { stat: "Lance time main (% of play)", key: "highlightShareMain" },
    { stat: "Lance time extended (%)", key: "highlightShareExtended" },
    { stat: "Lance time full (%)", key: "highlightShareFull" },
    { stat: "Cross peak (m, FM 4.0)", key: "crossPeakM" },
    { stat: "Corner peak (m, FM 5.6)", key: "cornerPeakM" },
    { stat: "Long-ball peak (m, FM 4.4)", key: "longPeakM" },
    { stat: "Passes along the ground (vz < 1 m/s)", key: "avgPassGround" },
    { stat: "Driven passes (vz 1–3 m/s)", key: "avgPassDriven" },
    { stat: "Chipped passes (vz ≥ 3 m/s)", key: "avgPassChip" },
    { stat: "Lofted passes to feet", key: "avgPassHigh" },
    { stat: "Through balls low", key: "avgPassThroughLow" },
    { stat: "Through balls high", key: "avgPassThroughHigh" },
    { stat: "Headed lay-offs", key: "avgPassHeader" },
    { stat: "Pass launch speed (m/s)", key: "passLaunchMps" },
    { stat: "Pass touched by a defender", key: "avgCutTouches" },
    { stat: "… cut out (controlled)", key: "avgCutControls" },
    { stat: "… cleared", key: "avgCutClears" },
    { stat: "… deflected", key: "avgCutDeflects" },
    { stat: "… ran past him", key: "avgCutMisses" },
    { stat: "Ball speed at the touch (m/s)", key: "cutSpeedMps" },
    { stat: "Shots off target (incl. woodwork)", key: "avgShotsOffTarget" },
    { stat: "… hit the woodwork", key: "avgShotsWoodwork" },
    { stat: "Shots deflected on", key: "avgShotsDeflected" },
    { stat: "Shots saved", key: "avgShotsSaved" },
    { stat: "Saves by the keeper", key: "avgSaves" },
    { stat: "… good saves", key: "avgSavesGood" },
    { stat: "… difficult saves", key: "avgSavesDifficult" },
    { stat: "Shots on target saved %", key: "savePct" },
    { stat: "Shots: power", key: "avgShotPower" },
    { stat: "Shots: placed", key: "avgShotPlaced" },
    { stat: "Shots: lob", key: "avgShotLob" },
    { stat: "Shots: chip", key: "avgShotChip" },
    { stat: "Shots: volley", key: "avgShotVolley" },
    { stat: "Shot launch speed (m/s)", key: "shotLaunchMps" },
    { stat: "Shot distance to goal (m)", key: "avgShotDistM" },
    { stat: "Shots from outside the box %", key: "shotsOutsideBoxPct" },
    { stat: "Shots struck low % (vz ≤ 3)", key: "shotsLowLaunchPct" },
    { stat: "Crosses met in flight (contact model)", key: "avgAirCrosses" },
    { stat: "… met in the air % (FM 82)", key: "airCrossMetAirPct" },
    { stat: "… not met before landing %", key: "airCrossUnmetPct" },
    { stat: "… first contact by the defence %", key: "airCrossDefPct" },
    { stat: "… first contact by the keeper %", key: "airCrossKeeperPct" },
    { stat: "Cross contact height (m, FM 1.8)", key: "airCrossContactM" },
    { stat: "Headers won (FM 27)", key: "avgHeadersWonFm" },
    { stat: "Headers won % defenders (FM 90–100)", key: "headWinDefPct" },
    { stat: "Headers won % midfielders", key: "headWinMidPct" },
    { stat: "Headers won % forwards", key: "headWinFwdPct" },
    { stat: "Holder holds", key: "avgHolderHolds" },
    { stat: "Holder turns", key: "avgHolderTurns" },
    { stat: "Holder carry % (FM 44)", key: "holderCarryPct" },
    { stat: "Holder pass % (FM 34)", key: "holderPassPct" },
    { stat: "Holder turn % (FM 12)", key: "holderTurnPct" },
    { stat: "Holder hold % (FM 9)", key: "holderHoldPct" },
    { stat: "Holder kick % (FM 1)", key: "holderKickPct" },
    { stat: "Holder decisions / possession (FM 2.5–3)", key: "holderDecisionsPerStint" },
    { stat: "Holder candidates / decision (FM 21)", key: "holderCandidatesPerDecision" },
    { stat: "Holder candidates vetoed %", key: "holderVetoedPct" },
    { stat: "Holder sprints", key: "avgHolderSprints" },
    { stat: "Holder byline runs", key: "avgHolderBylines" },
    { stat: "Holder spins past the marker", key: "avgHolderSpins" },
    { stat: "Corner-flag holds", key: "avgHolderFlagHolds" },
    { stat: "Corners",           key: "avgCorners" },
    { stat: "Throw-ins",         key: "avgThrowIns" },
    { stat: "Set-piece routines",         key: "avgSetPieceRoutines" },
    { stat: "Free kicks",        key: "avgFreeKicks" },
    { stat: "Direct FK shots",   key: "avgDirectFreeKickShots" },
    { stat: "Direct FK goals",   key: "avgDirectFreeKickGoals" },
    { stat: "Set-piece goals",   key: "avgSetPieceGoals" },
    { stat: "Set-piece goal%",   key: "setPieceGoalPct" },
    { stat: "Shots while marked", key: "avgMarkedTargetShots" },
    { stat: "Goals while marked", key: "avgMarkedTargetGoals" },
  ];

  const data = {
    labels: rows.map((r) => r.stat),
    datasets: [
      {
        label: labelFor(aId),
        data: rows.map((r) => Number(pair.teamA[r.key])),
        backgroundColor: "#10b981",
      },
      {
        label: labelFor(bId),
        data: rows.map((r) => Number(pair.teamB[r.key])),
        backgroundColor: "#ef4444",
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { labels: { boxWidth: 12, padding: 12 } },
      tooltip: { backgroundColor: "rgba(20,20,20,0.95)" },
    },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.05)" } },
      y: { grid: { color: "rgba(255,255,255,0.05)" } },
    },
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {labelFor(aId)} <span className="text-white/40">vs</span> {labelFor(bId)}
          </h3>
          <div className="text-xs text-white/50">
            {pair.matches} matches{pair.msPerMatch !== undefined ? ` · ${(pair.msPerMatch / 1000).toFixed(1)} s/match` : ""}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <ResultBadge label={labelFor(aId)} pct={winA} colour="emerald" />
          <ResultBadge label="Draw"            pct={drawPct} colour="gray" />
          <ResultBadge label={labelFor(bId)} pct={winB} colour="rose" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <h3 className="text-sm font-semibold mb-3 text-white/80">Side-by-side stats</h3>
        <div className="h-[460px]">
          <Bar data={data} options={options} />
        </div>
      </div>

      <FmTargetsTable a={pair.teamA} b={pair.teamB} />

      {(pair.teamA.slotStats.length > 0 || pair.teamB.slotStats.length > 0) && (
        <SlotTable a={pair.teamA.slotStats} b={pair.teamB.slotStats} labelA={labelFor(aId)} labelB={labelFor(bId)} />
      )}

      {pair.congestion && pair.congestion.length > 0 && (
        <CongestionTable congestion={pair.congestion} labelA={labelFor(aId)} labelB={labelFor(bId)} />
      )}
    </div>
  );
}

/** Fixture-congestion breakdown — one row per match-in-sequence index (see CongestionSpec). */
function CongestionTable({
  congestion,
  labelA,
  labelB,
}: {
  congestion: CongestionMatchResult[];
  labelA: string;
  labelB: string;
}) {
  const cols: { label: string; key: keyof PerMatchView; fmt?: (v: number) => string }[] = [
    { label: "Win%",      key: "wins",        fmt: (v) => `${v.toFixed(1)}%` },
    { label: "Avg goals", key: "avgGoals" },
    { label: "Avg xG",    key: "avgXg" },
    { label: "End energy", key: "avgEndEnergy" },
    { label: "Fatigue subs", key: "avgFatigueSubs" },
    { label: "AI subs", key: "avgAiSubs" },
    { label: "Cond. 45'", key: "condition45" },
    { label: "Cond. 90'", key: "condition90" },
    { label: "Injuries", key: "avgInjuries" },
    { label: "Injury restarts", key: "avgInjuryStoppages" },
  ];

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <h3 className="text-sm font-semibold mb-3 text-white/80">Fixture congestion — per match in sequence</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/50 text-left">
              <th className="py-1 pr-3">Match</th>
              <th className="py-1 pr-3">Side</th>
              {cols.map((c) => (
                <th key={c.label} className="py-1 pr-3 text-right">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {congestion.map((cm) => {
              // "Win%" isn't a PerMatchView field — `wins` is a raw count, so derive the share here.
              const winPctA = (cm.teamA.wins / cm.matches) * 100;
              const winPctB = (cm.teamB.wins / cm.matches) * 100;
              const valueFor = (side: "A" | "B", key: keyof PerMatchView) =>
                key === "wins" ? (side === "A" ? winPctA : winPctB) : Number((side === "A" ? cm.teamA : cm.teamB)[key]);
              return (
                <Fragment key={cm.matchIndex}>
                  <tr className="border-t border-white/5">
                    <td className="py-1 pr-3 text-white/70" rowSpan={2}>Match {cm.matchIndex + 1}</td>
                    <td className="py-1 pr-3 text-emerald-300">{labelA}</td>
                    {cols.map((c) => (
                      <td key={c.label} className="py-1 pr-3 text-right text-white">
                        {(c.fmt ?? ((v: number) => v.toFixed(2)))(valueFor("A", c.key))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-1 pr-3 text-rose-300">{labelB}</td>
                    {cols.map((c) => (
                      <td key={c.label} className="py-1 pr-3 text-right text-white">
                        {(c.fmt ?? ((v: number) => v.toFixed(2)))(valueFor("B", c.key))}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultBadge({
  label,
  pct,
  colour,
}: {
  label: string;
  pct: number;
  colour: "emerald" | "gray" | "rose";
}) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    gray:    "bg-white/10 border-white/20 text-white/70",
    rose:    "bg-rose-500/15 border-rose-500/40 text-rose-300",
  };
  return (
    <div className={`rounded border ${styles[colour]} py-3`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold">{pct.toFixed(1)}%</div>
    </div>
  );
}

/** Per formation slot, per match (player instructions: where each variant shows up). */
function SlotTable({ a, b, labelA, labelB }: { a: LabSlotView[]; b: LabSlotView[]; labelA: string; labelB: string }) {
  const cols: { label: string; key: keyof LabSlotView }[] = [
    { label: "Passes", key: "passes" },
    { label: "Shots", key: "shots" },
    { label: "Goals", key: "goals" },
    { label: "Crosses", key: "crosses" },
    { label: "Tackles", key: "tackles" },
    { label: "Press ticks", key: "pressTicks" },
    { label: "x w/ ball", key: "avgX" },
    { label: "|y−37|", key: "avgWidth" },
    { label: "End energy", key: "endEnergy" },
  ];
  const side = (rows: LabSlotView[], label: string, cls: string) => rows.map((s, i) => (
    <tr key={`${label}-${i}`} className="border-t border-white/5">
      <td className={`py-1 pr-3 ${cls}`}>{label}</td>
      <td className="py-1 pr-3 text-white/70">#{i} {s.role}</td>
      {cols.map((c) => (
        <td key={c.label} className="py-1 pr-3 text-right text-white tabular-nums">{Number(s[c.key]).toFixed(2)}</td>
      ))}
    </tr>
  ));
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <h3 className="text-sm font-semibold mb-3 text-white/80">Per slot (per match)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/50 text-left">
              <th className="py-1 pr-3">Side</th>
              <th className="py-1 pr-3">Slot</th>
              {cols.map((c) => <th key={c.label} className="py-1 pr-3 text-right">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {side(a, labelA, "text-emerald-300")}
            {side(b, labelB, "text-rose-300")}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The FM per-match targets (R9, both teams, `fmTargets.ts`) next to this pair's per-match total (A + B). */
function FmTargetsTable({ a, b }: { a: PerMatchView; b: PerMatchView }) {
  const rows = fmTargetRows(fmCountsFromViews(a, b));
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <h3 className="text-sm font-semibold mb-3 text-white/80">FM targets (per match, both teams)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs max-w-2xl">
          <thead>
            <tr className="text-white/50 text-left">
              <th className="py-1 pr-3">Metric</th>
              <th className="py-1 pr-3 text-right">Ours (A + B)</th>
              <th className="py-1 pr-3 text-right">FM</th>
              <th className="py-1 pr-3 text-right">Ours / FM</th>
              <th className="py-1 pr-3">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.target.key} className="border-t border-white/5">
                <td className="py-1 pr-3 text-white/80">{r.target.label}</td>
                <td className="py-1 pr-3 text-right text-white tabular-nums">{r.ours}</td>
                <td className="py-1 pr-3 text-right text-white/60 tabular-nums">{r.fm}</td>
                <td className="py-1 pr-3 text-right text-white/60 tabular-nums">{r.ratio === null ? "" : r.ratio.toFixed(2)}</td>
                <td className="py-1 pr-3 text-white/50">{r.target.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
