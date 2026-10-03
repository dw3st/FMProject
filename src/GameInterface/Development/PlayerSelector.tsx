import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgePhase } from "@/GameInterface/Development/PlayerProfile";
import { getAgePhaseDisplay } from "@/GameInterface/Development/PlayerProfile";
import { getMainRole, MAIN_ROLE_ABBR, MAIN_ROLE_BADGE_CLASSES, positionLabel } from "@/GameInterface/positionHelpers";
import { Icon } from "@/GameInterface/Icons";
import { PlayerFace, playerInitials } from "@/GameInterface/Components/PlayerFace";

export interface PlayerOption {
  id:       string;
  name:     string;
  nationality?: string | null;
  /** Primary position tag e.g. "ST", "CB" */
  position: string;
  agePhase: AgePhase;
}

interface PlayerSelectorProps {
  players:    PlayerOption[];
  selectedId: string;
  onSelect:   (id: string) => void;
  /** Kit colours of the club, used for the generated faces. */
  clubColors?: readonly string[];
}

export function PlayerSelector({ players, selectedId, onSelect, clubColors }: PlayerSelectorProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const agePhaseDisplay = getAgePhaseDisplay(t);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const abbr = `${MAIN_ROLE_ABBR[getMainRole(p.position)]} ${positionLabel(t, p.position, p.position)}`;
      const phaseLabel = agePhaseDisplay[p.agePhase].label;
      return `${p.position} ${abbr} ${phaseLabel} ${p.name}`.toLowerCase().includes(q);
    });
  }, [players, query, agePhaseDisplay, t]);

  if (players.length === 0) return null;

  return (
    <div className="card-arcade rounded-md p-4 flex flex-col gap-3 min-h-0 max-h-[min(70vh,42rem)] w-full">
      <h2 className="font-display font-black uppercase text-xl leading-none m-0 shrink-0">
        {t("developmentScreen.squad")}
      </h2>

      <div className="flex items-center gap-2 bg-card/50 border border-border/50 hover:border-primary/40 focus-within:border-primary/70 rounded-md transition-colors px-3 shrink-0">
        <Icon name="search" className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("developmentScreen.searchPlayers")}
          className="flex-1 min-w-0 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          autoComplete="off"
        />
      </div>

      <div className="flex-1 min-h-[12rem] overflow-y-auto rounded-md border border-border/40 bg-card/30 py-1.5 -mx-0.5">
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
              className={`group flex w-full items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none text-left transition-colors rounded-lg mx-1 ${
                  isSelected
                    ? "bg-primary/15 border border-primary/35"
                    : "border border-transparent hover:bg-primary/10"
                } `}
            >
              <PlayerFace
                playerId={player.id}
                nationality={player.nationality}
                clubColors={clubColors}
                size={32}
                fallback={playerInitials(player.name)}
                ringClassName="border border-border"
              />
              <span
                className={`shrink-0 min-w-[2.25rem] text-center text-sm font-semibold px-2 py-0.5 rounded border ${badgeClass}`}
                title={player.position}
              >
                {positionLabel(t, player.position, player.position)}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm text-foreground truncate min-w-0 flex-1">{player.name}</span>
                  <span
                    className={`text-sm font-semibold shrink-0 whitespace-nowrap ${phase.color}`}
                    title={phase.label}
                  >
                    {phase.label}
                  </span>
                </div>
              </div>

              <Icon name="check"
                className={`w-4 h-4 text-primary shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
