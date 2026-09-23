import { useTranslation } from "react-i18next";
import type { TeamId } from "@/GameEngine/types";
import type {
  EvaluationConfig,
  EvaluationResult,
  Falloff,
} from "@/GameEngine/Infrastructure/SpatialEvaluation";

export type CrowdMode = 'attack' | 'defense' | 'crowd';

interface Props {
  mode:           CrowdMode;
  onModeChange:   (mode: CrowdMode) => void;
  config:         EvaluationConfig;
  onConfigChange: (next: EvaluationConfig) => void;
  result:         EvaluationResult | null;
  clickPos:       { x: number; y: number } | null;
  attackingTeam:  TeamId | null;
  onClear:        () => void;
}

export function CrowdHeatmapPanel({
  mode, onModeChange, config, onConfigChange, result, clickPos, attackingTeam, onClear,
}: Props) {
  const { t } = useTranslation();

  const MODE_OPTIONS: { value: CrowdMode; label: string; cls: string }[] = [
    { value: 'attack',  label: t("common.attack"),  cls: 'text-blue-400' },
    { value: 'defense', label: t("common.defense"), cls: 'text-red-400' },
    { value: 'crowd',   label: t("common.crowd"),   cls: 'text-amber-400' },
  ];

  const FALLOFF_OPTIONS: { value: Falloff; label: string }[] = [
    { value: 'linear', label: t("common.linear") },
    { value: 'exp',    label: t("common.exp") },
  ];
  const attackTeamLabel  = attackingTeam ?? '—';
  const defenseTeamLabel = attackingTeam === 'A' ? 'B' : attackingTeam === 'B' ? 'A' : '—';

  const attackDensity =
    result == null
      ? 0
      : attackingTeam === 'A'
        ? result.teamADensity
        : attackingTeam === 'B'
          ? result.teamBDensity
          : 0;
  const defenseDensity =
    result == null
      ? 0
      : attackingTeam === 'A'
        ? result.teamBDensity
        : attackingTeam === 'B'
          ? result.teamADensity
          : 0;
  const nearestAtk =
    result == null
      ? Infinity
      : attackingTeam === 'A'
        ? result.nearestTeamADist
        : attackingTeam === 'B'
          ? result.nearestTeamBDist
          : Infinity;
  const nearestDef =
    result == null
      ? Infinity
      : attackingTeam === 'A'
        ? result.nearestTeamBDist
        : attackingTeam === 'B'
          ? result.nearestTeamADist
          : Infinity;

  const fmt     = (v: number) => (!Number.isFinite(v) ? '—' : v.toFixed(2));
  const fmtDist = (v: number) => (!Number.isFinite(v) ? '—' : `${v.toFixed(1)} yd`);

  return (
    <div className="card-arcade rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {t("common.heatmapMode")}
        </span>
        {MODE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onModeChange(opt.value)}
            className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
              mode === opt.value
                ? `${opt.cls} bg-white/10 border-white/20`
                : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {t("common.radius")} ({config.radius} yd)
          </p>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={config.radius}
            onChange={e => onConfigChange({ ...config, radius: Number(e.target.value) })}
            className="w-full accent-primary cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {t("common.falloff")}
          </p>
          <div className="flex gap-1">
            {FALLOFF_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onConfigChange({ ...config, falloff: opt.value })}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                  config.falloff === opt.value
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            {t("common.include")}
          </p>
          <div className="flex gap-1">
            {([
              { key: 'includeTeamA' as const, label: 'A', cls: 'text-blue-400' },
              { key: 'includeTeamB' as const, label: 'B', cls: 'text-red-400' },
            ]).map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => onConfigChange({ ...config, [key]: !config[key] })}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                  config[key]
                    ? `${cls} bg-white/10 border-white/20`
                    : 'bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {clickPos ? (
        <div className="border-t border-border/50 pt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Click @ ({clickPos.x.toFixed(1)}, {clickPos.y.toFixed(1)}) yd
            </span>
            <button
              onClick={onClear}
              className="px-2 py-0.5 rounded text-[10px] font-semibold border border-border bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {t("common.clear")}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2 text-xs font-mono">
            <div className="space-y-0.5">
              <div className="text-[9px] text-blue-400/80 uppercase">{t("common.attack")} ({t("common.team")} {attackTeamLabel})</div>
              <div className="text-foreground tabular-nums">{fmt(attackDensity)}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-red-400/80 uppercase">{t("common.defense")} ({t("common.team")} {defenseTeamLabel})</div>
              <div className="text-foreground tabular-nums">{fmt(defenseDensity)}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-amber-400/80 uppercase">{t("common.total")}</div>
              <div className="text-foreground tabular-nums">{fmt(result?.totalDensity ?? 0)}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-blue-400/80 uppercase">{t("common.nearAtk")}</div>
              <div className="text-foreground tabular-nums">{fmtDist(nearestAtk)}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-red-400/80 uppercase">{t("common.nearDef")}</div>
              <div className="text-foreground tabular-nums">{fmtDist(nearestDef)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {t("common.clickAnywhereOnPitch")}
        </div>
      )}
    </div>
  );
}
