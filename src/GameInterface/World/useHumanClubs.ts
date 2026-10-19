import { useEffect, useState } from "react";
import { humanClubsOf } from "@/Domain/multiplayer/humanClubs";
import { worldApi } from "@/GameInterface/World/worldApi";

const EMPTY = new Map<string, string>();

/** Clubs run by humans in the open friends' league (club id → nickname); empty in a solo save or while loading. */
export function useHumanClubs(saveId: string | null | undefined, multi: boolean): Map<string, string> {
  const [clubs, setClubs] = useState<Map<string, string>>(EMPTY);
  useEffect(() => {
    if (!saveId || !multi) {
      setClubs(EMPTY);
      return;
    }
    let cancelled = false;
    void worldApi.view(saveId).then((r) => {
      if (!cancelled && r.ok) setClubs(humanClubsOf(r.data.members));
    });
    return () => {
      cancelled = true;
    };
  }, [saveId, multi]);
  return clubs;
}
