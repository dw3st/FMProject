import { useEffect, useState } from "react";
import { humanClubsOf } from "@/Domain/multiplayer/humanClubs";
import { worldApi } from "@/GameInterface/World/worldApi";

const EMPTY = new Map<string, string>();
const NO_LEAGUES: string[] = [];

export interface HumanWorld {
  /** Clubs run by humans (club id → nickname). */
  clubs: Map<string, string>;
  /** Leagues the day advance plays in the full engine for some seat. */
  fullLeagues: string[];
}

const EMPTY_WORLD: HumanWorld = { clubs: EMPTY, fullLeagues: NO_LEAGUES };

/** The human side of the open friends' league; empty in a solo save or while loading. */
export function useHumanWorld(saveId: string | null | undefined, multi: boolean): HumanWorld {
  const [world, setWorld] = useState<HumanWorld>(EMPTY_WORLD);
  useEffect(() => {
    if (!saveId || !multi) {
      setWorld(EMPTY_WORLD);
      return;
    }
    let cancelled = false;
    void worldApi.view(saveId).then((r) => {
      if (!cancelled && r.ok) setWorld({ clubs: humanClubsOf(r.data.members), fullLeagues: r.data.fullLeagues ?? NO_LEAGUES });
    });
    return () => {
      cancelled = true;
    };
  }, [saveId, multi]);
  return world;
}

/** Clubs run by humans in the open friends' league (club id → nickname); empty in a solo save or while loading. */
export function useHumanClubs(saveId: string | null | undefined, multi: boolean): Map<string, string> {
  return useHumanWorld(saveId, multi).clubs;
}
