import { describe, expect, test } from "bun:test";
import { loginUrlFor, safeNextPath } from "@/GameInterface/authRedirect";

describe("auth redirect", () => {
  test("the login link carries the current path", () => {
    expect(loginUrlFor("/join/23456789AB", "")).toBe("/login?next=%2Fjoin%2F23456789AB");
    expect(loginUrlFor("/dashboard", "?tab=x")).toBe("/login?next=%2Fdashboard%3Ftab%3Dx");
    expect(loginUrlFor("/", "")).toBe("/login");
  });

  test("only a same-site path is followed", () => {
    expect(safeNextPath("?next=%2Fjoin%2F23456789AB")).toBe("/join/23456789AB");
    expect(safeNextPath("")).toBe("/start");
    expect(safeNextPath("?next=https%3A%2F%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%5Cevil")).toBe("/start");
    expect(safeNextPath("?next=%2Flogin")).toBe("/start");
    expect(safeNextPath("?next=%2FLogin")).toBe("/start");
    expect(safeNextPath("?next=%2F%09%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%0A%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%0D%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2Fdashboard%3Ftab%3Dx%23h")).toBe("/dashboard?tab=x#h");
  });
});
