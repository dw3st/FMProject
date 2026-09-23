import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import type { AgePhase } from "@/GameInterface/Development/PlayerProfile";
import { getAgePhaseDisplay } from "@/GameInterface/Development/PlayerProfile";
import { getMainRole, MAIN_ROLE_ABBR, MAIN_ROLE_BADGE_CLASSES } from "@/GameInterface/positionHelpers";

export interface PlayerOption {
  id:       string;
  name:     string;
  /** Primary position tag e.g. "ST", "CB" */
  position: string;
  agePhase: AgePhase;
}

interface PlayerSelectorProps {
  players:    PlayerOption[];
  selectedId: string;
  onSelect:   (id: string) => void;
}

export function PlayerSelector({ players, selectedId, onSelect }: PlayerSelectorProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const agePhaseDisplay = getAgePhaseDisplay(t);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const abbr = MAIN_ROLE_ABBR[getMainRole(p.position)];
      const phaseLabel = agePhaseDisplay[p.agePhase].label;
      return `${p.position} ${abbr} ${phaseLabel} ${p.name}`.toLowerCase().includes(q);
    });
  }, [players, query, agePhaseDisplay]);

  if (players.length === 0) return null;

  return (
    <div className="card-arcade rounded-xl p-4 flex flex-col gap-3 min-h-0 max-h-[min(70vh,42rem)] w-full">
      <h2 className="text-xs font-black text-foreground font-display uppercase tracking-wider m-0 shrink-0">
        {t("developmentScreen.squad")}
      </h2>

      <div className="flex items-center gap-2 bg-card/50 border border-border/50 hover:border-primary/40 focus-within:border-primary/70 rounded-xl transition-colors px-3 shrink-0">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("developmentScreen.searchPlayers")}
          className="flex-1 min-w-0 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          autoComplete="off"
        />
      </div>

      <div className="flex-1 min-h-[12rem] overflow-y-auto rounded-xl border border-border/40 bg-card/30 py-1.5 -mx-0.5">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            {t("developmentScreen.noPlayersMatch", { query })}
          </div>
        )}

        {filtered.map((player) => {
          const isSelected = player.id === selectedId;
          const mainRole = getMainRole(player.position);
          const badgeClass =
            MAIN_ROLE_BADGE_CLASSES[mainRole] ?? "bg-muted/20 text-muted-foreground border-border";
          const phase = agePhaseDisplay[player.agePhase];

          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player.id)}
              className={`group flex w-full items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none text-left transition-colors rounded-lg mx-1
                ${
                  isSelected
                    ? "bg-primary/15 border border-primary/35"
                    : "border border-transparent hover:bg-primary/10"
                }
              `}
            >
              <span
                className={`shrink-0 min-w-[2.25rem] text-center text-[10px] font-black px-1.5 py-1 rounded-md border uppercase tracking-wider ${badgeClass}`}
                title={player.position}
              >
                {MAIN_ROLE_ABBR[mainRole]}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">{player.name}</span>
                  <span
                    className={`text-[10px] font-semibold shrink-0 whitespace-nowrap ${phase.color}`}
                    title={phase.label}
                  >
                    {phase.label}
                  </span>
                </div>
              </div>

              <Check
                className={`w-4 h-4 text-primary shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
