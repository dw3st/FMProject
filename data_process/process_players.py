"""
Process top5-players.csv into per-squad JSON files organised by league,
plus a consolidated leagueData.json with standings.

Output structure:
  src/Data/squads/<league_slug>/<squad_slug>.json
  src/Data/leagueData.json

Each squad JSON:
  { id, name, colors, money, players: [RosterPlayer, …] }

Player stats are randomly generated on a 1-10 scale using position-aware
distributions so that, e.g., a CB gets high tackling but low finishing.
"""

import csv
import json
import random
import re
import shutil
import unicodedata
from pathlib import Path

from constants_loader import (
    ARCHETYPES,
    BIG_CLUBS,
    BUDGET_TIERS,
    LEAGUES,
    LEAGUE_LOGO_DIRS,
    LOGO_NAME_OVERRIDES,
    POSITION_POOLS,
    SECONDARY_POSITIONS,
    SQUAD_COLORS,
    STAT_PROFILES,
    SUMMARY_TEMPLATES,
)

# ─── paths ───────────────────────────────────────────────────────────────────
CSV_PATH = Path(__file__).parent / "ToProcess" / "top5-players.csv"
OUTPUT_DIR = Path(__file__).parent / "squads"
LEAGUE_DATA_PATH = Path(__file__).parent / "leagueData.json"
LOGOS_DIR = Path(__file__).parent / "ToProcess" / "squads_logos"


def pick_primary_position(csv_pos: str) -> str:
    key = csv_pos.strip()
    pool = POSITION_POOLS.get(key, POSITION_POOLS.get("MF"))
    return random.choice(pool)


def pick_positions(primary: str) -> list[str]:
    extras = SECONDARY_POSITIONS.get(primary, [])
    if not extras:
        return [primary]
    secondary = random.choice(extras)
    return [primary, secondary]


# ─── stat generation (position-aware, 1-10 scale) ────────────────────────────

StatRange = tuple[int, int]
StatProfile = dict[str, StatRange]


def generate_stats(primary_pos: str) -> dict[str, int]:
    profile: StatProfile = STAT_PROFILES.get(primary_pos, STAT_PROFILES["CM"])
    stats: dict[str, int] = {}
    for attr, (lo, hi) in profile.items():
        val = random.randint(lo, hi)
        stats[attr] = max(1, min(10, val))
    return stats


# ─── profile generation ──────────────────────────────────────────────────────


def _trait_pool_key(pos: str) -> str:
    if pos == "GK":
        return "GK"
    if pos in ("CB",):
        return "CB"
    if pos in ("RB", "LB", "RWB", "LWB"):
        return "FB"
    if pos in ("CDM", "CM"):
        return "MF"
    if pos in ("AM",):
        return "AM"
    if pos in ("LM", "RM", "LW", "RW"):
        return "WG"
    return "FW"


def generate_profile(primary_pos: str) -> dict:
    archetype = random.choice(ARCHETYPES.get(primary_pos, ARCHETYPES["CM"]))
    pool_key = _trait_pool_key(primary_pos)
    summary = random.choice(SUMMARY_TEMPLATES[pool_key])
    return {"summary": summary, "archetype": archetype}


# ─── helpers ──────────────────────────────────────────────────────────────────

def to_slug(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_text = nfkd.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_text.lower()).strip("_")
    return slug


def extract_last_name(full_name: str) -> str:
    parts = full_name.strip().split()
    return parts[-1] if parts else full_name


def squad_budget(club: str, league: str) -> int:
    lo, hi = BUDGET_TIERS.get(league, (30, 150))
    if club in BIG_CLUBS:
        budget = random.randint(int(hi * 0.6), hi)
    else:
        budget = random.randint(lo, int(hi * 0.6))
    return budget * 1_000_000


# ─── logo resolution ─────────────────────────────────────────────────────────

def _logo_stem(club: str) -> str:
    """Convert a club name to the hyphenated stem used in logo filenames."""
    if club in LOGO_NAME_OVERRIDES:
        return LOGO_NAME_OVERRIDES[club]
    nfkd = unicodedata.normalize("NFKD", club)
    ascii_text = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def find_logo(club: str, league_slug: str) -> Path | None:
    """Return the SVG source path for *club* in *league_slug*, or None."""
    logo_dir_names = LEAGUE_LOGO_DIRS.get(league_slug)
    if not logo_dir_names:
        return None
    stem = _logo_stem(club)
    for logo_dir_name in logo_dir_names:
        logo_dir = LOGOS_DIR / logo_dir_name
        for svg_file in logo_dir.glob("*.svg"):
            if svg_file.name.startswith(stem + "."):
                return svg_file
    return None


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    random.seed(42)

    # 1. Read CSV and group by (league, club)
    squads_raw: dict[tuple[str, str], list[dict]] = {}
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            comp = row["Comp"]
            squad_name = row["Squad"]
            if comp not in LEAGUES:
                continue
            key = (comp, squad_name)
            squads_raw.setdefault(key, []).append(row)

    total_squads = 0
    total_players = 0
    player_counter = 0  # globally unique across all leagues

    # Collect metadata per league for leagueData.json
    league_squads: dict[str, list[dict]] = {}

    for (league, club), rows in sorted(squads_raw.items()):
        league_cfg = LEAGUES[league]
        league_slug = league_cfg["slug"]
        club_slug = to_slug(club)
        squad_id = f"{league_slug}_{club_slug}"

        # De-duplicate players
        seen: dict[str, dict] = {}
        for row in rows:
            name = row["Player"]
            mins = float(row["Min"] or 0)
            if name not in seen or float(seen[name]["Min"] or 0) < mins:
                seen[name] = row
        unique_rows = list(seen.values())

        players: list[dict] = []
        for row in unique_rows:
            player_counter += 1
            csv_pos = row["Pos"]
            primary = pick_primary_position(csv_pos)
            positions = pick_positions(primary)
            age_str = row.get("Age", "") or ""
            if not age_str:
                age = 2024 - int(row.get("Born", "2000") or "2000")
            elif "-" in age_str:
                age = int(age_str.split("-")[0])
            else:
                age = int(float(age_str))

            player = {
                "id": f"player_{player_counter:04d}",
                "name": extract_last_name(row["Player"]),
                "age": age,
                "squadId": squad_id,
                "preferredFoot": random.choices(["right", "left"], weights=[80, 20])[0],
                "positions": positions,
                "stats": generate_stats(primary),
                "profile": generate_profile(primary),
            }
            players.append(player)

        colors = SQUAD_COLORS.get(club, ["#888888", "#FFFFFF"])

        out_dir = OUTPUT_DIR / league_slug
        out_dir.mkdir(parents=True, exist_ok=True)

        # Resolve and copy logo
        logo_field: str | None = None
        logo_src = find_logo(club, league_slug)
        if logo_src:
            logo_dest = out_dir / f"{club_slug}.svg"
            shutil.copy2(logo_src, logo_dest)
            logo_field = f"squads/{league_slug}/{club_slug}.svg"

        squad_obj = {
            "id": squad_id,
            "name": club,
            "colors": colors,
            "logo": logo_field,
            "money": squad_budget(club, league),
            "players": players,
        }

        out_path = out_dir / f"{club_slug}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(squad_obj, f, indent=2, ensure_ascii=False)

        league_squads.setdefault(league, []).append(squad_obj)

        total_squads += 1
        total_players += len(players)
        logo_tag = " 🖼" if logo_field else ""
        print(f"  ✓ {league_slug}/{club_slug}.json  ({len(players)} players){logo_tag}")

    # 2. Generate leagueData.json — team metadata only, no standings stats
    league_data: list[dict] = []
    for league_key, cfg in LEAGUES.items():
        clubs = league_squads.get(league_key, [])
        standings = [
            {"squadId": c["id"], "name": c["name"], "colors": c["colors"], "logo": c.get("logo")}
            for c in clubs
        ]
        league_data.append({
            "slug": cfg["slug"],
            "name": cfg["name"],
            "country": cfg["country"],
            "season": "2025-26",
            "standings": standings,
        })

    with open(LEAGUE_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(league_data, f, indent=2, ensure_ascii=False)
    print(f"\n  ✓ leagueData.json  ({len(league_data)} leagues)")

    print(f"\nDone — {total_squads} squads, {total_players} players total.")


if __name__ == "__main__":
    main()
