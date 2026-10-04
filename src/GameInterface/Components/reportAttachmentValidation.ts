// Pure, ReportModal-independent client-side validation for a report screenshot attachment.
// Mirrors the server-side limits (src/backend/reports.ts): PNG/JPEG only, 2 MB max. The server
// re-validates everything (content type, size, magic bytes) — this is only a fast, friendly
// pre-check so a tester doesn't wait for a round-trip to learn a 10 MB screenshot is too big.
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ATTACHMENT_ACCEPTED_TYPES = ["image/png", "image/jpeg"] as const;

type AttachmentValidationErrorCode = "type" | "size";

export interface AttachmentFileLike {
  type: string;
  size: number;
}

export type AttachmentValidationResult =
  | { ok: true }
  | { ok: false; error: AttachmentValidationErrorCode };

export function validateAttachmentFile(file: AttachmentFileLike): AttachmentValidationResult {
  if (!(ATTACHMENT_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "type" };
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "size" };
  }
  return { ok: true };
}
