import { describe, expect, test } from "bun:test";
import { closeSync, openSync, readSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BOM = [0xef, 0xbb, 0xbf];

function startsWithBom(path: string): boolean {
  const fd = openSync(`${ROOT}/${path}`, "r");
  try {
    const head = Buffer.alloc(3);
    const n = readSync(fd, head, 0, 3, 0);
    return n === 3 && BOM.every((b, i) => head[i] === b);
  } finally {
    closeSync(fd);
  }
}

/**
 * A UTF-8 byte-order mark at the start of package.json made bun-plugin-tailwind fail to parse it,
 * and every page answered 500 in production (hotfix b7b56f64). No config or source file may have one.
 */
describe("repo hygiene", () => {
  test("no UTF-8 BOM in config files or src (outside src/Data)", async () => {
    const files = ["package.json", "tsconfig.json", "bunfig.toml"];
    for await (const f of new Bun.Glob("src/**/*.{ts,tsx,json}").scan({ cwd: ROOT })) {
      const path = f.replaceAll("\\", "/");
      if (!path.startsWith("src/Data/")) files.push(path);
    }
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter(startsWithBom)).toEqual([]);
  });
});
