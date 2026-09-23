import { useCallback, useEffect, useState } from "react";
import { labApi, streamRun } from "@/lab/api";
import type { FormationCatalog } from "@/lab/api";
import { ScenarioBuilder } from "@/lab/components/ScenarioBuilder";
import { RunQueue } from "@/lab/components/RunQueue";
import { ResultsViewer } from "@/lab/components/ResultsViewer";
import { SavedRunsList } from "@/lab/components/SavedRunsList";
import type {
  BalanceScenario,
  RunStatus,
  ScenarioIndexEntry,
  ScenarioResult,
} from "@/lab/types";

type View = "build" | "run" | "result";

export function LabApp() {
  const [view, setView] = useState<View>("build");
  const [formations, setFormations] = useState<FormationCatalog>({ supported: [], unsupported: [] });
  const [savedRuns, setSavedRuns] = useState<ScenarioIndexEntry[]>([]);

  const [activeRun, setActiveRun] = useState<RunStatus | null>(null);
  const [activeResult, setActiveResult] = useState<ScenarioResult | null>(null);
  const [draftScenario, setDraftScenario] = useState<Partial<BalanceScenario> | null>(null);

  const refreshSaved = useCallback(async () => {
    setSavedRuns(await labApi.list());
  }, []);

  useEffect(() => {
    void labApi.formations().then(setFormations);
    void refreshSaved();
  }, [refreshSaved]);

  // Subscribe to active run via SSE
  useEffect(() => {
    if (!activeRun || activeRun.completedAt) return;
    const close = streamRun(activeRun.runId, (status) => {
      setActiveRun(status);
      if (status.completedAt && !status.error && status.resultFile) {
        void labApi.load(status.runId).then((r) => {
          setActiveResult(r);
          setView("result");
          void refreshSaved();
        });
      }
    });
    return close;
  }, [activeRun?.runId, activeRun?.completedAt, refreshSaved]);

  const onRun = useCallback(async (scenario: Partial<BalanceScenario>) => {
    setDraftScenario(scenario);
    const { runId } = await labApi.run(scenario);
    const status = await labApi.runStatus(runId);
    setActiveRun(status);
    setActiveResult(null);
    setView("run");
  }, []);

  const onLoad = useCallback(async (id: string) => {
    const result = await labApi.load(id);
    setActiveResult(result);
    setActiveRun(null);
    setView("result");
  }, []);

  const onReRun = useCallback((scenario: BalanceScenario) => {
    const { id: _id, ...rest } = scenario;
    setDraftScenario(rest);
    setView("build");
  }, []);

  const onDelete = useCallback(
    async (id: string) => {
      await labApi.delete(id);
      if (activeResult?.scenario.id === id) {
        setActiveResult(null);
        setView("build");
      }
      await refreshSaved();
    },
    [activeResult?.scenario.id, refreshSaved],
  );

  return (
    <div className="min-h-screen bg-[#242424] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">⚗️ Balance Lab</h1>
          <p className="text-xs text-white/40">
            Multi-pair tactical and formation experiments
          </p>
        </div>
        <nav className="flex gap-2">
          <NavButton active={view === "build"} onClick={() => setView("build")}>
            Build
          </NavButton>
          <NavButton
            active={view === "run"}
            onClick={() => activeRun && setView("run")}
            disabled={!activeRun}
          >
            Run {activeRun && !activeRun.completedAt ? "•" : ""}
          </NavButton>
          <NavButton
            active={view === "result"}
            onClick={() => activeResult && setView("result")}
            disabled={!activeResult}
          >
            Results
          </NavButton>
        </nav>
      </header>

      <main className="p-6 grid grid-cols-[1fr_320px] gap-6">
        <section>
          {view === "build" && (
            <ScenarioBuilder
              formations={formations}
              draft={draftScenario}
              onRun={onRun}
            />
          )}
          {view === "run" && activeRun && <RunQueue status={activeRun} />}
          {view === "result" && activeResult && (
            <ResultsViewer result={activeResult} onReRun={onReRun} />
          )}
        </section>

        <aside>
          <SavedRunsList
            entries={savedRuns}
            onLoad={onLoad}
            onDelete={onDelete}
            onRefresh={refreshSaved}
          />
        </aside>
      </main>
    </div>
  );
}

function NavButton({
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
        "px-3 py-1.5 text-sm rounded border transition-colors",
        disabled
          ? "border-white/5 text-white/20 cursor-not-allowed"
          : active
            ? "border-white/30 bg-white/10 text-white"
            : "border-white/10 text-white/70 hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
