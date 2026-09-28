import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_MAX_BYTES,
  validateAttachmentFile,
} from "@/GameInterface/Components/reportAttachmentValidation";

describe("validateAttachmentFile", () => {
  test("accepts a PNG under the size limit", () => {
    expect(validateAttachmentFile({ type: "image/png", size: 1024 })).toEqual({ ok: true });
  });

  test("accepts a JPEG under the size limit", () => {
    expect(validateAttachmentFile({ type: "image/jpeg", size: 1024 })).toEqual({ ok: true });
  });

  test("accepts a file exactly at the size limit", () => {
    expect(validateAttachmentFile({ type: "image/png", size: ATTACHMENT_MAX_BYTES })).toEqual({
      ok: true,
    });
  });

  test("rejects a file over the size limit, even a valid type", () => {
    expect(
      validateAttachmentFile({ type: "image/png", size: ATTACHMENT_MAX_BYTES + 1 }),
    ).toEqual({ ok: false, error: "size" });
  });

  test.each(["image/gif", "image/webp", "application/pdf", "text/plain", ""])(
    "rejects an unsupported type %p, even at a tiny size",
    (type) => {
      expect(validateAttachmentFile({ type, size: 10 })).toEqual({ ok: false, error: "type" });
    },
  );

  test("type is checked before size (reports the more actionable error first)", () => {
    expect(
      validateAttachmentFile({ type: "image/gif", size: ATTACHMENT_MAX_BYTES + 1 }),
    ).toEqual({ ok: false, error: "type" });
  });
});
