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
 * Filters (composable):
 *   --type bug|improvement|tweak   only this report type
 *   --since YYYY-MM-DD             only reports created on/after this date (by createdAt)
 *   --user <substring>             only reports whose email contains this (case-insensitive)
 *   --json                         print the filtered array as JSON instead of the text view
 *
 * Usage:
 *   bun scripts/fetchReports.ts
 *   bun scripts/fetchReports.ts --local scripts/fixtures/reports.jsonl
 *   bun scripts/fetchReports.ts --type bug --since 2026-09-01
 *   bun scripts/fetchReports.ts --user dev@localhost --json
 */
import { readFileSync } from "node:fs";

const REMOTE_HOST = "VMHOME";
const REMOTE_PATH = "/opt/docker/projects/fmproject/persistent/reports.jsonl";

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

function parseJsonl(contents: string): ReportRecord[] {
  const records: ReportRecord[] = [];
  const lines = contents.split("\n");
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as ReportRecord);
    } catch {
      console.error(`Skipping malformed JSON on line ${i + 1}: ${trimmed.slice(0, 80)}`);
    }
  }
  return records;
}

function formatReport(r: ReportRecord): string {
  const lines = [
    `${r.createdAt}  [${r.type}]  ${r.email}`,
    `  id: ${r.id}`,
    `  page: ${r.page}${r.gameDate ? `  game date: ${r.gameDate}` : ""}${r.saveId ? `  save: ${r.saveId}` : ""}`,
    `  ${r.description.replace(/\n/g, "\n  ")}`,
  ];
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);

  const localPath = argValue(args, "--local");
  const typeFilter = argValue(args, "--type") as ReportRecord["type"] | undefined;
  const sinceFilter = argValue(args, "--since");
  const userFilter = argValue(args, "--user")?.toLowerCase();
  const asJson = hasFlag(args, "--json");

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

  if (typeFilter) records = records.filter((r) => r.type === typeFilter);
  if (sinceFilter) {
    const sinceMs = Date.parse(sinceFilter);
    records = records.filter((r) => Date.parse(r.createdAt) >= sinceMs);
  }
  if (userFilter) records = records.filter((r) => r.email.toLowerCase().includes(userFilter));

  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (asJson) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  if (records.length === 0) {
    console.log("No reports match.");
    return;
  }

  console.log(`${records.length} report(s):\n`);
  for (const r of records) {
    console.log(formatReport(r));
    console.log("");
  }
}

main();
