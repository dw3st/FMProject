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

function formatReport(r: ReportRecord, attachmentFilename: string | undefined): string {
  const lines = [
    `${r.createdAt}  [${r.type}]  ${r.email}`,
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
    }));
    console.log(JSON.stringify(withAttachment, null, 2));
    return;
  }

  if (records.length === 0) {
    console.log("No reports match.");
    return;
  }

  console.log(`${records.length} report(s):\n`);
  for (const r of records) {
    console.log(formatReport(r, attachments.get(r.id.toLowerCase())));
    console.log("");
  }
}

main();
