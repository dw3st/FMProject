import { db } from "@/backend/db";
import type { PublicEditionView } from "@/types/multiplayerTypes";

type Row = { version: string; saveId: string; startedAt: string; endedAt: string | null; standings: string };
const SELECT = "SELECT version, save_id AS saveId, started_at AS startedAt, ended_at AS endedAt, standings_json AS standings FROM public_editions";

export function openEdition(version: string, saveId: string, startedAt: string): void {
  db.prepare("INSERT OR REPLACE INTO public_editions (version, save_id, started_at, ended_at, standings_json) VALUES (?, ?, ?, NULL, '[]')")
    .run(version, saveId, startedAt);
}

export function editionOf(version: string): (PublicEditionView & { saveId: string }) | null {
  const r = db.prepare(`${SELECT} WHERE version = ?`).get(version) as Row | null;
  return r ? toView(r) : null;
}

/** Ends every open edition except `keepVersion`. */
export function closeOpenEditions(endedAt: string, keepVersion: string): void {
  db.prepare("UPDATE public_editions SET ended_at = ? WHERE ended_at IS NULL AND version <> ?").run(endedAt, keepVersion);
}

export function saveEditionStandings(version: string, standings: PublicEditionView["standings"]): void {
  db.prepare("UPDATE public_editions SET standings_json = ? WHERE version = ?").run(JSON.stringify(standings), version);
}

export function listEditions(): (PublicEditionView & { saveId: string })[] {
  return (db.prepare(`${SELECT} ORDER BY started_at DESC`).all() as Row[]).map(toView);
}

function toView(r: Row): PublicEditionView & { saveId: string } {
  return { version: r.version, saveId: r.saveId, startedAt: r.startedAt, endedAt: r.endedAt, standings: JSON.parse(r.standings) };
}
