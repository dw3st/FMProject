import { describe, expect, test } from "bun:test";
import { inboxAction } from "@/GameInterface/Inbox/inboxAction";
import type { InboxMessage } from "@/types/inboxTypes";

const club = { leagueSlug: "premier_league", clubId: "33" };
const msg = (m: Record<string, unknown>) => ({ id: "x", date: "2027-01-01", read: false, subject: "", preview: "", ...m }) as unknown as InboxMessage;

describe("inboxAction", () => {
  test("a worn facility opens the Club screen to repair it", () => {
    expect(inboxAction(msg({ category: "facilities", kind: "worn", item: "trainingPitches" }), club)).toEqual({ href: "/club", label: "repair" });
    expect(inboxAction(msg({ category: "facilities", kind: "completed" }), club)).toBeNull();
  });
  test("one expiring contract opens the renewal on the player page; several open the squad", () => {
    expect(inboxAction(msg({ category: "contract", kind: "expiring", players: [{ id: "p1", name: "A" }] }), club)?.href)
      .toBe("/player/premier_league/33/p1?action=renew");
    expect(inboxAction(msg({ category: "contract", kind: "expiring", players: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }] }), club)?.href)
      .toBe("/squad/premier_league/33");
    expect(inboxAction(msg({ category: "contract", kind: "staff_expiring", players: [] }), club)?.href).toBe("/staff");
  });
  test("no club: no squad links", () => {
    expect(inboxAction(msg({ category: "registration", kind: "closing" }), null)).toBeNull();
  });
});
