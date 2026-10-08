import { describe, expect, test } from "bun:test";
import { shirtName } from "@/Domain/shirtName";

describe("shirtName", () => {
  test("last surname of a long name", () => {
    expect(shirtName("Grady Akiobo Akiobo")).toBe("Akiobo");
    expect(shirtName("Mohamed Salah Hamed Mahrous Ghaly")).toBe("Ghaly");
  });

  test("abbreviated name keeps what follows the initial", () => {
    expect(shirtName("E. Haaland")).toBe("Haaland");
    expect(shirtName("T. van Dijk")).toBe("van Dijk");
    expect(shirtName("J.-P. Müller")).toBe("Müller");
  });

  test("one-token names stay", () => {
    expect(shirtName("Rodri")).toBe("Rodri");
    expect(shirtName("  Pedri  ")).toBe("Pedri");
    expect(shirtName("")).toBe("");
  });

  test("particles stay with the surname", () => {
    expect(shirtName("Virgil van Dijk")).toBe("van Dijk");
    expect(shirtName("Kevin De Bruyne")).toBe("De Bruyne");
    expect(shirtName("Rafael van der Vaart")).toBe("van der Vaart");
    expect(shirtName("Bruno dos Santos")).toBe("dos Santos");
    expect(shirtName("Daniel da Silva")).toBe("da Silva");
  });

  test("hyphenated surname is preserved", () => {
    expect(shirtName("Trent Alexander-Arnold")).toBe("Alexander-Arnold");
  });

  test("generational suffix goes with the name before it", () => {
    expect(shirtName("Vinícius Júnior")).toBe("Vinícius Júnior");
    expect(shirtName("Neymar da Silva Jr.")).toBe("da Silva Jr.");
  });
});
