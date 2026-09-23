import type { ScenarioIndexEntry } from "@/lab/types";

interface Props {
  entries: ScenarioIndexEntry[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

export function SavedRunsList({ entries, onLoad, onDelete, onRefresh }: Props) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Saved runs</h3>
        <button
          onClick={onRefresh}
          className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
        >
          ↻
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-white/40">No saved runs yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li
              key={e.id}
              className="border border-white/5 rounded px-2 py-1.5 hover:bg-white/5 group"
            >
              <button
                onClick={() => onLoad(e.id)}
                className="text-left w-full"
              >
                <div className="text-sm truncate">{e.name}</div>
                <div className="text-[10px] text-white/40">
                  {new Date(e.startedAt).toLocaleString()} · {e.pairCount} pairs · {e.matchesPerPair}/pair
                </div>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${e.name}"?`)) onDelete(e.id);
                }}
                className="text-[10px] text-white/30 hover:text-red-400 mt-1 opacity-0 group-hover:opacity-100"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
