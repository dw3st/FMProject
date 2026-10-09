import { describe, expect, test } from "bun:test";
import { registrationStatus, type ContinentalGate } from "@/Domain/registration/deadlines";

const g: ContinentalGate = { groupStart: "2026-09-15", groupEnd: "2026-12-15", knockoutStart: "2027-02-16" };

describe("registrationStatus", () => {
  test("league and cup follow the window", () => {
    expect(registrationStatus({ kind: "league", window: { open: true, until: "2026-08-31" }, date: "2026-08-01" }))
      .toEqual({ open: true, until: "2026-08-31" });
    expect(registrationStatus({ kind: "cup", window: { open: false, opensOn: "2027-01-01" }, date: "2026-10-01" }))
      .toEqual({ open: false, opensOn: "2027-01-01" });
  });
  test("continental before the groups: open until the eve of the first match", () => {
    expect(registrationStatus({ kind: "continental", window: { open: true, until: "2026-08-31" }, date: "2026-08-01", continental: g }))
      .toEqual({ open: true, until: "2026-08-31" });
    expect(registrationStatus({ kind: "continental", window: { open: true, until: "2026-09-30" }, date: "2026-09-01", continental: g }))
      .toEqual({ open: true, until: "2026-09-14" });
  });
  test("groups under way: closed", () => {
    const s = registrationStatus({ kind: "continental", window: { open: false, opensOn: "2027-01-01" }, date: "2026-10-10", continental: g });
    expect(s).toEqual({ open: false, stageStarted: true, opensOn: "2027-01-01" });
  });
  test("between groups and knockouts with the window open", () => {
    expect(registrationStatus({ kind: "continental", window: { open: true, until: "2027-01-31" }, date: "2027-01-10", continental: g }))
      .toEqual({ open: true, until: "2027-01-31" });
  });
  test("window closed", () => {
    expect(registrationStatus({ kind: "continental", window: { open: false, opensOn: "2027-01-01" }, date: "2026-12-20", continental: g }))
      .toEqual({ open: false, opensOn: "2027-01-01" });
  });
  test("knockouts under way: closed for the season", () => {
    expect(registrationStatus({ kind: "continental", window: { open: true, until: "2027-03-01" }, date: "2027-03-01", continental: g }))
      .toEqual({ open: false, stageStarted: true });
  });
});
