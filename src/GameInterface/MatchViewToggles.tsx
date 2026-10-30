import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";

/** One TV-style switch: icon, label and a small on/off light; `aria-pressed` carries the state. */
function ViewSwitch({ icon, label, on, disabled, title, onClick, fill }: {
  icon: IconName; label: string; on: boolean; disabled?: boolean; title: string; onClick: () => void; fill?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex items-center ${fill ? "flex-1 min-w-0 flex-col justify-center gap-1 py-1.5 px-1" : "gap-2 h-10 px-3"} font-display font-bold uppercase tracking-[0.08em] text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {fill ? (
        // Narrow column (above the team list): icon and light on top, the label below, never cut.
        <>
          <span className="flex items-center gap-1.5">
            <Icon name={icon} size={16} />
            <span className={`w-2 h-2 rounded-full ${on ? "bg-primary shadow-[0_0_6px] shadow-primary" : "bg-border"}`} aria-hidden="true" />
          </span>
          <span className="text-sm leading-none">{label}</span>
        </>
      ) : (
        <>
          <Icon name={icon} size={16} />
          <span>{label}</span>
          <span className={`w-2 h-2 rounded-full ${on ? "bg-primary shadow-[0_0_6px] shadow-primary" : "bg-border"}`} aria-hidden="true" />
        </>
      )}
    </button>
  );
}

/**
 * Live match view switches (4.41.17, tester request): the camera following the ball (zoom) and the goal replay, on
 * and off at any moment; the choice is saved for the next match. The replay does not exist between two managers.
 */
export function MatchViewToggles({ zoom, replay, replayAvailable, onZoom, onReplay, figures, onFigures, fill }: {
  zoom: boolean; replay: boolean; replayAvailable: boolean; onZoom: () => void; onReplay: () => void;
  /** Spread over the full width (the block above the team list, 4.41.20). */
  fill?: boolean;
  /** Figures or discs (4.41.19); absent without the new visual (only discs then). */
  figures?: boolean; onFigures?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("match.view.label")} className={`flex items-stretch overflow-hidden rounded-lg ${fill ? "w-full" : ""} border border-border bg-secondary/50 divide-x divide-border`}>
      <ViewSwitch icon="zoom-in" label={t("match.view.zoom")} on={zoom} title={t(zoom ? "match.view.zoomOn" : "match.view.zoomOff")} onClick={onZoom} fill={fill} />
      <ViewSwitch
        icon="rewind"
        label={t("match.view.replay")}
        on={replay}
        disabled={!replayAvailable}
        title={t(!replayAvailable ? "match.view.replayH2h" : replay ? "match.view.replayOn" : "match.view.replayOff")}
        onClick={onReplay}
        fill={fill}
      />
      {onFigures && (
        <ViewSwitch
          icon="user"
          label={t("match.view.figures")}
          on={!!figures}
          title={t(figures ? "match.view.figuresOn" : "match.view.figuresOff")}
          onClick={onFigures}
          fill={fill}
        />
      )}
    </div>
  );
}
