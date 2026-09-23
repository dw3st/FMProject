"""
enrich_player_positions.py — Infer specific positions from raw lineup files.

Reads from:
  data_process/to_process/api_football/raw/lineups/{fixture_id}.json

Writes to:
  data_process/to_process/api_football/enriched/player_positions.json

For each player seen across all cached lineup files, counts how often they
played each specific position (CB, LB, CDM, CAM, LW, ST…) and records
the most-used one as their primary position.

Run:
  python data_process/enrich_player_positions.py
"""

from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from pathlib import Path

# ─── logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── paths ────────────────────────────────────────────────────────────────────

DATA_PROCESS_DIR = Path(__file__).resolve().parent
LINEUPS_DIR      = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw" / "lineups"
OUT_PATH         = DATA_PROCESS_DIR / "to_process" / "api_football" / "enriched" / "player_positions.json"

# ─── position inference ───────────────────────────────────────────────────────

def infer_specific_position(pos: str, grid: str | None, formation: str | None) -> str:
    """
    Map API-Football broad category + grid + formation string to a specific role.

    pos:       "G" | "D" | "M" | "F"
    grid:      "line:col"  e.g. "2:3"   (line 1 = GK row)
    formation: "4-3-3" | "4-2-3-1" | "3-5-2" …

    Returns one of: GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, ST
    """
    if pos == "G":
        return "GK"

    _fallback: dict[str, str] = {"D": "CB", "M": "CM", "F": "ST"}

    if not grid or ":" not in grid or not formation:
        return _fallback.get(pos, "CM")

    try:
        line, col = map(int, grid.split(":"))
        parts     = [int(x) for x in formation.split("-")]
    except (ValueError, AttributeError):
        return _fallback.get(pos, "CM")

    # line 1 is the GK row; parts[0] = first outfield line (defenders in most formations)
    line_idx = line - 2   # 0-indexed into parts
    if line_idx < 0 or line_idx >= len(parts):
        return _fallback.get(pos, "CM")

    count        = parts[line_idx]
    is_last_line = line_idx == len(parts) - 1

    # True when this M line sits above a small (≤2) striker line —
    # i.e. it is the attacking-mid/winger row in 4-2-3-1, 4-1-4-1 style formations.
    is_attacking_mid_line = (
        not is_last_line and
        count in (2, 3, 4) and
        parts[-1] <= 2
    )

    # ── Defenders ──────────────────────────────────────────────────────────────
    if pos == "D":
        if count == 3:
            return "CB"
        if count == 4:
            if col == 1: return "LB"
            if col == 4: return "RB"
            return "CB"
        if count == 5:
            if col == 1: return "LWB"
            if col == 5: return "RWB"
            return "CB"
        return "CB"

    # ── Midfielders ────────────────────────────────────────────────────────────
    if pos == "M":
        if is_last_line:
            return "CAM"

        if count == 1:
            return "CDM"
        if count == 2:
            return "CDM"
        if count == 3:
            if is_attacking_mid_line:
                if col == 2: return "CAM"
                return "LW" if col == 1 else "RW"
            else:
                if col == 2: return "CM"
                return "LM" if col == 1 else "RM"
        if count == 4:
            if is_attacking_mid_line:
                if col in (2, 3): return "CAM"
                return "LW" if col == 1 else "RW"
            else:
                if col in (2, 3): return "CM"
                return "LM" if col == 1 else "RM"
        return "CM"

    # ── Forwards ───────────────────────────────────────────────────────────────
    if pos == "F":
        if count == 1:
            return "ST"
        if count == 2:
            return "ST"
        if count == 3:
            if col == 2: return "ST"
            return "LW" if col == 1 else "RW"
        return "ST"

    return "CM"

# ─── aggregation ──────────────────────────────────────────────────────────────

def aggregate(lineups_dir: Path) -> dict[int, dict]:
    """
    Scan every cached lineup file, count specific positions per player.

    Returns:
      {
        player_id: {
          "counts":  {"CB": 7, "LB": 2},
          "primary": "CB"
        }
      }
    """
    files = sorted(lineups_dir.glob("*.json"))
    if not files:
        log.warning("No lineup files found in %s", lineups_dir)
        return {}

    pos_counts: dict[int, Counter] = defaultdict(Counter)
    fixtures_read = 0

    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            log.warning("  Could not read %s: %s", path.name, exc)
            continue

        response = data.get("response", [])
        if not response:
            continue

        fixtures_read += 1
        for team_entry in response:
            formation = team_entry.get("formation") or ""
            for slot in team_entry.get("startXI", []):
                player = slot.get("player", {})
                pid    = player.get("id")
                broad  = player.get("pos", "")
                grid   = player.get("grid")
                if not pid or not broad:
                    continue
                specific = infer_specific_position(broad, grid, formation)
                pos_counts[pid][specific] += 1

    log.info("  Read %d lineup files, found %d players", fixtures_read, len(pos_counts))

    result: dict[int, dict] = {}
    for pid, counts in pos_counts.items():
        primary = counts.most_common(1)[0][0]
        result[pid] = {
            "counts":  dict(counts),
            "primary": primary,
        }
    return result

# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    if not LINEUPS_DIR.exists():
        log.error(
            "raw/lineups/ directory not found at %s\n"
            "Run fetch_fixture_lineups.py first.",
            LINEUPS_DIR,
        )
        return

    log.info("=== Enrich player positions ===")
    log.info("  Reading from %s", LINEUPS_DIR)

    positions = aggregate(LINEUPS_DIR)

    if not positions:
        log.error("No position data produced — check lineup files.")
        return

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(positions, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log.info("  Wrote %d player records → %s", len(positions), OUT_PATH)

    # Distribution summary
    primary_dist: Counter = Counter()
    for rec in positions.values():
        primary_dist[rec["primary"]] += 1
    log.info(
        "  Primary position distribution:\n    %s",
        "\n    ".join(
            f"{pos:4}: {count:5d}"
            for pos, count in sorted(primary_dist.items(), key=lambda x: -x[1])
        ),
    )


if __name__ == "__main__":
    main()
