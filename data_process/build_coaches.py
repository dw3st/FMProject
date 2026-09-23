"""
build_coaches.py — Build an enriched coaches list from API-Football raw data.

Reads from:
  raw/coaches/*.json                        — coach identity + career history
  raw/trophies/*.json                       — coach trophies (keyed by coach id)
  trophy_classifications.json              — tier/point table from classify_trophies.py

Outputs:
  enriched/coaches.json

Each coach entry contains:
  - identity  (id, name, nationality, age, photo)
  - currentTeam  (team the coach is at right now, or null if unattached)
  - career  (full list of clubs with start/end dates)
  - trophies  (raw list)
  - trophyPoints  (total weighted score)
  - trophyBreakdown  (points per trophy, for transparency)

Current team resolution
-----------------------
  1. Career entries with end == null → currently active there.
  2. If none have null end, pick the entry with the most recent end date.

Run (classify_trophies.py must have run first):
  python data_process/build_coaches.py
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

# ─── paths ────────────────────────────────────────────────────────────────────

DATA_PROCESS_DIR   = Path(__file__).resolve().parent
API_DIR            = DATA_PROCESS_DIR / "to_process" / "api_football"
COACHES_DIR        = API_DIR / "raw" / "coaches"
TROPHIES_DIR       = API_DIR / "raw" / "trophies"
CLASSIFICATIONS    = API_DIR / "trophy_classifications.json"
OUT_PATH           = API_DIR / "enriched" / "coaches.json"

# ─── helpers ──────────────────────────────────────────────────────────────────

def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def _coaching_start_year(career: list[dict]) -> int | None:
    """
    Return the earliest year the person started coaching (from their career entries).
    Returns None if no career data is available.
    """
    years: list[int] = []
    for entry in career:
        d = _parse_date(entry.get("start"))
        if d:
            years.append(d.year)
    return min(years) if years else None


def _trophy_season_year(season: str) -> int | None:
    """
    Extract the calendar year from a trophy season string.
    Examples: "2024/2025" → 2024, "2010 South Africa" → 2010, "2022/2023" → 2022
    """
    m = re.search(r"(\d{4})", season or "")
    return int(m.group(1)) if m else None


def _trophy_key(league: str, country: str) -> str:
    return f"{league} ({country})"


# ─── load trophy classifications ──────────────────────────────────────────────

def load_classifications(path: Path) -> dict[str, dict]:
    """Return the points table: { "<league> (<country>)": {tier, winner_points, runner_up_points} }"""
    if not path.exists():
        raise FileNotFoundError(
            f"Trophy classifications not found at {path}.\n"
            "Run classify_trophies.py first."
        )
    data = json.load(open(path, encoding="utf-8"))
    return data["points"]


# ─── load trophies index ───────────────────────────────────────────────────────

def load_trophies_index(trophies_dir: Path) -> dict[int, list[dict]]:
    """
    Return { coach_id: [trophy, ...] }.
    Trophy files are named like "1-11.json", "12-45.json" — each can contain
    multiple coach responses batched together, or a single coach keyed by
    parameters.coach.
    """
    index: dict[int, list[dict]] = {}
    for f in sorted(trophies_dir.glob("*.json")):
        data = json.load(open(f, encoding="utf-8"))
        coach_id_str = data.get("parameters", {}).get("coach")
        if coach_id_str is None:
            continue
        try:
            coach_id = int(coach_id_str)
        except (ValueError, TypeError):
            continue
        trophies = data.get("response", [])
        if trophies:
            index[coach_id] = trophies
    return index


# ─── resolve current team ─────────────────────────────────────────────────────

def resolve_current_team(career: list[dict]) -> dict | None:
    """
    Return the team dict for the coach's current club.

    Priority:
      1. Any entry where end is null (still there).
      2. The entry with the most recent end date.
    """
    if not career:
        return None

    # Check for open-ended entry
    for entry in career:
        if not entry.get("end"):
            return entry.get("team")

    # Fall back to most recent end date
    def _end_key(e: dict) -> date:
        d = _parse_date(e.get("end"))
        return d if d else date.min

    most_recent = max(career, key=_end_key)
    # Only return if they left recently (within 2 years) — otherwise treat as unattached
    end_date = _parse_date(most_recent.get("end"))
    if end_date and (date.today() - end_date).days <= 730:
        return most_recent.get("team")

    return None


# ─── compute trophy score ─────────────────────────────────────────────────────

PLACE_TO_FIELD = {
    "Winner":    "winner_points",
    "2nd Place": "runner_up_points",
}

DEFAULT_TIER1_WINNER    = 1.0
DEFAULT_TIER1_RUNNER_UP = 0.4


def compute_trophy_score(
    trophies: list[dict],
    classifications: dict[str, dict],
    coaching_start_year: int | None = None,
) -> tuple[float, list[dict]]:
    """
    Return (total_points, breakdown).
    breakdown is a list of dicts with league/country/place/points/tier per trophy.

    If coaching_start_year is provided, trophies from seasons before that year
    are skipped (they belong to the person's playing career, not coaching).
    """
    total      = 0.0
    breakdown  = []

    for t in trophies:
        league  = t.get("league", "")
        country = t.get("country", "")
        place   = t.get("place", "")
        season  = t.get("season", "")

        # Skip player-career trophies
        if coaching_start_year is not None:
            trophy_year = _trophy_season_year(season)
            if trophy_year is not None and trophy_year < coaching_start_year:
                continue

        key        = _trophy_key(league, country)
        cls        = classifications.get(key)
        field      = PLACE_TO_FIELD.get(place)

        if cls and field:
            pts  = cls[field]
            tier = cls["tier"]
        else:
            # Unknown league → tier 1 defaults
            tier = 1
            pts  = DEFAULT_TIER1_WINNER if place == "Winner" else DEFAULT_TIER1_RUNNER_UP

        total += pts
        breakdown.append({
            "league":  league,
            "country": country,
            "season":  season,
            "place":   place,
            "tier":    tier,
            "points":  pts,
        })

    # Sort breakdown by points desc for readability
    breakdown.sort(key=lambda x: -x["points"])
    return round(total, 2), breakdown


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    classifications = load_classifications(CLASSIFICATIONS)
    trophies_index  = load_trophies_index(TROPHIES_DIR)

    coaches: list[dict] = []
    seen_ids: set[int] = set()

    for f in sorted(COACHES_DIR.glob("*.json")):
        data = json.load(open(f, encoding="utf-8"))
        for coach in data.get("response", []):
            cid = coach.get("id")
            if cid is None or cid in seen_ids:
                continue
            seen_ids.add(cid)

            career       = coach.get("career", [])
            current_team = resolve_current_team(career)
            raw_trophies = trophies_index.get(cid, [])
            coaching_start = _coaching_start_year(career)
            trophy_pts, breakdown = compute_trophy_score(
                raw_trophies, classifications, coaching_start_year=coaching_start
            )

            coaches.append({
                "id":          cid,
                "name":        coach.get("name", ""),
                "firstname":   coach.get("firstname", ""),
                "lastname":    coach.get("lastname", ""),
                "age":         coach.get("age"),
                "nationality": coach.get("nationality", ""),
                "photo":       coach.get("photo", ""),
                "currentTeam": current_team,
                "career":      career,
                "trophies":    raw_trophies,
                "trophyPoints":    trophy_pts,
                "trophyBreakdown": breakdown,
            })

    # Sort by trophy points descending
    coaches.sort(key=lambda c: -c["trophyPoints"])

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(coaches, fh, indent=2, ensure_ascii=False)

    # Summary
    with_team    = sum(1 for c in coaches if c["currentTeam"])
    without_team = sum(1 for c in coaches if not c["currentTeam"])
    print(f"Total coaches:      {len(coaches)}")
    print(f"With current team:  {with_team}")
    print(f"Without team:       {without_team}")
    print(f"\nTop 10 by trophy points:")
    for c in coaches[:10]:
        team = c["currentTeam"]["name"] if c["currentTeam"] else "unattached"
        print(f"  {c['trophyPoints']:>6.1f} pts  {c['name']} ({c['nationality']})  — {team}")
    print(f"\nSaved → {OUT_PATH}")


if __name__ == "__main__":
    main()
