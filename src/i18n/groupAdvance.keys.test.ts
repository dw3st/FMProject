import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { GROUP_ADVANCE_ERROR_CODES } from "@/GameInterface/World/groupAdvanceErrors";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  "running", "simulate", "play", "readyButton", "readyTomorrow", "readyNextMatch", "readyDate", "readyConfirm",
  "readyUntil", "waiting_one", "waiting_other", "unmark", "dateInvalid", "retry", "networkError",
  "band.title", "band.date", "band.target", "band.waitingFor", "band.allReady", "band.noDeadline",
  "band.deadlineHours_one", "band.deadlineHours_other", "band.deadlineMinutes_one", "band.deadlineMinutes_other",
  "band.deadlineNow", "band.error",
  "status.column", "status.ready", "status.match", "status.late", "status.no_club",
  "result.pending",
  "inbox.subject", "inbox.preview", "inbox.previewSimulated", "inbox.body", "inbox.bodySimulated",
  "refused.subject", "refused.body", "refused.reason.unregistered", "refused.reason.knockout",
  "refused.reason.two_seats", "refused.reason.other",
  ...GROUP_ADVANCE_ERROR_CODES.map((c) => `errors.${c}`),
].map((k) => `world.advance.${k}`);

describe("group advance i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), `${name} ${k}`).toBe("string");
    });
  }
});
