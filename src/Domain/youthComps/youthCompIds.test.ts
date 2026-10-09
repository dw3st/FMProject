import { describe, expect, test } from "bun:test";
import { isYouthCompSlug, youthCompAgeOf, youthCompSlugOf } from "@/Domain/youthComps/youthCompIds";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";

describe("youth competition ids", () => {
  test("slug per country and age, same normalisation as the cup", () => {
    expect(youthCompSlugOf("England", "u21")).toBe("u21_england");
    expect(youthCompSlugOf("Côte d’Ivoire", "u19")).toBe("u19_cote_d_ivoire");
    expect(cupSlugOf("Côte d’Ivoire")).toBe("cup_cote_d_ivoire");
  });
  test("recognised and never a cup or continental", () => {
    for (const s of ["u21_brazil", "u19_england"]) {
      expect(isYouthCompSlug(s)).toBe(true);
      expect(isCupSlug(s)).toBe(false);
      expect(isContinentalSlug(s)).toBe(false);
    }
    expect(isYouthCompSlug("premier_league")).toBe(false);
    expect(youthCompAgeOf("u19_brazil")).toBe("u19");
    expect(youthCompAgeOf("u21_brazil")).toBe("u21");
    expect(youthCompAgeOf("cup_brazil")).toBeNull();
  });
  test("config", () => {
    expect(YOUTH_COMP.MAX_AGE).toEqual({ u21: 21, u19: 19 });
    expect(YOUTH_COMP.PREFERRED_DAYS.u21[0]).toBe(2); // terça
    expect(YOUTH_COMP.PREFERRED_DAYS.u19[0]).toBe(4); // quinta
    expect(Object.values(YOUTH_COMP.FILLER_POOL).reduce((a, b) => a + b, 0)).toBe(14);
  });
});
