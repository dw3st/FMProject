// Tester-only bug/improvement/tweak reports. See .claude/rules/tester-reports.md.
//
// Reports are appended as JSON lines to `${RUNTIME_DATA_DIR}/reports.jsonl` — the same
// runtime-writable directory as saves and the auth DB, so in production it lands on the
// Docker volume (`persistent/reports.jsonl`), never inside the versioned `src/Data`.
//
// A report may optionally carry ONE screenshot attachment, uploaded in a separate request
// (`POST /api/reports/:id/attachment`, raw image bytes, no multipart) after the report itself
// is accepted — this keeps the 16 KB JSON body cap on `/api/reports` untouched. The image is
// stored as a standalone file under `${RUNTIME_DATA_DIR}/report-attachments/<id>.png|jpg` —
// reports.jsonl is append-only, so the attachment is never recorded there; its presence is
// inferred from the file existing on disk (see fetchReports.ts).
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { requireAuth } from "@/backend/auth/middleware";
import { isTesterEmail } from "@/backend/auth/testers";
import { isSaveOwner } from "@/backend/auth/saveOwnership";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

const REPORT_TYPES = ["bug", "improvement", "tweak"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const DESCRIPTION_MIN = 5;
const DESCRIPTION_MAX = 2000;
const PAGE_MAX = 200;
const USER_AGENT_MAX = 300;
const GAME_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD (rejects 2027-02-30, 2027-13-01…). */
function isRealDate(s: string): boolean {
  if (!GAME_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const MAX_BODY_BYTES = 16 * 1024; // 16 KB

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// --- Attachment limits. A separate, small hourly limit (documented in tester-reports.md) —
// independent from the report rate limit above, since one report only ever needs one attachment
// attempt, but a struggling upload (retry after a transient failure) shouldn't burn into the
// budget for filing new reports. ---
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB
const ATTACHMENT_RATE_LIMIT_MAX = 20;
const ATTACHMENT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// The exact shape randomUUID() produces (lowercase, hyphenated v4). Validated before the id is
// ever used to build a filesystem path, or to look up ownership.
const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidReportId(id: string): boolean {
  return REPORT_ID_RE.test(id);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function matchesMagicBytes(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

const ATTACHMENT_CONTENT_TYPES: Record<string, { ext: "png" | "jpg"; magic: number[] }> = {
  "image/png": { ext: "png", magic: PNG_MAGIC },
  "image/jpeg": { ext: "jpg", magic: JPEG_MAGIC },
};

/** `${RUNTIME_DATA_DIR}/report-attachments` — exported for tests/scripts. */
export function attachmentsDir(): string {
  return `${RUNTIME_DATA_DIR}/report-attachments`;
}

/** The on-disk path of an existing attachment for this report id, or null if it has none. */
async function existingAttachmentPath(id: string): Promise<string | null> {
  for (const ext of ["png", "jpg"] as const) {
    const path = `${attachmentsDir()}/${id}.${ext}`;
    if (await Bun.file(path).exists()) return path;
  }
  return null;
}

/** Linear scan of reports.jsonl for a record by id — fine at this scale (a tester-only feature). */
async function findReportRecord(id: string): Promise<ReportRecord | null> {
  const file = Bun.file(reportsFilePath());
  if (!(await file.exists())) return null;
  const text = await file.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as ReportRecord;
      if (record.id === id) return record;
    } catch {
      // Skip a malformed line rather than aborting the whole scan.
    }
  }
  return null;
}

export interface ReportRecord {
  id: string;
  createdAt: string;
  userId: string;
  email: string;
  type: ReportType;
  description: string;
  saveId: string | null;
  page: string;
  gameDate: string | null;
  userAgent: string | null;
}

/** Path to the JSONL report file. Exported for tests/scripts — never read/written elsewhere. */
export function reportsFilePath(): string {
  return `${RUNTIME_DATA_DIR}/reports.jsonl`;
}

// --- Per-user in-memory rate limits (sliding window). Module-level state, so it resets on
// process restart (or on a fresh dynamic import in tests) — acceptable for an abuse guard,
// not a durable counter. Two independent logs: filing a report, and uploading an attachment. ---
const rateLimitLog = new Map<string, number[]>();
const attachmentRateLimitLog = new Map<string, number[]>();

/** Test-only: clears all rate-limit state (both the report and the attachment limiters). */
export function resetReportRateLimit(): void {
  rateLimitLog.clear();
  attachmentRateLimitLog.clear();
}

function isLimited(log: Map<string, number[]>, userId: string, now: number, max: number, windowMs: number): boolean {
  const recent = (log.get(userId) ?? []).filter((t) => now - t < windowMs);
  log.set(userId, recent);
  return recent.length >= max;
}

function recordAttempt(log: Map<string, number[]>, userId: string, now: number): void {
  const recent = log.get(userId) ?? [];
  recent.push(now);
  log.set(userId, recent);
}

function isRateLimited(userId: string, now: number): boolean {
  return isLimited(rateLimitLog, userId, now, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
}

function recordSubmission(userId: string, now: number): void {
  recordAttempt(rateLimitLog, userId, now);
}

function isAttachmentRateLimited(userId: string, now: number): boolean {
  return isLimited(
    attachmentRateLimitLog,
    userId,
    now,
    ATTACHMENT_RATE_LIMIT_MAX,
    ATTACHMENT_RATE_LIMIT_WINDOW_MS,
  );
}

function recordAttachmentSubmission(userId: string, now: number): void {
  recordAttempt(attachmentRateLimitLog, userId, now);
}

interface RawReportBody {
  type?: unknown;
  description?: unknown;
  saveId?: unknown;
  page?: unknown;
  gameDate?: unknown;
}

type ValidatedReport = {
  type: ReportType;
  description: string;
  saveId: string | null;
  page: string;
  gameDate: string | null;
};

function validateReportBody(
  body: RawReportBody,
  userId: string,
): { ok: true; value: ValidatedReport } | { ok: false; error: string } {
  const type = typeof body.type === "string" ? body.type : "";
  if (!(REPORT_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "invalid type" };
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters`,
    };
  }

  const page = typeof body.page === "string" ? body.page.trim() : "";
  if (!page || page.length > PAGE_MAX) {
    return { ok: false, error: `page is required and must be at most ${PAGE_MAX} characters` };
  }

  // saveId is best-effort context, not a hard requirement: an unknown or not-owned saveId is
  // stored as null rather than rejecting the whole report (the tester may be reporting from a
  // stale tab, a save they just deleted, etc.) — only its own JSON type is enforced strictly.
  let saveId: string | null = null;
  if (body.saveId !== undefined && body.saveId !== null) {
    if (typeof body.saveId !== "string") {
      return { ok: false, error: "invalid saveId" };
    }
    const trimmed = body.saveId.trim();
    if (trimmed && isSaveOwner(trimmed, userId)) {
      saveId = trimmed;
    }
  }

  let gameDate: string | null = null;
  if (body.gameDate !== undefined && body.gameDate !== null) {
    if (typeof body.gameDate !== "string") {
      return { ok: false, error: "invalid gameDate" };
    }
    const trimmed = body.gameDate.trim();
    if (trimmed) {
      if (!isRealDate(trimmed)) {
        return { ok: false, error: "gameDate must be YYYY-MM-DD" };
      }
      gameDate = trimmed;
    }
  }

  return {
    ok: true,
    value: { type: type as ReportType, description, saveId, page, gameDate },
  };
}

export const reportRoutes = {
  "/api/reports": async (req: Request) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }

    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;

    if (!isTesterEmail(auth.email)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
    if (mediaType !== "application/json") {
      return Response.json({ error: "unsupported content type" }, { status: 415 });
    }

    // Content-Length is a fast, cheap rejection when present, but a client can omit or lie
    // about it — the actual byte length of the body is checked below regardless.
    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }

    let text: string;
    try {
      text = await req.text();
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }

    let raw: RawReportBody;
    try {
      raw = JSON.parse(text) as RawReportBody;
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (!raw || typeof raw !== "object") {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }

    const validated = validateReportBody(raw, auth.userId);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    const now = Date.now();
    if (isRateLimited(auth.userId, now)) {
      return Response.json({ error: "rate limit exceeded, try again later" }, { status: 429 });
    }
    recordSubmission(auth.userId, now);

    const rawUserAgent = req.headers.get("user-agent");
    const userAgent = rawUserAgent ? rawUserAgent.slice(0, USER_AGENT_MAX) : null;

    const record: ReportRecord = {
      id: randomUUID(),
      createdAt: new Date(now).toISOString(),
      userId: auth.userId,
      email: auth.email,
      ...validated.value,
      userAgent,
    };

    await mkdir(RUNTIME_DATA_DIR, { recursive: true });
    await appendFile(reportsFilePath(), `${JSON.stringify(record)}\n`, "utf8");

    return Response.json({ ok: true, id: record.id });
  },

  /**
   * Uploads one screenshot for an already-filed report. Raw image bytes in the body — no
   * multipart — with Content-Type exactly image/png or image/jpeg. See the module comment above.
   */
  "/api/reports/:id/attachment": async (
    req: Request & { params: Record<string, string> },
  ) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }

    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;

    if (!isTesterEmail(auth.email)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    // An id that isn't even shaped like one we generate is treated the same as "not found" —
    // this also keeps a malformed id from ever reaching a filesystem path below.
    const id = req.params.id ?? "";
    if (!isValidReportId(id)) {
      return Response.json({ error: "report not found" }, { status: 404 });
    }

    const record = await findReportRecord(id);
    if (!record || record.userId !== auth.userId) {
      return Response.json({ error: "report not found" }, { status: 404 });
    }

    if (await existingAttachmentPath(id)) {
      return Response.json({ error: "report already has an attachment" }, { status: 409 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
    const kind = ATTACHMENT_CONTENT_TYPES[mediaType];
    if (!kind) {
      return Response.json({ error: "unsupported content type" }, { status: 415 });
    }

    // Content-Length is a fast, cheap rejection when present, but a client can omit or lie
    // about it — the actual byte length of the body is checked below regardless.
    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_ATTACHMENT_BYTES) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await req.arrayBuffer());
    } catch {
      return Response.json({ error: "invalid body" }, { status: 400 });
    }
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }

    if (!matchesMagicBytes(bytes, kind.magic)) {
      return Response.json({ error: "invalid image" }, { status: 400 });
    }

    const now = Date.now();
    if (isAttachmentRateLimited(auth.userId, now)) {
      return Response.json({ error: "rate limit exceeded, try again later" }, { status: 429 });
    }
    recordAttachmentSubmission(auth.userId, now);

    await mkdir(attachmentsDir(), { recursive: true });
    await Bun.write(`${attachmentsDir()}/${id}.${kind.ext}`, bytes);

    return Response.json({ ok: true });
  },
};
