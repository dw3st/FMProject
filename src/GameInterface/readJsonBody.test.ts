import { describe, expect, test } from "bun:test";
import { readJsonBody } from "@/GameInterface/readJsonBody";

describe("readJsonBody", () => {
  test("JSON object is returned as is", async () => {
    expect(await readJsonBody(Response.json({ a: 1 }))).toEqual({ a: 1 });
  });
  test("a plain-text error page becomes { error } with the status", async () => {
    const body = await readJsonBody(new Response("Something went wrong!", { status: 500 }));
    expect(body.error).toBe("server error (500): Something went wrong!");
  });
  test("empty body", async () => {
    expect((await readJsonBody(new Response("", { status: 502 }))).error).toBe("server error (502)");
  });
});
