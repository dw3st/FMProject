/**
 * Pulls tester reports (see .claude/rules/tester-reports.md) and prints them, newest first.
 *
 * By default it fetches `reports.jsonl` from the homelab over SSH (host alias `VMHOME`,
 * see `.ssh/config` — the user calls the box "VMLOCAL"), from the same `persistent/` volume
 * the compose file mounts (`docker-compose.yml`: `RUNTIME_DATA_DIR=/app/persistent`):
 *
 *   ssh VMHOME "cat /opt/docker/projects/fmproject/persistent/reports.jsonl"
 *
 * Pass `--local <path>` to read a local file instead (e.g. a fixture, or a copy already
 * downloaded) — useful for testing this script without touching the homelab.
 *
 * A report may have a screenshot attachment, stored as a standalone file (never inside
 * reports.jsonl — it's append-only) at `<...>/report-attachments/<id>.png|jpg`. This script
 * lists that sibling directory (over SSH, or next to the --local file) and flags each report
 * that has one; `--download-attachments <dir>` copies those files locally.
 *
 * Filters (composable):
 *   --type bug|improvement|tweak   only this report type
 *   --since YYYY-MM-DD             only reports created on/after this date (by createdAt)
 *   --user <substring>             only reports whose email contains this (case-insensitive)
 *   --json                         print the filtered array as JSON instead of the text view
 *   --download-attachments <dir>   copy the attachments of the (filtered) reports into <dir>
 *   --all                          also list reports marked done (hidden by default)
 *   --mark <id,id> --as done|wait|open [--note <text>]
 *                                  record the triage status in docs/reports-status.json and exit
 *                                  (ids only, never the report text: the repo is public)
 *
 * Usage:
 *   bun scripts/fetchReports.ts
 *   bun scripts/fetchReports.ts --local scripts/fixtures/reports.jsonl
 *   bun scripts/fetchReports.ts --type bug --since 2026-09-01
 *   bun scripts/fetchReports.ts --user dev@localhost --json
 *   bun scripts/fetchReports.ts --download-attachments ./downloaded-attachments
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REMOTE_HOST = "VMHOME";
const REMOTE_PATH = "/opt/docker/projects/fmproject/persistent/reports.jsonl";
const REMOTE_ATTACHMENTS_DIR = "/opt/docker/projects/fmproject/persistent/report-attachments";

interface ReportRecord {
  id: string;
  createdAt: string;
  userId: string;
  email: string;
  type: "bug" | "improvement" | "tweak";
  description: string;
  saveId: string | null;
  page: string;
  gameDate: string | null;
  userAgent: string | null;
}

// ASCII control chars (except \t, \n which the text view already indents/keeps readable),
// C1 controls, and bidi override/isolate chars — untrusted report text (description, email,
// page, ...) could otherwise spoof terminal output (CR overwrite, ANSI escapes, right-to-left
// override tricks) or break the --json output's readability. Replaced with U+FFFD.
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

function sanitize(s: string): string {
  return s.replace(CONTROL_CHAR_RE, "�");
}

function sanitizeNullable(s: string | null): string | null {
  return s === null ? null : sanitize(s);
}

function sanitizeRecord(r: ReportRecord): ReportRecord {
  return {
    ...r,
    id: sanitize(r.id),
    createdAt: sanitize(r.createdAt),
    userId: sanitize(r.userId),
    email: sanitize(r.email),
    description: sanitize(r.description),
    saveId: sanitizeNullable(r.saveId),
    page: sanitize(r.page),
    gameDate: sanitizeNullable(r.gameDate),
    userAgent: sanitizeNullable(r.userAgent),
  };
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function fetchRemoteContents(): string {
  const proc = Bun.spawnSync(["ssh", REMOTE_HOST, `cat ${REMOTE_PATH}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString("utf8").trim();
    console.error(`Failed to fetch ${REMOTE_PATH} from ${REMOTE_HOST} over SSH.`);
    if (stderr) console.error(stderr);
    console.error(
      `\nIf no reports exist yet, the file may not exist on the remote host — that is expected.` +
        `\nTo test this script without the homelab, use --local <path>.`,
    );
    process.exit(1);
  }
  return proc.stdout.toString("utf8");
}

// The exact shape the server writes: `<uuid>.png` or `<uuid>.jpg` (src/backend/reports.ts).
// Anything else found in the attachments directory is ignored, and never used to build a path.
const ATTACHMENT_FILENAME_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpg)$/i;

/** Filenames present under the remote attachments directory — [] if it doesn't exist yet. */
function listRemoteAttachmentFiles(): string[] {
  const proc = Bun.spawnSync(
    ["ssh", REMOTE_HOST, `ls -1 ${REMOTE_ATTACHMENTS_DIR} 2>/dev/null`],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (proc.exitCode !== 0) return [];
  return proc.stdout
    .toString("utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The local sibling `report-attachments` directory next to a --local reports.jsonl path. */
function localAttachmentsDir(localReportsPath: string): string {
  return join(dirname(localReportsPath), "report-attachments");
}

function listLocalAttachmentFiles(localReportsPath: string): string[] {
  try {
    return readdirSync(localAttachmentsDir(localReportsPath));
  } catch {
    return [];
  }
}

/** report id (lowercased) -> its attachment's filename, for every filename that looks like one
 *  the server actually writes. */
function buildAttachmentMap(filenames: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of filenames) {
    const m = ATTACHMENT_FILENAME_RE.exec(name);
    if (m) map.set(m[1]!.toLowerCase(), name);
  }
  return map;
}

/** Downloads one attachment's bytes over SSH. `filename` must already have passed
 *  ATTACHMENT_FILENAME_RE (via buildAttachmentMap) before it's ever interpolated into a
 *  remote shell command. */
function fetchRemoteAttachmentBytes(filename: string): Buffer | null {
  if (!ATTACHMENT_FILENAME_RE.test(filename)) return null;
  const proc = Bun.spawnSync(["ssh", REMOTE_HOST, `cat ${REMOTE_ATTACHMENTS_DIR}/${filename}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) return null;
  return Buffer.from(proc.stdout);
}

/** Copies the attachments of the given reports into `destDir` — over SSH when not --local,
 *  from the local sibling directory otherwise. Returns how many were copied. */
function downloadAttachments(
  records: ReportRecord[],
  attachments: Map<string, string>,
  destDir: string,
  localReportsPath: string | undefined,
): number {
  mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const r of records) {
    const filename = attachments.get(r.id.toLowerCase());
    if (!filename) continue;
    const bytes = localReportsPath
      ? safeReadLocalAttachment(localAttachmentsDir(localReportsPath), filename)
      : fetchRemoteAttachmentBytes(filename);
    if (!bytes) {
      console.error(`Could not read attachment ${filename} for report ${r.id}, skipping.`);
      continue;
    }
    writeFileSync(join(destDir, filename), bytes);
    copied++;
  }
  return copied;
}

function safeReadLocalAttachment(dir: string, filename: string): Buffer | null {
  if (!ATTACHMENT_FILENAME_RE.test(filename)) return null;
  try {
    return readFileSync(join(dir, filename));
  } catch {
    return null;
  }
}

function parseJsonl(contents: string): ReportRecord[] {
  const records: ReportRecord[] = [];
  const lines = contents.split("\n");
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as ReportRecord);
    } catch {
      console.error(`Skipping malformed JSON on line ${i + 1}: ${sanitize(trimmed.slice(0, 80))}`);
    }
  }
  return records;
}

/** Triage status of each report, kept in the repo so a fixed report is never worked on twice. */
type ReportStatus = { status: "done" | "wait"; note?: string; on: string };
const STATUS_FILE = "docs/reports-status.json";

function readStatuses(): Record<string, ReportStatus> {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, "utf8")) as Record<string, ReportStatus>;
  } catch {
    return {};
  }
}

function markReports(args: string[]): void {
  const ids = (argValue(args, "--mark") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const as = argValue(args, "--as");
  const note = argValue(args, "--note");
  if (ids.length === 0 || !as || !["done", "wait", "open"].includes(as)) {
    console.error("usage: --mark <id,id> --as done|wait|open [--note <text>]");
    process.exit(1);
  }
  if (ids.some((id) => !/^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/.test(id))) {
    console.error("ids must be report ids (full uuid or its first 8 hex digits)");
    process.exit(1);
  }
  const statuses = readStatuses();
  const on = new Date().toISOString().slice(0, 10);
  for (const id of ids) {
    const key = id.slice(0, 8);
    if (as === "open") delete statuses[key];
    else statuses[key] = { status: as as "done" | "wait", ...(note ? { note } : {}), on };
  }
  const sorted = Object.fromEntries(Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(STATUS_FILE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`${ids.length} report(s) marked ${as}.`);
}

/** The status of a report, keyed by the first 8 digits of its id. */
function statusOf(statuses: Record<string, ReportStatus>, id: string): ReportStatus | undefined {
  return statuses[id.toLowerCase().slice(0, 8)];
}

function formatReport(r: ReportRecord, attachmentFilename: string | undefined, status?: ReportStatus): string {
  const lines = [
    `${r.createdAt}  [${r.type}]${status ? `  [${status.status}${status.note ? `: ${sanitize(status.note)}` : ""}]` : ""}  ${r.email}`,
    `  id: ${r.id}`,
    `  page: ${r.page}${r.gameDate ? `  game date: ${r.gameDate}` : ""}${r.saveId ? `  save: ${r.saveId}` : ""}`,
    `  ${r.description.replace(/\n/g, "\n  ")}`,
  ];
  if (attachmentFilename) {
    lines.push(`  [imagem anexada: ${sanitize(attachmentFilename)}]`);
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--mark")) return markReports(args);
  const showAll = hasFlag(args, "--all");
  const statuses = readStatuses();

  const localPath = argValue(args, "--local");
  const typeFilter = argValue(args, "--type") as ReportRecord["type"] | undefined;
  const sinceFilter = argValue(args, "--since");
  const userFilter = argValue(args, "--user")?.toLowerCase();
  const asJson = hasFlag(args, "--json");
  const downloadDir = argValue(args, "--download-attachments");

  if (typeFilter && !["bug", "improvement", "tweak"].includes(typeFilter)) {
    console.error(`--type must be one of bug, improvement, tweak (got "${typeFilter}")`);
    process.exit(1);
  }
  if (sinceFilter && Number.isNaN(Date.parse(sinceFilter))) {
    console.error(`--since must be a valid date (got "${sinceFilter}")`);
    process.exit(1);
  }

  const contents = localPath ? readFileSync(localPath, "utf8") : fetchRemoteContents();
  let records = parseJsonl(contents);

  const attachmentFiles = localPath ? listLocalAttachmentFiles(localPath) : listRemoteAttachmentFiles();
  const attachments = buildAttachmentMap(attachmentFiles);

  if (typeFilter) records = records.filter((r) => r.type === typeFilter);
  if (sinceFilter) {
    const sinceMs = Date.parse(sinceFilter);
    records = records.filter((r) => Date.parse(r.createdAt) >= sinceMs);
  }
  if (userFilter) records = records.filter((r) => r.email.toLowerCase().includes(userFilter));
  const hidden = showAll ? 0 : records.filter((r) => statusOf(statuses, r.id)?.status === "done").length;
  if (!showAll) records = records.filter((r) => statusOf(statuses, r.id)?.status !== "done");

  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  records = records.map(sanitizeRecord);

  if (downloadDir) {
    const copied = downloadAttachments(records, attachments, downloadDir, localPath);
    console.log(`Downloaded ${copied} attachment(s) into ${downloadDir}.`);
  }

  if (asJson) {
    const withAttachment = records.map((r) => ({
      ...r,
      attachment: attachments.get(r.id.toLowerCase()) ?? null,
      status: statusOf(statuses, r.id) ?? null,
    }));
    console.log(JSON.stringify(withAttachment, null, 2));
    return;
  }

  if (records.length === 0) {
    console.log("No reports match.");
    return;
  }

  console.log(`${records.length} report(s)${hidden > 0 ? ` (${hidden} marked done hidden; --all shows them)` : ""}:\n`);
  for (const r of records) {
    console.log(formatReport(r, attachments.get(r.id.toLowerCase()), statusOf(statuses, r.id)));
    console.log("");
  }
}

main();
