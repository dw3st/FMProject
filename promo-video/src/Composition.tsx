import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { HeroScene } from "./scenes/HeroScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { DevelopmentScene } from "./scenes/DevelopmentScene";
import { TransfersScene } from "./scenes/TransfersScene";
import { FormationScene } from "./scenes/FormationScene";
import { MatchScene } from "./scenes/MatchScene";
import { StatsScene } from "./scenes/StatsScene";
import { LeagueScene } from "./scenes/LeagueScene";
import { OutroScene } from "./scenes/OutroScene";

const FPS = 30;

// Scene durations (frames).
const DUR_HERO        = FPS * 3;   //  3.0s
const DUR_DASHBOARD   = FPS * 4;   //  4.0s
const DUR_DEVELOPMENT = FPS * 4;   //  4.0s
const DUR_TRANSFERS   = FPS * 4;   //  4.0s
const DUR_FORMATION   = FPS * 4;   //  4.0s
const DUR_MATCH       = FPS * 18;  // 18.0s — flagship narrative arc:
                                   //   fail (5s) → sub UI (2.4s) → shot miss (3.3s)
                                   //   → training (2.4s) → goal (3.5s) + transitions
const DUR_STATS       = FPS * 3.5; //  3.5s
const DUR_LEAGUE      = FPS * 5;   //  5.0s — climb-to-top
const DUR_OUTRO       = FPS * 3;   //  3.0s

// Cross-fade between every neighbouring pair.
const XFADE = 10;

export const PROMO_DURATION =
  DUR_HERO +
  DUR_DASHBOARD +
  DUR_DEVELOPMENT +
  DUR_TRANSFERS +
  DUR_FORMATION +
  DUR_MATCH +
  DUR_STATS +
  DUR_LEAGUE +
  DUR_OUTRO -
  XFADE * 8; // 8 transitions

export const PromoVideo: React.FC = () => {
  let cursor = 0;

  const heroFrom = cursor;
  cursor += DUR_HERO - XFADE;

  const dashboardFrom = cursor;
  cursor += DUR_DASHBOARD - XFADE;

  const developmentFrom = cursor;
  cursor += DUR_DEVELOPMENT - XFADE;

  const transfersFrom = cursor;
  cursor += DUR_TRANSFERS - XFADE;

  const formationFrom = cursor;
  cursor += DUR_FORMATION - XFADE;

  const matchFrom = cursor;
  cursor += DUR_MATCH - XFADE;

  const statsFrom = cursor;
  cursor += DUR_STATS - XFADE;

  const leagueFrom = cursor;
  cursor += DUR_LEAGUE - XFADE;

  const outroFrom = cursor;

  return (
    <AbsoluteFill className="bg-background">
      <Sequence from={heroFrom} durationInFrames={DUR_HERO} layout="none">
        <HeroScene />
      </Sequence>

      <Sequence from={dashboardFrom} durationInFrames={DUR_DASHBOARD} layout="none">
        <DashboardScene />
      </Sequence>

      <Sequence from={developmentFrom} durationInFrames={DUR_DEVELOPMENT} layout="none">
        <DevelopmentScene />
      </Sequence>

      <Sequence from={transfersFrom} durationInFrames={DUR_TRANSFERS} layout="none">
        <TransfersScene />
      </Sequence>

      <Sequence from={formationFrom} durationInFrames={DUR_FORMATION} layout="none">
        <FormationScene />
      </Sequence>

      <Sequence from={matchFrom} durationInFrames={DUR_MATCH} layout="none">
        <MatchScene />
      </Sequence>

      <Sequence from={statsFrom} durationInFrames={DUR_STATS} layout="none">
        <StatsScene />
      </Sequence>

      <Sequence from={leagueFrom} durationInFrames={DUR_LEAGUE} layout="none">
        <LeagueScene />
      </Sequence>

      <Sequence from={outroFrom} durationInFrames={DUR_OUTRO} layout="none">
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
