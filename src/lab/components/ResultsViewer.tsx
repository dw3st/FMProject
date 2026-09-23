import { useMemo, useState } from "react";
import type { ScenarioResult } from "@/lab/types";
import { WinMatrix } from "@/lab/components/WinMatrix";
import { SummaryBars } from "@/lab/components/SummaryBars";
import { StatRadar } from "@/lab/components/StatRadar";
import { PairDetail } from "@/lab/components/PairDetail";

type Tab = "matrix" | "summary" | "radar" | "pair" | "raw";

export function ResultsViewer({
  result,
  onReRun,
}: {
  result: ScenarioResult;
  onReRun?: (scenario: import("@/lab/types").BalanceScenario) => void;
}) {
  const [tab, setTab] = useState<Tab>("matrix");
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);

  const labelFor = useMemo(() => {
    const m = new Map<string, string>();
    result.scenario.variants.forEach((v) => m.set(v.id, v.label));
    return (id: string) => m.get(id) ?? id;
  }, [result]);

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {result.scenario.name}
              {result.scenario.simEngine === "quick" && (
                <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40 border border-white/10 rounded px-1.5 py-0.5 align-middle">
                  quickSim
                </span>
              )}
            </h2>
            <p className="text-xs text-white/40">
              {new Date(result.startedAt).toLocaleString()} · {result.pairs.length} pairs ·{" "}
              {result.scenario.matchesPerPair} matches/pair · ran in{" "}
              {(result.totalDurationMs / 1000).toFixed(1)}s
            </p>
          </div>
          {onReRun && (
            <button
              onClick={() => onReRun(result.scenario)}
              className="px-3 py-1.5 text-sm rounded border border-white/20 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              Re-run
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <TabBtn active={tab === "matrix"} onClick={() => setTab("matrix")}>
          Win matrix
        </TabBtn>
        <TabBtn active={tab === "summary"} onClick={() => setTab("summary")}>
          Summary
        </TabBtn>
        <TabBtn active={tab === "radar"} onClick={() => setTab("radar")}>
          Stat radar
        </TabBtn>
        <TabBtn
          active={tab === "pair"}
          onClick={() => setTab("pair")}
          disabled={!selectedPair}
        >
          Pair detail{selectedPair ? "" : " (select a cell)"}
        </TabBtn>
        <TabBtn active={tab === "raw"} onClick={() => setTab("raw")}>
          Raw JSON
        </TabBtn>
      </div>

      {tab === "matrix" && (
        <WinMatrix
          result={result}
          labelFor={labelFor}
          onSelect={(a, b) => {
            setSelectedPair({ a, b });
            setTab("pair");
          }}
        />
      )}
      {tab === "summary" && <SummaryBars variants={result.variants} />}
      {tab === "radar"   && <StatRadar variants={result.variants} />}
      {tab === "pair" && selectedPair && (
        <PairDetail
          result={result}
          aId={selectedPair.a}
          bId={selectedPair.b}
          labelFor={labelFor}
        />
      )}
      {tab === "raw" && (
        <pre className="bg-black/40 border border-white/10 rounded p-4 text-xs overflow-auto max-h-[600px]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
        disabled
          ? "border-transparent text-white/20 cursor-not-allowed"
          : active
            ? "border-emerald-400 text-white"
            : "border-transparent text-white/60 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
