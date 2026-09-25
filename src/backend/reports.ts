// Tester-only bug/improvement/tweak reports. See .claude/rules/tester-reports.md.
//
// Reports are appended as JSON lines to `${RUNTIME_DATA_DIR}/reports.jsonl` — the same
// runtime-writable directory as saves and the auth DB, so in production it lands on the
// Docker volume (`persistent/reports.jsonl`), never inside the versioned `src/Data`.
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { requireAuth } from "@/backend/auth/middleware";
import { isTesterEmail } from "@/backend/auth/testers";
import { isSaveOwner } from "@/backend/auth/saveOwnership";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

export const REPORT_TYPES = ["bug", "improvement", "tweak"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const DESCRIPTION_MIN = 5;
const DESCRIPTION_MAX = 2000;
const PAGE_MAX = 200;

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

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

// --- Per-user in-memory rate limit (sliding window). Module-level state, so it resets on
// process restart (or on a fresh dynamic import in tests) — acceptable for an abuse guard,
// not a durable counter. ---
const rateLimitLog = new Map<string, number[]>();

/** Test-only: clears all rate-limit state. */
export function resetReportRateLimit(): void {
  rateLimitLog.clear();
}

function isRateLimited(userId: string, now: number): boolean {
  const recent = (rateLimitLog.get(userId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  rateLimitLog.set(userId, recent);
  return recent.length >= RATE_LIMIT_MAX;
}

function recordSubmission(userId: string, now: number): void {
  const recent = rateLimitLog.get(userId) ?? [];
  recent.push(now);
  rateLimitLog.set(userId, recent);
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

  let saveId: string | null = null;
  if (body.saveId !== undefined && body.saveId !== null) {
    if (typeof body.saveId !== "string" || !body.saveId.trim()) {
      return { ok: false, error: "invalid saveId" };
    }
    if (!isSaveOwner(body.saveId, userId)) {
      return { ok: false, error: "invalid saveId" };
    }
    saveId = body.saveId;
  }

  const gameDate =
    typeof body.gameDate === "string" && body.gameDate.trim() ? body.gameDate.trim() : null;

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

    let raw: RawReportBody;
    try {
      raw = (await req.json()) as RawReportBody;
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

    const record: ReportRecord = {
      id: randomUUID(),
      createdAt: new Date(now).toISOString(),
      userId: auth.userId,
      email: auth.email,
      ...validated.value,
      userAgent: req.headers.get("user-agent"),
    };

    await mkdir(RUNTIME_DATA_DIR, { recursive: true });
    await appendFile(reportsFilePath(), `${JSON.stringify(record)}\n`, "utf8");

    return Response.json({ ok: true, id: record.id });
  },
};
