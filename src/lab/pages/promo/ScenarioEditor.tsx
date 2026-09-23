import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Download,
  FileJson,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Check,
  X,
} from "lucide-react";
import type { GameState } from "@/GameEngine/types";
import {
  type Scenario,
  type ScenarioMeta,
  deleteCustomScenario,
  getScenario,
  listScenarios,
  parseScenario,
  saveCustomScenario,
  serializeScenario,
} from "./scenarios";

/**
 * Floating editor panel pinned to top-left. Lets the user:
 *   • Pick from saved scenarios (built-in or custom)
 *   • Paste a GameState JSON to load a new scenario
 *   • Save the current edit under a name
 *   • Export the live engine state (copies JSON to clipboard)
 *   • Delete custom scenarios
 *
 * The JSON editor uses an UNCONTROLLED textarea (ref-based, not React state)
 * so very large GameState pastes (50KB+) are handled cleanly. Browsers can
 * choke on huge controlled-input re-renders, so we only touch React state
 * when the user actually clicks Load/Save.
 *
 * Hidden when the URL contains `?nav=hide` (for clean recordings).
 */
export const ScenarioEditor: React.FC<{
  activeId: string;
  onLoad: (s: Scenario) => void;
  getLiveState: () => GameState | null;
  /** Rewind the active scenario to its saved start (bound to `R` on /promo). */
  onRestart?: () => void;
}> = ({ activeId, onLoad, getLiveState, onRestart }) => {
  // Start collapsed so the editor doesn't sit in front of the pitch on first
  // load. The little round button in the corner is enough to discover it.
  const [collapsed, setCollapsed] = useState(true);
  const [list, setList] = useState<Scenario[]>(() => listScenarios());
  const [tab, setTab] = useState<"pick" | "json">("pick");
  const [saveName, setSaveName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);

  // Uncontrolled textarea — we read from the DOM at submit time. Avoids
  // React's per-keystroke re-renders that can stall or truncate huge JSON.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nav") === "hide") {
    return null;
  }

  const active = useMemo(() => list.find((s) => s.meta.id === activeId) ?? null, [list, activeId]);

  // Pre-fill the textarea with the active scenario the first time we switch
  // to the JSON tab.
  useEffect(() => {
    if (tab === "json" && active && textareaRef.current && !textareaRef.current.value) {
      const json = serializeScenario(active);
      textareaRef.current.value = json;
      setCharCount(json.length);
    }
  }, [tab, active]);

  const writeToTextarea = (text: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = text;
      setCharCount(text.length);
    }
  };

  const readTextarea = (): string => textareaRef.current?.value ?? "";

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1800);
  };

  const handleLoadById = (id: string) => {
    const s = getScenario(id);
    if (!s) return;
    onLoad(s);
    showFlash(`Loaded ${s.meta.label}`);
  };

  const handleParseAndLoad = () => {
    try {
      const text = readTextarea();
      if (!text.trim()) {
        setError("Paste a scenario JSON first");
        return;
      }
      const parsed = parseScenario(text);
      onLoad(parsed);
      setError(null);
      showFlash(`Loaded ${parsed.meta.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleSaveCustom = () => {
    try {
      const trimmed = saveName.trim();
      if (!trimmed) {
        setError("Name is required");
        return;
      }
      const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const text = readTextarea();
      if (!text.trim()) {
        setError("Paste a scenario JSON first");
        return;
      }
      const parsed = parseScenario(text);
      const meta: ScenarioMeta = {
        ...parsed.meta,
        id,
        label: trimmed,
        custom: true,
      };
      saveCustomScenario(meta, parsed.state);
      setList(listScenarios());
      setSaveName("");
      setError(null);
      showFlash(`Saved ${trimmed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = (id: string) => {
    deleteCustomScenario(id);
    setList(listScenarios());
    showFlash("Deleted");
  };

  const handleExportLive = async () => {
    const live = getLiveState();
    if (!live) {
      setError("No live state yet — wait for the match to start");
      return;
    }
    const meta: ScenarioMeta = {
      id: "live-capture",
      label: `Live capture · ${new Date().toLocaleTimeString()}`,
      description: "Captured from a running engine — paste into Save to keep it.",
    };
    const json = serializeScenario({ meta, state: live });
    setTab("json");
    // setTimeout to make sure the textarea is mounted before writing to it.
    setTimeout(() => writeToTextarea(json), 0);
    try {
      await navigator.clipboard.writeText(json);
      showFlash(`Captured · ${json.length.toLocaleString()} chars · copied`);
    } catch {
      showFlash(`Captured · ${json.length.toLocaleString()} chars`);
    }
  };

  // Read directly from the OS clipboard — avoids any textarea paste-handler issues.
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setError("Clipboard is empty");
        return;
      }
      writeToTextarea(text);
      setError(null);
      showFlash(`Pasted · ${text.length.toLocaleString()} chars`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Clipboard blocked: ${err.message}`
          : "Clipboard read blocked by browser",
      );
    }
  };

  const handleCopyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(readTextarea());
      showFlash("Copied");
    } catch {
      setError("Clipboard write blocked");
    }
  };

  const handleClear = () => {
    writeToTextarea("");
    setError(null);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed top-3 left-3 z-[9998] w-10 h-10 rounded-full card-arcade border-glow flex items-center justify-center cursor-pointer hover:scale-105"
        title="Open scenario editor"
        aria-label="Open scenario editor"
      >
        <Clapperboard className="w-4 h-4 text-primary" />
      </button>
    );
  }

  return (
    <div className="fixed top-3 left-3 z-[9998] card-arcade border-glow rounded-xl backdrop-blur-md shadow-2xl w-[420px] max-h-[calc(100vh-24px)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-primary glow-text" />
          <span className="text-[10px] font-display font-black uppercase tracking-[0.3em] text-foreground">
            Scenarios
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab(tab === "pick" ? "json" : "pick")}
            className="px-2 py-1 rounded text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            title={tab === "pick" ? "Edit JSON" : "Back to picker"}
          >
            {tab === "pick" ? <Pencil className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="px-2 py-1 rounded text-muted-foreground hover:text-foreground"
            title="Collapse"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-3 text-xs">
        {tab === "pick" ? (
          <>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Pick a scenario · {list.length} available
            </div>
            {list.map((s) => {
              const isActive = s.meta.id === activeId;
              return (
                <div
                  key={s.meta.id}
                  className={
                    "rounded-lg border p-2 flex items-start gap-2 transition-colors " +
                    (isActive
                      ? "border-primary/50 bg-primary/10 glow-primary-sm"
                      : "border-border bg-secondary/30 hover:border-muted")
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleLoadById(s.meta.id)}
                    className="flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          "text-[11px] font-display font-bold uppercase tracking-wider " +
                          (isActive ? "text-primary glow-text" : "text-foreground")
                        }
                      >
                        {s.meta.label}
                      </span>
                      {s.meta.custom && (
                        <span className="text-[8px] uppercase tracking-widest text-muted-foreground border border-border rounded px-1">
                          custom
                        </span>
                      )}
                    </div>
                    {s.meta.description && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                        {s.meta.description}
                      </div>
                    )}
                  </button>
                  {s.meta.custom && (
                    <button
                      type="button"
                      onClick={() => handleDelete(s.meta.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}

            <div className="h-px bg-border my-1" />

            {/* Restart — full-width, primary, sits above the secondary actions */}
            {onRestart && (
              <button
                type="button"
                onClick={() => {
                  onRestart();
                  showFlash("Restarted");
                }}
                className="bg-primary text-primary-foreground rounded-md px-2 py-2 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-display font-black glow-primary cursor-pointer"
                title="Rewind the active scenario to its saved start (or press R anywhere)"
              >
                <RotateCcw className="w-3 h-3" />
                Restart Scenario
                <kbd className="ml-1 bg-primary-foreground/15 border border-primary-foreground/25 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold">
                  R
                </kbd>
              </button>
            )}

            {/* Secondary actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportLive}
                className="card-arcade rounded-md px-2 py-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest text-foreground hover:text-primary cursor-pointer"
                title="Capture the current engine state and open the JSON editor"
              >
                <Download className="w-3 h-3" />
                Capture Live
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("json");
                  setError(null);
                  // Clear the textarea after the tab swap.
                  setTimeout(() => writeToTextarea(""), 0);
                }}
                className="card-arcade rounded-md px-2 py-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest text-foreground hover:text-primary cursor-pointer"
                title="Open the JSON editor with a blank textarea"
              >
                <Plus className="w-3 h-3" />
                Paste JSON
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Header row: char count + clipboard / copy / clear actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <FileJson className="w-3 h-3" /> GameState JSON
                <span className="text-muted-foreground/70">·</span>
                <span className="tabular-nums text-foreground">
                  {charCount.toLocaleString()} chars
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="text-[10px] uppercase tracking-widest text-primary glow-text hover:underline flex items-center gap-1 cursor-pointer"
                  title="Read the entire clipboard into the textarea (bypasses paste handler)"
                >
                  <Clipboard className="w-3 h-3" /> Paste
                </button>
                <button
                  type="button"
                  onClick={handleCopyCurrent}
                  className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                  title="Copy textarea contents to clipboard"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive flex items-center gap-1 cursor-pointer"
                  title="Clear textarea"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Uncontrolled — read via ref at submit. onInput just updates the
                char counter so we don't drive value/onChange for huge inputs. */}
            <textarea
              ref={textareaRef}
              onInput={(e) => setCharCount((e.target as HTMLTextAreaElement).value.length)}
              placeholder="Paste a GameState JSON here (optional `_meta: { id, label, description }` header)… or use the Paste button above to read directly from clipboard"
              className="w-full h-[280px] bg-background border border-border rounded-md px-2 py-1.5 text-[10px] text-foreground font-mono leading-snug resize-none focus:outline-none focus:border-primary"
              spellCheck={false}
            />

            {error && (
              <div className="text-[10px] text-destructive flex items-center gap-1 leading-snug">
                <X className="w-3 h-3 shrink-0" /> {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleParseAndLoad}
                className="flex-1 bg-primary text-primary-foreground rounded-md px-3 py-2 text-[10px] uppercase tracking-widest font-display font-black glow-primary cursor-pointer"
              >
                Load
              </button>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Save as…"
                className="flex-1 bg-background border border-border rounded-md px-2 py-2 text-[10px] text-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSaveCustom}
                className="bg-secondary text-foreground rounded-md px-3 py-2 text-[10px] uppercase tracking-widest font-display font-black cursor-pointer hover:bg-primary hover:text-primary-foreground"
                title="Save current JSON under this name"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Flash bar */}
      {flash && (
        <div className="px-3 py-1.5 border-t border-border bg-primary/10 flex items-center gap-1.5">
          <Check className="w-3 h-3 text-primary glow-text" />
          <span className="text-[10px] uppercase tracking-widest text-primary glow-text">
            {flash}
          </span>
        </div>
      )}
    </div>
  );
};
