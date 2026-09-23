"""
normalize_api_football.py — Normalize raw API-Football data into clean JSON.

Reads ONLY from:
  data_process/to_process/api_football/raw/

Writes ONLY to:
  data_process/to_process/api_football/normalized/
    leagues.json
    teams.json
    venues.json
    players.json
    coaches.json

Zero network calls. Re-run freely after fetch_api_football.py has populated raw/.

Run:
  python data_process/normalize_api_football.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

# ─── logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── config ───────────────────────────────────────────────────────────────────

DATA_PROCESS_DIR = Path(__file__).resolve().parent
API_FOOTBALL_DIR = DATA_PROCESS_DIR / "to_process" / "api_football"
RAW_DIR  = API_FOOTBALL_DIR / "raw"
NORM_DIR = API_FOOTBALL_DIR / "normalized"

SOURCE = "api_football"

# ─── helpers ──────────────────────────────────────────────────────────────────

def make_id(source_id: int) -> str:
    return f"{SOURCE}_{source_id}"


def raw_files(subdir: str) -> list[Path]:
    d = RAW_DIR / subdir
    if not d.exists():
        return []
    return sorted(d.glob("*.json"))


def load_raw(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_normalized(filename: str, records: list[dict]) -> None:
    NORM_DIR.mkdir(parents=True, exist_ok=True)
    dest = NORM_DIR / filename
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    log.info("  Wrote %s (%d records)", dest.name, len(records))

# ─── normalize leagues ────────────────────────────────────────────────────────

def normalize_leagues() -> list[dict]:
    """
    Read raw/leagues/*.json.
    Each file is a single league entry (not the full API envelope) saved by fetch_api_football.py.
    """
    leagues: dict[int, dict] = {}

    for path in raw_files("leagues"):
        entry = load_raw(path)

        league   = entry.get("league", {})
        country  = entry.get("country", {})
        seasons  = entry.get("seasons", [])

        source_id: int = league.get("id")
        if source_id is None:
            log.warning("Skipping %s — missing league.id", path.name)
            continue

        current_season = next(
            (s["year"] for s in seasons if s.get("current")),
            None,
        )

        leagues[source_id] = {
            "id":       make_id(source_id),
            "source":   SOURCE,
            "sourceId": source_id,
            "name":     league.get("name"),
            "country":  country.get("name"),
            "season":   current_season,
        }

    log.info("Normalized %d leagues", len(leagues))
    return list(leagues.values())

# ─── normalize teams + venues ─────────────────────────────────────────────────

def normalize_teams_venues() -> tuple[list[dict], list[dict]]:
    """
    Read raw/teams/*.json.
    Each file is the full API envelope for GET /teams?league=X&season=Y.
    """
    teams:  dict[int, dict] = {}
    venues: dict[int, dict] = {}

    for path in raw_files("teams"):
        # Filename format: {leagueId}_{season}.json
        stem   = path.stem                    # e.g. "39_2024"
        parts  = stem.split("_", 1)
        if len(parts) != 2:
            log.warning("Unexpected filename format: %s — skipping", path.name)
            continue

        try:
            league_source_id = int(parts[0])
            season           = int(parts[1])
        except ValueError:
            log.warning("Cannot parse league/season from %s — skipping", path.name)
            continue

        data = load_raw(path)
        for entry in data.get("response", []):
            team  = entry.get("team", {})
            venue = entry.get("venue", {})

            team_id  = team.get("id")
            venue_id = venue.get("id")

            if team_id is None:
                continue

            teams[team_id] = {
                "id":              make_id(team_id),
                "source":          SOURCE,
                "sourceId":        team_id,
                "name":            team.get("name"),
                "leagueSourceId":  league_source_id,
                "season":          season,
                "venueSourceId":   venue_id,
            }

            if venue_id is not None and venue_id not in venues:
                venues[venue_id] = {
                    "id":       make_id(venue_id),
                    "source":   SOURCE,
                    "sourceId": venue_id,
                    "name":     venue.get("name"),
                    "city":     venue.get("city"),
                    "capacity": venue.get("capacity"),
                    "surface":  venue.get("surface"),
                }

    log.info("Normalized %d teams, %d venues", len(teams), len(venues))
    return list(teams.values()), list(venues.values())

# ─── normalize squads (players + coaches) ─────────────────────────────────────

def normalize_squads() -> tuple[list[dict], list[dict]]:
    """
    Read raw/squads/*.json.
    Each file is the full API envelope for GET /players/squads?team=X.
    Filename is {team_id}.json.
    """
    players: dict[int, dict] = {}
    coaches: dict[int, dict] = {}

    for path in raw_files("squads"):
        try:
            team_source_id = int(path.stem)
        except ValueError:
            log.warning("Cannot parse team_id from %s — skipping", path.name)
            continue

        data = load_raw(path)
        for entry in data.get("response", []):
            # Players
            for player in entry.get("players", []):
                pid = player.get("id")
                if pid is None:
                    continue
                players[pid] = {
                    "id":            make_id(pid),
                    "source":        SOURCE,
                    "sourceId":      pid,
                    "name":          player.get("name"),
                    "position":      player.get("position"),
                    "teamSourceId":  team_source_id,
                }

            # Coach
            coach = entry.get("coach")
            if isinstance(coach, dict):
                cid = coach.get("id")
                if cid is not None:
                    coaches[cid] = {
                        "id":           make_id(cid),
                        "source":       SOURCE,
                        "sourceId":     cid,
                        "name":         coach.get("name"),
                        "teamSourceId": team_source_id,
                    }

    log.info("Normalized %d players, %d coaches", len(players), len(coaches))
    return list(players.values()), list(coaches.values())

# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("=== normalize_api_football.py ===")
    log.info("RAW_DIR:  %s", RAW_DIR)
    log.info("NORM_DIR: %s", NORM_DIR)

    if not RAW_DIR.exists():
        log.error("raw/ directory not found at %s", RAW_DIR)
        log.error("Run fetch_api_football.py first.")
        return

    leagues              = normalize_leagues()
    teams, venues        = normalize_teams_venues()
    players, coaches     = normalize_squads()

    write_normalized("leagues.json", leagues)
    write_normalized("teams.json",   teams)
    write_normalized("venues.json",  venues)
    write_normalized("players.json", players)
    write_normalized("coaches.json", coaches)

    log.info("Done. Normalized data saved under %s", NORM_DIR)


if __name__ == "__main__":
    main()
