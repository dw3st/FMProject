import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import catalog from "@/example_data/sponsors.json";
import { SECTOR_ICON } from "@/GameInterface/Sponsors/sponsorPlateStyle";
import { SPONSOR_TRAITS } from "@/Domain/sponsors/sponsorTraits";

type Tree = { [key: string]: string | Tree };

/** Every leaf path of a block, plural / ordinal suffixes folded ("free_one" → "free"). */
function leaves(node: string | Tree, path = ""): string[] {
  if (typeof node === "string") return [path.replace(/_(ordinal_)?(zero|one|two|few|many|other)$/, "")];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}
const keys = (block: unknown) => [...new Set(leaves(block as Tree))].sort();
const at = (root: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root);

describe("sponsors keys", () => {
  test("en and pt-BR have the same texts, none empty", () => {
    for (const block of ["sponsors", "inbox.sponsor"]) {
      const a = at(en, block), b = at(pt, block);
      expect(a).toBeTruthy();
      expect(keys(b)).toEqual(keys(a));
      for (const root of [a, b]) for (const text of JSON.stringify(root).match(/:"[^"]*"/g) ?? []) expect(text.length).toBeGreaterThan(3);
    }
    expect(at(en, "inbox.categories.sponsor")).toBeTruthy();
    expect(at(pt, "inbox.categories.sponsor")).toBeTruthy();
  });

  test("what the screens ask for exists: slots, profiles, goals, errors, inbox kinds", () => {
    const need = [
      ...["master", "kit", "board"].map((s) => `sponsors.slot.${s}`),
      ...["safe", "standard", "demanding"].flatMap((p) => [`sponsors.profile.${p}`, `sponsors.profileHint.${p}`]),
      ...["continental", "promotion", "followers_growth", "attendance", "cup_stage.qf", "cup_stage.sf", "league_position_ordinal_other"].map((g) => `sponsors.goal.${g}`),
      ...["met", "missed", "unknown", "cupReached", "followers", "attendance", "position_ordinal_other"].map((p) => `sponsors.progress.${p}`),
      ...["notFound", "slotTaken", "alreadyNegotiated", "noClub", "lobby", "invalidAction", "load", "generic"].map((e) => `sponsors.error.${e}`),
      ...["accepted", "declined", "raised", "kept", "withdrawn"].map((r) => `sponsors.result.${r}`),
      ...["offers", "auto_signed", "season_review"].map((k) => `inbox.sponsor.subject.${k}`),
      ...["relegated", "missed"].map((r) => `inbox.sponsor.leftReason.${r}`),
      "sponsors.attention_one", "sponsors.attention_other", "sponsors.master.title", "sponsors.tab", "inbox.sponsor.open",
      // 12.1: the company's behaviour, the sponsor page and the strip of the Club tab.
      ...SPONSOR_TRAITS.filter((k) => k !== "none").flatMap((k) => [`sponsors.trait.${k}.name`, `sponsors.trait.${k}.hint`]),
      ...["expired", "renewed", "left_early", "relegated", "club_left"].map((e) => `sponsors.page.end.${e}`),
      ...["local", "national", "global"].map((s) => `sponsors.page.size.${s}`),
      ...["master", "kit", "board"].map((s) => `sponsors.strip.slot.${s}`),
      ...["title", "promoted", "relegated"].map((r) => `sponsors.page.result.${r}`),
      "sponsors.page.place_ordinal_other", "sponsors.page.mine.title", "sponsors.page.current.title", "sponsors.page.results.title",
      "sponsors.page.history.title", "sponsors.strip.title", "sponsors.strip.open", "sponsors.strip.free",
      "screenTitles.sponsor.main", "screenTitles.sponsor.accent",
    ];
    for (const key of need) {
      expect(typeof at(en, key)).toBe("string");
      expect(typeof at(pt, key)).toBe("string");
    }
  });

  test("every sector of the catalog has a name and an icon", () => {
    const sectors = [...new Set((catalog as { sector: string }[]).map((c) => c.sector))];
    expect(sectors.length).toBeGreaterThan(20);
    for (const s of sectors) {
      expect(typeof at(en, `sponsors.sector.${s}`)).toBe("string");
      expect(typeof at(pt, `sponsors.sector.${s}`)).toBe("string");
      expect(SECTOR_ICON[s]).toBeTruthy();
    }
  });
});
