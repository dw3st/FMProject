import { describe, expect, test } from "bun:test";
import { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";
import { describeLedgerEntry } from "@/Domain/finance/ledgerText";

describe("craft messages", () => {
  test("allowance, done and built have a subject and a preview", () => {
    expect(buildFacilityMessage({ date: "2027-03-01", kind: "craft_allowance", cost: 120_000 }).subject).toContain("materials");
    expect(buildFacilityMessage({ date: "2027-03-01", kind: "craft_done", components: { beam: 5 } }).preview).toContain("5");
    expect(buildFacilityMessage({ date: "2027-03-01", kind: "built", item: "gym", quality: "excellent" }).subject).toContain("gym");
  });
  test("materials ledger line", () => {
    expect(describeLedgerEntry({ kind: "facilities", ref: { facility: "materials" } })).toEqual({ key: "craftMaterials" });
  });
});
