import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import {
  ShoppingBag,
  Globe,
  Tag,
  TrendingUp,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronsUpDown,
} from "lucide-react";
import { ScreenFrame } from "../components/ScreenFrame";
import { WORLD_TRANSFERS } from "../data/transfers";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

export const TransfersScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const exitOpacity = interpolate(
    frame,
    [fps * 3.5, fps * 4.0],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Incoming-offer toast (top-right) appears mid-scene.
  const toastIn = interpolate(frame, [fps * 1.4, fps * 1.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });
  const toastOut = interpolate(frame, [fps * 3.0, fps * 3.5], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <ScreenFrame
      navActive="transfers"
      todayBadge={{ label: "Training", kind: "training" }}
    >
      <AbsoluteFill style={{ opacity: sceneOpacity * exitOpacity }}>
        <div className="absolute inset-0 px-8 py-6 flex flex-col gap-5">
          {/* Page header */}
          <Header frame={frame} fps={fps} />

          {/* Tab strip */}
          <Tabs frame={frame} fps={fps} />

          {/* Body: World Transfers */}
          <Body frame={frame} fps={fps} />
        </div>

        {/* Floating offer toast */}
        <OfferToast opacity={toastIn * toastOut} />
      </AbsoluteFill>
    </ScreenFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const Header: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const o = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  return (
    <div
      className="flex items-center justify-between"
      style={{ opacity: o }}
    >
      <div>
        <h1 className="text-2xl font-black font-display uppercase tracking-wider m-0 flex items-center gap-3">
          <ShoppingBag className="w-7 h-7 text-primary glow-text" />
          Transfers
        </h1>
        <p className="text-xs text-muted-foreground mt-1 m-0">
          Live market · 47 deals today · €2.1B traded this window
        </p>
      </div>

      {/* Budget summary */}
      <div className="flex items-center gap-3">
        <div className="card-arcade rounded-lg px-4 py-2 flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Transfer Budget
          </span>
          <span className="text-lg font-display font-black text-primary glow-text">
            €247M
          </span>
        </div>
        <div className="card-arcade rounded-lg px-4 py-2 flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Wage Headroom
          </span>
          <span className="text-lg font-display font-black text-foreground">
            €4.2M/wk
          </span>
        </div>
      </div>
    </div>
  );
};

const Tabs: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const o = interpolate(frame, [fps * 0.1, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const tabs = [
    { label: "My Transfers", icon: ShoppingBag, count: 3, active: false },
    { label: "World", icon: Globe, count: 47, active: true },
    { label: "For Sale", icon: Tag, count: 12, active: false },
  ];
  return (
    <div
      className="flex items-center gap-2 border-b border-border pb-3"
      style={{ opacity: o }}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <div
            key={t.label}
            className={
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest " +
              (t.active
                ? "card-arcade border-glow text-primary glow-text glow-primary-sm"
                : "text-muted-foreground")
            }
          >
            <Icon className="w-4 h-4" />
            {t.label}
            <span
              className={
                "ml-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums " +
                (t.active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground")
              }
            >
              {t.count}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const Body: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const o = interpolate(frame, [fps * 0.3, fps * 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  return (
    <div
      className="flex-1 flex flex-col gap-3 overflow-hidden"
      style={{ opacity: o }}
    >
      {/* Column header */}
      <div className="grid grid-cols-[40px_1fr_60px_50px_180px_180px_120px_110px] gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
        <div />
        <div className="flex items-center gap-1">
          Player <ChevronsUpDown className="w-3 h-3" />
        </div>
        <div className="text-center">Pos</div>
        <div className="text-center">Age</div>
        <div>From</div>
        <div>To</div>
        <div className="text-right">Fee</div>
        <div className="text-center">Status</div>
      </div>

      <div className="flex flex-col gap-1.5">
        {WORLD_TRANSFERS.map((t, i) => {
          const start = fps * 0.55 + i * 4;
          const rowO = interpolate(
            frame,
            [start, start + fps * 0.35],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo },
          );
          const rowY = interpolate(
            frame,
            [start, start + fps * 0.35],
            [12, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo },
          );

          return (
            <TransferRow
              key={i}
              t={t}
              opacity={rowO}
              translateY={rowY}
            />
          );
        })}
      </div>
    </div>
  );
};

const TransferRow: React.FC<{
  t: (typeof WORLD_TRANSFERS)[number];
  opacity: number;
  translateY: number;
}> = ({ t, opacity, translateY }) => {
  const statusMeta = {
    accepted: { Icon: CheckCircle2, className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
    pending: { Icon: Clock, className: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
    negotiating: { Icon: TrendingUp, className: "text-primary bg-primary/10 border-primary/30 glow-primary-sm" },
    rejected: { Icon: XCircle, className: "text-destructive bg-destructive/10 border-destructive/25" },
  }[t.status];
  const StatusIcon = statusMeta.Icon;

  const posColor: Record<string, string> = {
    GK: "text-chart-4",
    DEF: "text-blue-400",
    MID: "text-primary",
    FWD: "text-destructive",
  };

  return (
    <div
      className={
        "grid grid-cols-[40px_1fr_60px_50px_180px_180px_120px_110px] gap-3 items-center px-4 py-3 rounded-md " +
        (t.isUserClub ? "card-arcade border-glow" : "hover:bg-secondary/30")
      }
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-display font-bold uppercase text-muted-foreground">
        {t.playerName
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2)}
      </div>

      <div className="flex flex-col">
        <span className="text-sm font-display font-bold text-foreground truncate">
          {t.playerName}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          €{(Math.round(parseInt(t.fee.replace(/[^0-9]/g, "")) * 0.85)).toFixed(0)}M valuation
        </span>
      </div>

      <div className="text-center">
        <span className={`text-[10px] uppercase tracking-wider font-display font-bold ${posColor[t.position] ?? "text-muted-foreground"}`}>
          {t.position}
        </span>
      </div>
      <div className="text-center text-sm tabular-nums text-foreground">{t.age}</div>

      <div className="text-xs text-muted-foreground truncate">{t.from}</div>

      <div className="flex items-center gap-1.5">
        <ArrowRight className="w-3 h-3 text-primary" />
        <span className={"text-xs font-display font-bold truncate " + (t.to === "Real Madrid" ? "text-primary glow-text" : "text-foreground")}>
          {t.to}
        </span>
      </div>

      <div className="text-right text-base font-display font-black tabular-nums text-primary glow-text">
        {t.fee}
      </div>

      <div className={`flex items-center gap-1.5 justify-center px-2 py-1 rounded-md border text-[10px] uppercase tracking-wider font-display font-bold ${statusMeta.className}`}>
        <StatusIcon className="w-3 h-3" />
        {t.status}
      </div>
    </div>
  );
};

const OfferToast: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    className="absolute top-20 right-8 card-arcade border-glow rounded-xl p-4 flex items-center gap-3 glow-primary-sm w-[340px]"
    style={{ opacity, transform: `translateX(${(1 - opacity) * 30}px)` }}
  >
    <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
      <Bell className="w-5 h-5 text-primary" />
    </div>
    <div className="flex-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Offer received
      </div>
      <div className="text-sm font-display font-bold text-foreground leading-tight">
        Arsenal bid €22M for Ceballos
      </div>
    </div>
  </div>
);
