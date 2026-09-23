"""
pipeline.py — Real-stats data pipeline.

Drives from API football squad files + enriched player stats.
Reads:
  to_process/api_football/raw/squads/{team_id}.json  — squad rosters
  to_process/api_football/enriched/player_stats/{player_id}.json  — stats
Writes per-squad JSON files to src/Data/squads/<league_slug>/<club_slug>.json.

Attributes produced (11 + 2 GK):
  passing, vision, finishing, dribbling, speed, acceleration,
  tackling, pressing, stamina, heading, strength
  (GK only) reflex, jump

Run:
  python data_process/pipeline.py
"""

from __future__ import annotations

import difflib
import json
import random
import re
import shutil
import unicodedata
from pathlib import Path
from typing import Any

# ─── paths ────────────────────────────────────────────────────────────────────

ROOT                 = Path(__file__).resolve().parent.parent
DATA_PROCESS_DIR     = Path(__file__).resolve().parent
CONSTANTS_DIR        = DATA_PROCESS_DIR / "constants"
OUTPUT_SQUADS_DIR    = ROOT / "src" / "Data" / "squads"
OUTPUT_LOGOS_DIR     = ROOT / "src" / "Data" / "logos"
LEAGUE_DATA_PATH     = ROOT / "src" / "Data" / "leagueData.json"
API_TEAMS_DIR        = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw" / "teams"
API_SQUADS_DIR       = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw" / "squads"
ENRICHED_PLAYERS_DIR = DATA_PROCESS_DIR / "to_process" / "api_football" / "enriched" / "player_stats"
LOGOS_SRC_DIR        = DATA_PROCESS_DIR / "to_process" / "squads_logos"
COACHES_PATH         = DATA_PROCESS_DIR / "to_process" / "api_football" / "enriched" / "coaches.json"
PLAYER_POSITIONS_PATH = DATA_PROCESS_DIR / "to_process" / "api_football" / "enriched" / "player_positions.json"

# ─── constants ────────────────────────────────────────────────────────────────

def _load(filename: str) -> Any:
    with open(CONSTANTS_DIR / filename, encoding="utf-8") as f:
        return json.load(f)

LEAGUES         : dict = _load("leagues.json")
DIVISION_BASES  : dict = _load("division_bases.json")
_SQUAD_COLORS_RAW: dict = _load("squad_colors.json")
CBF_RANK        : list = _load("cbf-rank.json")
CBF_NAME_MAP    : dict = _load("cbf_name_map.json")
POSITION_POOLS  : dict = _load("position_pools.json")
SEC_POSITIONS   : dict = _load("secondary_positions.json")
ARCHETYPES      : dict = _load("archetypes.json")
SUMMARIES       : dict = _load("summary_templates.json")
ROLE_WEIGHTS    : dict = _load("role_weights.json")

CBF_RANK_MAP: dict[str, int] = {e["club"]: e["position"] for e in CBF_RANK}

# Accent-insensitive color lookup: _name_key(original key) → colors list
# Built lazily after to_slug/to_name_key is defined; patched in below.
_SQUAD_COLORS_NORM: dict[str, list] = {}

# ─── logo + API team file mappings ────────────────────────────────────────────

LEAGUE_LOGO_DIRS: dict[str, str] = {
    "premier_league":  "english-premier-league-logos.cc",
    "ligue_1":         "france-ligue-1-2025-2026.football-logos.cc",
    "serie_a":         "italy-serie-a-2025-2026.football-logos.cc",
    "la_liga":         "spain-la-liga-2025-2026.football-logos.cc",
    "brazil_serie_a":  "brazil-serie-a-2025-2026.football-logos.cc",
    "brazil_serie_b":  "brazil-serie-b-2025-2026.football-logos.cc",
    "brazil_serie_c":  "brazil-serie-c-2025-2026.cc",
    "bundesliga":      "germany-bundesliga-2025-2026.football-logos.cc",
}

LEAGUE_API_FILES: dict[str, str] = {
    "premier_league": "39_2025.json",
    "bundesliga":     "78_2025.json",
    "ligue_1":        "61_2025.json",
    "serie_a":        "135_2025.json",
    "la_liga":        "140_2025.json",
    "brazil_serie_a": "71_2026.json",
    "brazil_serie_b": "72_2026.json",
    "brazil_serie_c": "75_2026.json",
}

# ─── stat columns (footystats CSV) ────────────────────────────────────────────

STAT_COLS: list[str] = [
    # ── outfield ──────────────────────────────────────────────────────────────
    "passes_completed_per_90_overall",
    "pass_completion_rate_overall",
    "key_passes_per_90_overall",
    "through_passes_per_90_overall",
    "chances_created_per_90_overall",
    "xg_per_90_overall",
    "shot_conversion_rate_overall",
    "shots_on_target_per_90_overall",
    "dribbles_per_90_overall",
    "dribbles_successful_per_90_overall",
    "dribbles_successful_percentage_overall",
    "distance_travelled_per_90_overall",
    "fouls_drawn_per_90_overall",
    "tackles_per_90_overall",
    "tackles_successful_per_90_overall",
    "pressures_per_90_overall",
    "possession_regained_per_90_overall",
    "aerial_duels_won_per_90_overall",
    "aerial_duels_won_percentage_overall",
    "duels_won_per_90_overall",
    "duels_won_percentage_overall",
    "interceptions_per_90_overall",
    "shots_per_90_overall",
    "minutes_played_overall",
    # ── goalkeeper-specific ───────────────────────────────────────────────────
    "saves_per_90_overall",
    "save_percentage_overall",
    "shots_faced_per_90_overall",
    "punches_per_90_overall",
    "xg_faced_per_90_overall",
    "conceded_per_90_overall",
]

ATTRIBUTES: list[str] = [
    "passing", "vision", "finishing", "dribbling",
    "speed", "acceleration", "tackling", "pressing",
    "stamina", "heading", "strength",
]

# Maps API football position → normalization role group
API_POS_TO_ROLE: dict[str, str] = {
    "Goalkeeper": "GK",
    "Defender":   "DEF",
    "Midfielder": "MID",
    "Attacker":   "FWD",
}

# Maps API football position → main group stored in output JSON
API_POS_TO_MAIN: dict[str, str] = {
    "Goalkeeper": "GK",
    "Defender":   "Defender",
    "Midfielder": "Midfielder",
    "Attacker":   "Forward",
}

# ─── helpers ──────────────────────────────────────────────────────────────────

def to_slug(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_text = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_text.lower()).strip("_")


def extract_display_name(full_name: str) -> str:
    """Return the first two words of the full name as the display name."""
    parts = full_name.strip().split()
    return " ".join(parts[:2]) if len(parts) >= 2 else (parts[0] if parts else full_name)


def safe_float(val: str) -> float:
    if not val or val.strip().upper() in ("N/A", ""):
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0


def clamp(val: float, lo: float = 0.0, hi: float = 10.0) -> float:
    return max(lo, min(hi, val))


def _parse_dim(val: object) -> float:
    """Parse a height/weight value (string or number) to float, 0.0 on failure."""
    try:
        return float(re.sub(r"[^\d.]", "", str(val or "")))
    except ValueError:
        return 0.0

# ─── step 2: team strength ────────────────────────────────────────────────────

def team_strength_adjustment(club: str) -> float:
    """
    CBF rank positions 1–8 → strong (+0.8)
    9–16 → average (0.0)
    17+  → weak (−0.6)
    Unknown → average (0.0)
    """
    lookup = CBF_NAME_MAP.get(club, club)
    rank_pos = CBF_RANK_MAP.get(lookup)
    if rank_pos is None:
        return 0.0
    if rank_pos <= 8:
        return 0.8
    if rank_pos <= 16:
        return 0.0
    return -0.6

# ─── step 3: squad status ─────────────────────────────────────────────────────

def squad_status_adjustment(minutes: float) -> float:
    """
    ≥ 2000 min → Key Starter  (+0.9)
    ≥ 1200 min → Starter      (+0.4)
    ≥  500 min → Rotation     ( 0.0)
    >    0 min → Backup       (−0.4)
    """
    if minutes >= 2000:
        return 0.9
    if minutes >= 1200:
        return 0.4
    if minutes >= 500:
        return 0.0
    return -0.4

# ─── step 4: general level ────────────────────────────────────────────────────

def general_level(league_key: str, club: str, minutes: float) -> float:
    div_tier = LEAGUES[league_key]["divisionTier"]
    base     = DIVISION_BASES[div_tier]
    return base + team_strength_adjustment(club) + squad_status_adjustment(minutes)

# ─── step 5: normalization groups ─────────────────────────────────────────────

def build_norm_bounds(players: list[dict]) -> dict[tuple, dict[str, tuple[float, float]]]:
    """
    Returns {(league_key, role_group): {stat_col: (min, max)}}.
    players: list of {league_key, role_group, stats: {col: float}}
    Normalization is done within each (league, role) group.
    """
    accum: dict[tuple, dict[str, list[float]]] = {}
    for p in players:
        key = (p["league_key"], p["role_group"])
        if key not in accum:
            accum[key] = {col: [] for col in STAT_COLS}
        for col in STAT_COLS:
            accum[key][col].append(p["stats"].get(col, 0.0))

    bounds: dict[tuple, dict[str, tuple[float, float]]] = {}
    for key, col_vals in accum.items():
        bounds[key] = {
            col: (min(vals), max(vals))
            for col, vals in col_vals.items()
        }
    return bounds


def normalize_stat(val: float, mn: float, mx: float) -> float:
    if mx <= mn:
        return 0.0
    return clamp((val - mn) / (mx - mn), 0.0, 1.0)

# ─── step 6: compute 12 attribute scores (0–1) ────────────────────────────────

def compute_attributes(n: dict[str, float]) -> dict[str, float]:
    """
    n = dict of normalized stat values (0–1).
    Returns 12 attribute composite scores (0–1).
    """
    return {
        "passing": (
            n["passes_completed_per_90_overall"]       * 0.4 +
            n["pass_completion_rate_overall"]          * 0.3 +
            n["key_passes_per_90_overall"]             * 0.3
        ),
        "vision": (
            n["key_passes_per_90_overall"]             * 0.4 +
            n["through_passes_per_90_overall"]         * 0.3 +
            n["chances_created_per_90_overall"]        * 0.3
        ),
        "finishing": (
            n["xg_per_90_overall"]                     * 0.4 +
            n["shot_conversion_rate_overall"]          * 0.4 +
            n["shots_on_target_per_90_overall"]        * 0.2
        ),
        "dribbling": (
            n["dribbles_per_90_overall"]               * 0.3 +
            n["dribbles_successful_per_90_overall"]    * 0.4 +
            n["dribbles_successful_percentage_overall"] * 0.3
        ),
        "speed": (
            n["distance_travelled_per_90_overall"]     * 0.6 +
            n["dribbles_per_90_overall"]               * 0.4
        ),
        "acceleration": (
            n["dribbles_successful_percentage_overall"] * 0.6 +
            n["fouls_drawn_per_90_overall"]            * 0.4
        ),
        "tackling": (
            n["tackles_per_90_overall"]                * 0.5 +
            n["tackles_successful_per_90_overall"]     * 0.5
        ),
        "pressing": (
            n["pressures_per_90_overall"]              * 0.6 +
            n["possession_regained_per_90_overall"]    * 0.4
        ),
        "stamina": (
            n["distance_travelled_per_90_overall"]     * 0.7 +
            n["minutes_played_overall"]                * 0.3
        ),
        "heading": (
            n["aerial_duels_won_per_90_overall"]       * 0.6 +
            n["aerial_duels_won_percentage_overall"]   * 0.4
        ),
        "strength": (
            n["duels_won_per_90_overall"]              * 0.5 +
            n["duels_won_percentage_overall"]          * 0.5
        ),
    }

# ─── step 6b: GK-specific attribute computation ──────────────────────────────

def compute_gk_attributes(n: dict[str, float]) -> dict[str, float]:
    """
    Returns 14 attributes for a GK player.

    The 12 base attributes are computed as for outfield players, but
    `positioning` is overridden with a GK-specific formula.
    Two new GK-only attributes are added: `reflex` and `jump`.

    All inputs are pre-normalized within (league, "GK") group.
    """
    # Start from the outfield base (shares passing, vision, speed, etc.)
    attrs = compute_attributes(n)

    # ── reflex ────────────────────────────────────────────────────────────────
    # saves_per_90 · 0.4 + save_percentage · 0.4 + shots_faced_per_90 · 0.2
    attrs["reflex"] = (
        n["saves_per_90_overall"]      * 0.4 +
        n["save_percentage_overall"]   * 0.4 +
        n["shots_faced_per_90_overall"] * 0.2
    )

    # ── jump (dive) ───────────────────────────────────────────────────────────
    # aerial_won · 0.5 + aerial_rate · 0.3 + punches · 0.2
    # If punches unavailable (all zeros in group → norm = 0), redistribute 0.2
    # proportionally: aerial_won becomes 0.625, aerial_rate becomes 0.375
    punches_n = n["punches_per_90_overall"]
    if punches_n > 0:
        attrs["jump"] = (
            n["aerial_duels_won_per_90_overall"]      * 0.5 +
            n["aerial_duels_won_percentage_overall"]  * 0.3 +
            punches_n                                  * 0.2
        )
    else:
        attrs["jump"] = (
            n["aerial_duels_won_per_90_overall"]      * 0.625 +
            n["aerial_duels_won_percentage_overall"]  * 0.375
        )

    return attrs


# ─── step 6c: raw API Football fallback for unmatched players ────────────────

# Per-position upper bounds for normalizing raw API Football per-90 stats.
# These represent ~95th-percentile performance — not the absolute maximum,
# but high enough that elite players approach 1.0 without hard-capping them.
_RAW_API_UPPER: dict[str, dict[str, float]] = {
    "FWD": {
        "goals_per_90":     0.80, "assists_per_90":    0.40,
        "shots_per_90":     4.50, "shots_on_per_90":   2.00,
        "key_passes_per_90":1.50, "passes_per_90":    55.0,
        "pass_acc":         0.85,
        "tackles_per_90":   2.00, "interceptions_per_90": 1.50,
        "duels_per_90":    10.0,  "duels_won_pct":     0.60,
        "dribbles_per_90":  4.00, "dribbles_won_pct":  0.65,
    },
    "MID": {
        "goals_per_90":     0.25, "assists_per_90":    0.30,
        "shots_per_90":     2.00, "shots_on_per_90":   1.00,
        "key_passes_per_90":2.00, "passes_per_90":    85.0,
        "pass_acc":         0.88,
        "tackles_per_90":   4.00, "interceptions_per_90": 2.50,
        "duels_per_90":    12.0,  "duels_won_pct":     0.55,
        "dribbles_per_90":  3.00, "dribbles_won_pct":  0.60,
    },
    "DEF": {
        "goals_per_90":     0.10, "assists_per_90":    0.15,
        "shots_per_90":     0.80, "shots_on_per_90":   0.40,
        "key_passes_per_90":0.80, "passes_per_90":    65.0,
        "pass_acc":         0.86,
        "tackles_per_90":   5.00, "interceptions_per_90": 3.00,
        "duels_per_90":    14.0,  "duels_won_pct":     0.60,
        "dribbles_per_90":  1.50, "dribbles_won_pct":  0.55,
    },
    "GK": {
        "saves_per_90":     5.00, "save_pct":          0.75,
        "passes_per_90":   35.0,  "pass_acc":          0.80,
        "duels_per_90":     2.00, "duels_won_pct":     0.55,
        "goals_per_90":     0.0,  "assists_per_90":    0.0,
        "shots_per_90":     0.0,  "shots_on_per_90":   0.0,
        "key_passes_per_90":0.0,  "tackles_per_90":    0.0,
        "interceptions_per_90": 0.0,
        "dribbles_per_90":  0.0,  "dribbles_won_pct":  0.0,
    },
}


def _n(val: float, upper: float) -> float:
    """Normalize raw per-90 stat to 0–1 using position upper bound."""
    if upper <= 0:
        return 0.0
    return clamp(val / upper, 0.0, 1.0)


def extract_api_stats_per90(statistics: list[dict]) -> dict[str, float] | None:
    """
    Aggregate raw API Football statistics entries (may span multiple competitions).
    Returns per-90 rates + raw rates, or None if total minutes < 90.
    """
    mins = goals = assists = shots = shots_on = passes = key_passes = 0.0
    pass_pct_sum = pass_pct_n = 0
    tackles = interceptions = duels = duels_won = dribbles = dribbles_won = 0.0
    saves = saves_faced = 0.0

    for entry in statistics:
        g   = entry.get("games", {}) or {}
        gl  = entry.get("goals", {}) or {}
        sh  = entry.get("shots", {}) or {}
        ps  = entry.get("passes", {}) or {}
        tk  = entry.get("tackles", {}) or {}
        du  = entry.get("duels", {}) or {}
        dr  = entry.get("dribbles", {}) or {}
        sv  = entry.get("goals", {}) or {}     # saves: not in goals; see below
        sv2 = entry.get("goalkeeper", {}) or {}

        m = float(g.get("minutes") or 0)
        if m <= 0:
            continue
        mins += m

        goals       += float(gl.get("total")    or 0)
        assists     += float(gl.get("assists")   or 0)
        shots       += float(sh.get("total")     or 0)
        shots_on    += float(sh.get("on")        or 0)
        passes      += float(ps.get("total")     or 0)
        key_passes  += float(ps.get("key")       or 0)
        tackles     += float(tk.get("total")     or 0)
        interceptions += float(tk.get("interceptions") or 0)
        duels       += float(du.get("total")     or 0)
        duels_won   += float(du.get("won")       or 0)
        dribbles    += float(dr.get("attempts")  or 0)
        dribbles_won += float(dr.get("success")  or 0)
        # GK saves
        saves       += float(sv2.get("saves", {}).get("total") or 0 if isinstance(sv2.get("saves"), dict) else sv2.get("saves") or 0)

        raw_acc = ps.get("accuracy")
        if raw_acc is not None:
            try:
                pass_pct_sum += float(str(raw_acc).replace("%", ""))
                pass_pct_n   += 1
            except (ValueError, TypeError):
                pass

    if mins < 90:
        return None

    p90 = 90.0 / mins

    return {
        "goals_per_90":       goals       * p90,
        "assists_per_90":     assists     * p90,
        "shots_per_90":       shots       * p90,
        "shots_on_per_90":    shots_on    * p90,
        "passes_per_90":      passes      * p90,
        "key_passes_per_90":  key_passes  * p90,
        "pass_acc":           (pass_pct_sum / pass_pct_n / 100.0) if pass_pct_n else 0.0,
        "tackles_per_90":     tackles     * p90,
        "interceptions_per_90": interceptions * p90,
        "duels_per_90":       duels       * p90,
        "duels_won_pct":      (duels_won / duels)    if duels    > 0 else 0.0,
        "dribbles_per_90":    dribbles    * p90,
        "dribbles_won_pct":   (dribbles_won / dribbles) if dribbles > 0 else 0.0,
        "saves_per_90":       saves       * p90,
        "save_pct":           (saves / (saves + float((statistics[0].get("goals", {}) or {}).get("conceded") or 0))) if saves else 0.0,
        "minutes":            mins,
    }


def compute_attributes_from_api_raw(per90: dict, role_group: str) -> dict[str, float]:
    """
    Map per-90 raw API stats to 0–1 attribute scores using position-specific upper bounds.
    role_group: 'FWD' | 'MID' | 'DEF' | 'GK'
    """
    ub = _RAW_API_UPPER.get(role_group, _RAW_API_UPPER["MID"])

    def n(key: str) -> float:
        return _n(per90.get(key, 0.0), ub.get(key, 1.0))

    if role_group == "GK":
        base_attrs = {
            "passing":      n("passes_per_90") * 0.5 + n("pass_acc") * 0.5,
            "vision":       n("passes_per_90") * 0.4 + n("key_passes_per_90") * 0.6,
            "finishing":    0.05,
            "dribbling":    0.10,
            "speed":        0.20,
            "acceleration": 0.20,
            "tackling":     n("duels_per_90") * 0.5 + n("duels_won_pct") * 0.5,
            "pressing":     0.15,
            "stamina":      0.40,
            "heading":      n("duels_per_90") * 0.4 + n("duels_won_pct") * 0.6,
            "strength":     n("duels_won_pct"),
            "reflex":       n("saves_per_90") * 0.6 + n("save_pct") * 0.4,
            "jump":         n("duels_won_pct"),
        }
    else:
        base_attrs = {
            "passing":   n("passes_per_90") * 0.4 + n("pass_acc") * 0.3 + n("key_passes_per_90") * 0.3,
            "vision":    n("key_passes_per_90") * 0.6 + n("assists_per_90") * 0.4,
            "finishing": n("goals_per_90") * 0.4 + n("shots_on_per_90") * 0.3 + n("shots_per_90") * 0.3,
            "dribbling": n("dribbles_per_90") * 0.5 + n("dribbles_won_pct") * 0.5,
            "speed":     n("dribbles_per_90") * 0.5 + n("shots_per_90") * 0.3 + n("dribbles_won_pct") * 0.2,
            "acceleration": n("dribbles_won_pct") * 0.6 + n("dribbles_per_90") * 0.4,
            "tackling":  n("tackles_per_90") * 0.6 + n("interceptions_per_90") * 0.4,
            "pressing":  n("tackles_per_90") * 0.4 + n("interceptions_per_90") * 0.4 + n("duels_per_90") * 0.2,
            "stamina":   n("passes_per_90") * 0.4 + n("duels_per_90") * 0.3 + n("tackles_per_90") * 0.3,
            "heading":   n("duels_per_90") * 0.5 + n("duels_won_pct") * 0.5,
            "strength":  n("duels_per_90") * 0.4 + n("duels_won_pct") * 0.6,
            # reflex/jump excluded — outfield roles don't have these in role_weights;
            # they are set to 1 unconditionally after scale_and_clamp.
        }
    return base_attrs


def get_api_rating(statistics: list[dict]) -> float | None:
    """
    Extract the best available games.rating from API Football statistics entries.
    Weights by minutes to prefer entries with more playing time.
    Returns a float in roughly the 5.0–10.0 range, or None if unavailable.
    """
    total_weight = 0.0
    weighted_sum = 0.0
    for entry in statistics:
        g = entry.get("games", {}) or {}
        rating_raw = g.get("rating")
        mins = float(g.get("minutes") or 0)
        if not rating_raw or mins <= 0:
            continue
        try:
            r = float(rating_raw)
            weighted_sum += r * mins
            total_weight += mins
        except (ValueError, TypeError):
            continue
    if total_weight < 90:
        return None
    return weighted_sum / total_weight


# ─── step 7: scale by general level + role weights + clamp to 0–10 ───────────

# Main group → representative detailed role for stat-weight lookup
_MAIN_GROUP_ROLE: dict[str, str] = {
    "GK":         "GK",
    "Defender":   "CB",
    "Midfielder": "CM",
    "Forward":    "ST",
}


def scale_and_clamp(
    attr_scores: dict[str, float],
    gen_lvl:     float,
    primary_pos: str,
) -> dict[str, int]:
    role_key = _MAIN_GROUP_ROLE.get(primary_pos, primary_pos)
    weights  = ROLE_WEIGHTS.get(role_key, ROLE_WEIGHTS["CM"])
    return {
        attr: round(clamp(gen_lvl * (0.7 + score * 0.6) * weights[attr]))
        for attr, score in attr_scores.items()
    }

# ─── random coach generator ───────────────────────────────────────────────────

_COACH_FIRST_NAMES = [
    "Carlos", "Marco", "João", "Luis", "David", "Michael", "Thomas", "Stefan",
    "Antonio", "José", "Roberto", "Sergio", "Diego", "Pablo", "Bruno", "Ricardo",
    "Fernando", "Rafael", "Alessandro", "Luca", "Fabio", "Manuel", "Hans", "Peter",
    "Chris", "Ryan", "James", "Patrick", "Kevin", "André",
]

_COACH_LAST_NAMES = [
    "Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Carvalho",
    "Ferreira", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Rocha",
    "Martins", "Ribeiro", "Andrade", "Moreira", "Nunes", "Barros",
    "Müller", "Schmidt", "Fischer", "Hoffmann", "Weber", "Klein",
    "García", "López", "Martínez", "Sánchez", "Pérez", "González",
    "Rossi", "Ferrari", "Esposito", "Romano", "Ricci",
    "Smith", "Johnson", "Williams", "Jones", "Brown", "Taylor",
]

_COACH_NATIONALITIES = [
    "Brazilian", "Spanish", "Portuguese", "Italian", "German", "French",
    "Argentine", "English", "Dutch", "Croatian",
]


def generate_random_coach(seed_name: str) -> dict:
    """Return a plausible random coach dict for teams without API data."""
    # Deterministic-ish: use hash of seed_name so the same club always gets the same fake coach.
    rng = random.Random(seed_name)
    first = rng.choice(_COACH_FIRST_NAMES)
    last  = rng.choice(_COACH_LAST_NAMES)
    return {
        "id":          None,
        "name":        f"{first} {last}",
        "firstname":   first,
        "lastname":    last,
        "age":         rng.randint(38, 62),
        "nationality": rng.choice(_COACH_NATIONALITIES),
        "points":      0,
    }


# ─── step 7b–7d: modifier helpers ─────────────────────────────────────────────

# Debuffs are meaningless below this floor — the stat is already weak.
# Buffs are meaningless above this ceiling — the stat is already strong.
DEBUFF_FLOOR = 4.0
BUFF_CEIL    = 8.0


def _bounded_change(value: float, change: float) -> float:
    if change < 0:
        headroom = max(0.0, value - DEBUFF_FLOOR)
        return -min(abs(change), headroom)
    else:
        headroom = max(0.0, BUFF_CEIL - value)
        return min(change, headroom)


# ─── step 7b: age effect ──────────────────────────────────────────────────────

def apply_age_effect(stats: dict[str, int], age: int) -> dict[str, int]:
    """
    Young players (<22): slight stamina penalty (still developing).
    Peak (22–28): no change.
    Decline (>28): speed, acceleration, and stamina drop progressively.

    Effects only apply where they make sense — a player whose speed is
    already 2 or 3 gets no further age penalty on that attribute.
    """
    s = {k: float(v) for k, v in stats.items()}

    if age < 22:
        penalty = (22 - age) * 0.1
        s["stamina"] += _bounded_change(s["stamina"], -penalty)

    elif age <= 28:
        pass  # peak — no change

    else:
        decline = (age - 28) * 0.2
        s["speed"]        += _bounded_change(s["speed"],        -decline)
        s["acceleration"] += _bounded_change(s["acceleration"], -decline)
        s["stamina"]      += _bounded_change(s["stamina"],      -decline * 0.8)

    return {k: round(clamp(v)) for k, v in s.items()}


# ─── step 7c: physical effect (bidirectional) ─────────────────────────────────

AVG_HEIGHT = 178.0
AVG_WEIGHT = 75.0


def apply_physical(stats: dict[str, int], height: float, weight: float) -> dict[str, int]:
    """
    Buff or debuff strength/heading based on how far the player deviates
    from the average physique. Effect is symmetric — above average boosts,
    below average penalises.

    Effects only apply where they make sense — a player whose strength is
    already 2 gets no further penalty for being small; one at 9 gets no
    further boost for being large.
    """
    if not height or not weight:
        return stats

    s = {k: float(v) for k, v in stats.items()}

    height_delta   = (height - AVG_HEIGHT) / 22.0   # ~156–200 cm range
    weight_delta   = (weight - AVG_WEIGHT) / 25.0   # ~50–100 kg range
    physical_score = height_delta * 0.6 + weight_delta * 0.4

    s["strength"] += _bounded_change(s["strength"], physical_score * 1.5)
    s["heading"]  += _bounded_change(s["heading"],  height_delta   * 1.5)

    return {k: round(clamp(v)) for k, v in s.items()}


def apply_physical_caps(stats: dict[str, int], height: float, weight: float) -> dict[str, int]:
    """
    Hard ceiling on strength so a small/light player can never reach 10.
    Prevents e.g. 160 cm / 60 kg player with strength = 10.
    This runs after apply_physical so the cap accounts for any buff already applied.
    """
    if not height or not weight:
        return stats

    s = {k: float(v) for k, v in stats.items()}

    size_score   = ((height - 160.0) / 40.0 + (weight - 60.0) / 40.0) / 2.0
    max_strength = clamp(6.0 + size_score * 4.0)

    s["strength"] = min(s["strength"], max_strength)

    return {k: round(clamp(v)) for k, v in s.items()}


# ─── position / profile helpers ───────────────────────────────────────────────



def _summary_key(pos: str) -> str:
    # Main groups (new)
    if pos == "GK":         return "GK"
    if pos == "Defender":   return "CB"
    if pos == "Midfielder": return "MF"
    if pos == "Forward":    return "FW"
    # Legacy detailed roles (fallback)
    if pos in ("CB",):                     return "CB"
    if pos in ("RB", "LB", "RWB", "LWB"): return "FB"
    if pos in ("CDM", "CM"):               return "MF"
    if pos in ("AM",):                     return "AM"
    if pos in ("LM", "RM", "LW", "RW"):   return "WG"
    return "FW"


def generate_profile(primary_pos: str) -> dict:
    archetype = random.choice(ARCHETYPES.get(primary_pos, ARCHETYPES["CM"]))
    summary   = random.choice(SUMMARIES[_summary_key(primary_pos)])
    return {"summary": summary, "archetype": archetype}


def squad_budget(club: str, league_key: str) -> int:
    # Placeholder — finances are enriched separately by build_finances.py
    return 0

# ─── main ─────────────────────────────────────────────────────────────────────

def _name_key(s: str) -> str:
    """Normalize a name to a match key: ASCII, lowercase, hyphens only."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower()
    # Strip common football club suffixes
    s = re.sub(r"\s+(fc|sc|ec|ac|cf|club|futebol)$", "", s)
    # Strip Brazilian state abbreviations like "-GO", "-PB", "-SC" at end
    s = re.sub(r"-[a-z]{2}$", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


# Build accent-insensitive color lookup now that _name_key is defined.
_SQUAD_COLORS_NORM = {_name_key(k): v for k, v in _SQUAD_COLORS_RAW.items()}


def get_squad_colors(club: str) -> list[str]:
    """Return colors for a club, matching accent-insensitively."""
    key = _name_key(club)
    if key in _SQUAD_COLORS_NORM:
        return _SQUAD_COLORS_NORM[key]
    close = difflib.get_close_matches(key, _SQUAD_COLORS_NORM.keys(), n=1, cutoff=0.75)
    if close:
        return _SQUAD_COLORS_NORM[close[0]]
    return ["#888888", "#FFFFFF"]


def load_api_teams() -> dict[str, dict[str, dict]]:
    """
    Returns {league_slug: {name_key: team_info}} where team_info has:
    id, name, code, country, founded, logo (URL), venue
    """
    result: dict[str, dict[str, dict]] = {}
    for league_slug, fname in LEAGUE_API_FILES.items():
        fpath = API_TEAMS_DIR / fname
        if not fpath.exists():
            continue
        data = json.load(open(fpath, encoding="utf-8"))
        teams: dict[str, dict] = {}
        for item in data.get("response", []):
            t = item["team"]
            v = item.get("venue") or {}
            key = _name_key(t["name"])
            teams[key] = {
                "id":      t["id"],
                "name":    t["name"],
                "code":    t.get("code"),
                "country": t.get("country"),
                "founded": t.get("founded"),
                "logo":    t.get("logo"),
                "venue": {
                    "name":     v.get("name"),
                    "city":     v.get("city"),
                    "capacity": v.get("capacity"),
                    "surface":  v.get("surface"),
                    } if v else None,
            }
        result[league_slug] = teams
    return result


def load_api_squads_for_leagues(
    api_teams_by_league: dict[str, dict[str, dict]],
) -> dict[tuple, dict]:
    """
    Returns {(league_key, team_id): {team_info, team_name, players}}
    Only teams that belong to tracked leagues are included.
    """
    slug_to_key = {cfg["slug"]: key for key, cfg in LEAGUES.items()}

    # Build team_id → (league_key, team_info) from api_teams_by_league
    team_id_map: dict[int, tuple[str, dict]] = {}
    for league_slug, teams in api_teams_by_league.items():
        league_key = slug_to_key.get(league_slug)
        if not league_key:
            continue
        for team_info in teams.values():
            team_id_map[team_info["id"]] = (league_key, team_info)

    result: dict[tuple, dict] = {}
    for squad_file in sorted(API_SQUADS_DIR.glob("*.json")):
        try:
            data = json.load(open(squad_file, encoding="utf-8"))
            squad_list = data.get("response", []) if isinstance(data, dict) else data
            if not squad_list:
                continue
            team_raw = squad_list[0].get("team", {})
            team_id  = team_raw.get("id")
            if team_id not in team_id_map:
                continue
            league_key, team_info = team_id_map[team_id]
            result[(league_key, team_id)] = {
                "team_info": team_info,
                "team_name": team_info["name"],
                "players":   squad_list[0].get("players", []),
            }
        except Exception:
            continue
    return result


def load_enriched_player(player_id: int) -> dict | None:
    """Load enriched/player_stats/{player_id}.json, return None if missing."""
    path = ENRICHED_PLAYERS_DIR / f"{player_id}.json"
    if not path.exists():
        return None
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return None



def load_coaches_by_team_id() -> dict[int, dict]:
    """
    Returns {api_team_id: coach_info} where coach_info has:
    id, name, firstname, lastname, age, nationality, photo, points
    """
    if not COACHES_PATH.exists():
        return {}
    coaches = json.load(open(COACHES_PATH, encoding="utf-8"))
    result: dict[int, dict] = {}
    for c in coaches:
        team = c.get("currentTeam")
        if not team:
            continue
        result[team["id"]] = {
            "id":          c["id"],
            "name":        c["name"],
            "firstname":   c.get("firstname"),
            "lastname":    c.get("lastname"),
            "age":         c.get("age"),
            "nationality": c.get("nationality"),
            "points":      c.get("trophyPoints", 0),
        }
    return result


def load_player_positions() -> dict[int, str]:
    """
    Load enriched/player_positions.json produced by fetch_fixture_lineups.py.
    Returns {api_player_id: primary_specific_position} e.g. {883: "CB"}.
    Falls back to {} if the file doesn't exist yet.
    """
    if not PLAYER_POSITIONS_PATH.exists():
        return {}
    data = json.load(open(PLAYER_POSITIONS_PATH, encoding="utf-8"))
    # Keys are stored as strings in JSON; convert to int for lookup.
    return {int(k): v["primary"] for k, v in data.items() if "primary" in v}


def _build_logo_map() -> dict[str, Path]:
    """Build a combined map of name_key → logo file path from ALL logo directories."""
    logo_map: dict[str, Path] = {}

    def logo_key(p: Path) -> str:
        stem = p.stem
        stem = re.sub(r"\.football-logos\.cc$", "", stem)
        return _name_key(stem)

    # Preferred order: league-specific dirs first (SVG preferred over PNG for same key)
    for dir_name in LEAGUE_LOGO_DIRS.values():
        src_dir = LOGOS_SRC_DIR / dir_name
        if not src_dir.exists():
            continue
        for p in src_dir.iterdir():
            if p.is_file() and p.suffix in (".svg", ".png"):
                key = logo_key(p)
                # SVG takes priority over PNG for the same key
                existing = logo_map.get(key)
                if existing is None or (existing.suffix == ".png" and p.suffix == ".svg"):
                    logo_map[key] = p

    return logo_map


# Built once at module level after LEAGUE_LOGO_DIRS is defined
_LOGO_MAP: dict[str, Path] | None = None


def _find_logo(club: str, league_slug: str, team_id: int) -> str | None:
    """
    Find the local logo file for a club, copy it to src/Data/logos/{league_slug}/,
    naming the output file {slug}.{ext} (e.g. arsenal.svg) so the frontend can
    resolve it directly from the club slug.
    Returns the relative path 'logos/{league_slug}/{slug}.{ext}', or None if not found.
    Accepts both .svg and .png files. Searches all available logo directories.
    """
    global _LOGO_MAP
    if _LOGO_MAP is None:
        _LOGO_MAP = _build_logo_map()

    club_key = _name_key(club)
    if club_key in _LOGO_MAP:
        src = _LOGO_MAP[club_key]
    else:
        close = difflib.get_close_matches(club_key, _LOGO_MAP.keys(), n=1, cutoff=0.55)
        if not close:
            return None
        src = _LOGO_MAP[close[0]]

    out_dir = OUTPUT_LOGOS_DIR / league_slug
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = to_slug(club)
    dest = out_dir / f"{slug}{src.suffix}"
    shutil.copy2(src, dest)
    return f"logos/{league_slug}/{dest.name}"


# Maps _name_key(csv_club_name) → _name_key(api_team_name) for clubs whose
# short name / local name doesn't fuzzy-match the API's full name.
_API_NAME_OVERRIDES: dict[str, str] = {
    "psg":                  "paris-saint-germain",
    "olympique-lyonnais":   "lyon",
    "olympique-marseille":  "marseille",
    "inter-milan":          "inter",
    "ac-milan":             "milan",
    "borussia-m-gladbach":  "m-gladbach",
    "atletico-madrid":      "atletico-madrid",
    "manchester-utd":       "manchester-united",
    "newcastle-utd":        "newcastle-united",
    "nottm-forest":         "nottingham-forest",
    "nott-ham-forest":      "nottingham-forest",
}


def _match_api_team(club: str, api_teams: dict[str, dict]) -> dict | None:
    """Match a CSV club name to the best API team entry."""
    if not api_teams:
        return None
    key = _name_key(club)
    if key in api_teams:
        return api_teams[key]
    # Known short-name / local-name overrides
    override = _API_NAME_OVERRIDES.get(key)
    if override and override in api_teams:
        return api_teams[override]
    close = difflib.get_close_matches(key, api_teams.keys(), n=1, cutoff=0.6)
    return api_teams[close[0]] if close else None


def main() -> None:
    random.seed(42)

    # ── load metadata ──────────────────────────────────────────────────────────
    api_teams_by_league = load_api_teams()
    coaches_by_team_id  = load_coaches_by_team_id()
    player_positions    = load_player_positions()
    print(f"  API teams: {sum(len(v) for v in api_teams_by_league.values())} across {len(api_teams_by_league)} leagues")
    print(f"  Coaches: {len(coaches_by_team_id)}")
    print(f"  Player positions (from lineups): {len(player_positions)}")

    # ── load API squads for tracked leagues ────────────────────────────────────
    squads_by_key = load_api_squads_for_leagues(api_teams_by_league)
    print(f"  Squads loaded: {len(squads_by_key)}")

    if not squads_by_key:
        print("No squads found. Check API squad files.")
        return

    # ── first pass: collect enriched stats for normalization bounds ────────────
    all_player_stats: list[dict] = []
    for (league_key, team_id), squad_data in squads_by_key.items():
        for p_raw in squad_data["players"]:
            enriched = load_enriched_player(p_raw["id"])
            if not enriched:
                continue
            e_stats = enriched.get("enriched", {})
            if not e_stats or not enriched.get("enrichedMeta", {}).get("matched"):
                continue
            api_pos    = p_raw.get("position", "Midfielder")
            role_group = API_POS_TO_ROLE.get(api_pos, "MID")
            all_player_stats.append({
                "league_key": league_key,
                "role_group": role_group,
                "stats":      {col: float(e_stats.get(col) or 0.0) for col in STAT_COLS},
            })

    norm_bounds = build_norm_bounds(all_player_stats)
    print(f"  Norm bounds built from {len(all_player_stats)} matched players")

    # ── clear stale output ─────────────────────────────────────────────────────
    for cfg in LEAGUES.values():
        league_dir = OUTPUT_SQUADS_DIR / cfg["slug"]
        if league_dir.exists():
            shutil.rmtree(league_dir)

    player_counter = 0
    squad_counter  = 0
    league_squads: dict[str, list[dict]] = {}

    # ── second pass: build squads ──────────────────────────────────────────────
    for (league_key, team_id), squad_data in sorted(squads_by_key.items()):
        squad_counter += 1
        league_cfg  = LEAGUES[league_key]
        league_slug = league_cfg["slug"]
        team_info   = squad_data["team_info"]
        club        = squad_data["team_name"]
        club_slug   = to_slug(club)
        squad_id    = str(team_id)

        coach = coaches_by_team_id.get(team_id) or generate_random_coach(club)

        # ── role distribution pre-pass ─────────────────────────────────────────
        # Quota of specific roles to distribute per broad group (across the squad).
        # Counts roles already known from lineup enrichment; builds a "deficit queue"
        # of roles still unassigned for each group so fallback picks fill the gaps.
        _ROLE_QUOTA: dict[str, list[str]] = {
            "Goalkeeper": ["GK"],
            "Defender":   ["CB", "CB", "LB", "RB", "LWB", "RWB"],
            "Midfielder": ["CM", "CDM", "CAM", "LM", "RM", "CM"],
            "Attacker":   ["LW", "ST", "RW", "ST"],
        }
        _SPECIFIC_TO_QUOTA_GROUP: dict[str, str] = {
            "GK":  "Goalkeeper",
            "CB":  "Defender",  "LB": "Defender",  "RB": "Defender",
            "LWB": "Defender",  "RWB": "Defender",
            "CM":  "Midfielder", "CDM": "Midfielder", "CAM": "Midfielder",
            "LM":  "Midfielder", "RM":  "Midfielder", "DM": "Midfielder",
            "LW":  "Attacker",  "ST": "Attacker",  "RW": "Attacker", "CF": "Attacker",
        }
        _API_POS_TO_QUOTA: dict[str, str] = {
            "Goalkeeper": "Goalkeeper",
            "Defender":   "Defender",
            "Midfielder": "Midfielder",
            "Attacker":   "Attacker",
        }
        _QUOTA_FALLBACK: dict[str, str] = {
            "Goalkeeper": "GK", "Defender": "CB",
            "Midfielder": "CM", "Attacker": "ST",
        }

        # Count already-enriched specific roles for this team
        team_known: dict[str, list[str]] = {g: [] for g in _ROLE_QUOTA}
        for p_raw_pre in squad_data["players"]:
            pid = p_raw_pre["id"]
            if pid in player_positions:
                role = player_positions[pid]
                grp  = _SPECIFIC_TO_QUOTA_GROUP.get(role)
                if grp:
                    team_known[grp].append(role)

        # Build deficit queues: quota minus what's already assigned
        _role_queues: dict[str, list[str]] = {}
        for grp, quota in _ROLE_QUOTA.items():
            remaining = list(quota)
            for assigned in team_known[grp]:
                if assigned in remaining:
                    remaining.remove(assigned)
            _role_queues[grp] = remaining

        # ── player loop ────────────────────────────────────────────────────────
        processed: list[dict] = []
        seen_ids: set[int] = set()

        for p_raw in squad_data["players"]:
            player_id = p_raw["id"]
            if player_id in seen_ids:
                continue
            seen_ids.add(player_id)

            player_counter += 1

            # Load enriched data
            enriched_data = load_enriched_player(player_id)
            if enriched_data and enriched_data.get("response"):
                player_bio = enriched_data["response"][0]["player"]
                e_stats    = enriched_data.get("enriched") or {}
                matched    = enriched_data.get("enrichedMeta", {}).get("matched", False)
            else:
                player_bio = {}
                e_stats    = {}
                matched    = False

            # Name: full API name from player stats, fall back to squad roster
            name      = player_bio.get("name") or p_raw["name"]
            firstname = player_bio.get("firstname", "")
            lastname  = player_bio.get("lastname", "")
            full_name = f"{firstname} {lastname}".strip() if firstname else name

            # Age: clamped
            age = int(player_bio.get("age") or p_raw.get("age") or 24)
            age = max(14, min(45, age))

            # Position: use the position that appears most across all statistics
            # entries (match data). Fall back to squad roster when unavailable.
            stats_pos: str | None = None
            if enriched_data and enriched_data.get("response"):
                stats_list = enriched_data["response"][0].get("statistics") or []
                pos_counts: dict[str, int] = {}
                for entry in stats_list:
                    pos = entry.get("games", {}).get("position")
                    if pos:
                        pos_counts[pos] = pos_counts.get(pos, 0) + 1
                if pos_counts:
                    stats_pos = max(pos_counts, key=pos_counts.__getitem__)
            api_pos  = stats_pos or p_raw.get("position", "Midfielder")
            # Main role stored on the player (GK / Defender / Midfielder / Forward)
            position = API_POS_TO_MAIN.get(api_pos, "Midfielder")
            is_gk    = api_pos == "Goalkeeper"

            # Specific role used only for attribute weighting — from lineup data when
            # available, otherwise pop from the per-team deficit queue so the squad
            # fills its positional shape rather than all unmatched players defaulting
            # to the same role (e.g., every unmatched attacker becoming "ST").
            if player_id in player_positions:
                attr_role = player_positions[player_id]
            else:
                quota_key = _API_POS_TO_QUOTA.get(api_pos, "Midfielder")
                queue     = _role_queues.get(quota_key, [])
                attr_role = queue.pop(0) if queue else _QUOTA_FALLBACK.get(quota_key, "CM")

            # Physical
            height = _parse_dim(player_bio.get("height"))
            weight = _parse_dim(player_bio.get("weight"))

            # Raw API Football statistics (available for all players, matched or not)
            raw_stats_list: list[dict] = []
            if enriched_data and enriched_data.get("response"):
                raw_stats_list = enriched_data["response"][0].get("statistics") or []

            # Minutes played for squad_status_adjustment
            minutes = float(e_stats.get("minutes_played_overall", 0.0)) if matched else 500.0

            # For unmatched players, try to get minutes from raw API stats
            if not matched and raw_stats_list:
                raw_mins = sum(float((e.get("games") or {}).get("minutes") or 0) for e in raw_stats_list)
                if raw_mins > 0:
                    minutes = raw_mins

            gen_lvl = general_level(league_key, club, minutes)

            # Normalize stats within (league, role_group)
            role_group = API_POS_TO_ROLE.get(api_pos, "MID")

            if matched:
                # Primary path: footystats-enriched data
                bounds    = norm_bounds.get((league_key, role_group), {})
                stats_raw = {col: float(e_stats.get(col) or 0.0) for col in STAT_COLS}
                norm = {
                    col: normalize_stat(stats_raw[col], *bounds.get(col, (0.0, 1.0)))
                    for col in STAT_COLS
                }
                if is_gk:
                    attr_scores = compute_gk_attributes(norm)
                else:
                    attr_scores = compute_attributes(norm)
            else:
                # Fallback path: raw API Football stats for unmatched players
                api_per90 = extract_api_stats_per90(raw_stats_list) if raw_stats_list else None
                if api_per90:
                    raw_role_group = "GK" if is_gk else role_group
                    attr_scores = compute_attributes_from_api_raw(api_per90, raw_role_group)
                    # Blend gen_lvl with API rating quality when available
                    api_rating = get_api_rating(raw_stats_list)
                    if api_rating:
                        # API rating ~5.0–10.0; normalize to 0..1 quality signal
                        rating_quality = clamp((api_rating - 5.0) / 4.5, 0.0, 1.0)
                        gen_lvl = gen_lvl * 0.5 + (rating_quality * 10.0) * 0.5
                else:
                    # No usable stats at all — flat zero scores
                    zero_norm = {col: 0.0 for col in STAT_COLS}
                    if is_gk:
                        attr_scores = compute_gk_attributes(zero_norm)
                    else:
                        attr_scores = compute_attributes(zero_norm)

            final_stats = scale_and_clamp(attr_scores, gen_lvl, attr_role)

            if not is_gk:
                final_stats["reflex"] = 1
                final_stats["jump"]   = 1

            # Age + physical modifiers
            final_stats = apply_age_effect(final_stats, age)
            final_stats = apply_physical(final_stats, height, weight)
            final_stats = apply_physical_caps(final_stats, height, weight)

            processed.append({
                "id":            f"player_{player_counter:04d}",
                "name":          name,
                "fullName":      full_name,
                "age":           age,
                "squadId":       squad_id,
                "preferredFoot": random.choices(["right", "left"], weights=[80, 20])[0],
                "positions":     [position],
                "stats":         final_stats,
                "profile":       generate_profile(attr_role),
            })

        colors = get_squad_colors(club)

        # Logo: prefer local file, fall back to API URL
        logo = _find_logo(club, league_slug, team_id)
        if logo is None:
            logo = team_info.get("logo")

        squad_obj = {
            "id":      squad_id,
            "slug":    club_slug,
            "name":    club,
            "colors":  colors,
            "logo":    logo,
            "money":   squad_budget(club, league_key),
            "apiId":   team_id,
            "code":    team_info.get("code"),
            "country": team_info.get("country"),
            "founded": team_info.get("founded"),
            "venue":   team_info.get("venue"),
            "coach":   coach,
            "players": processed,
        }

        out_dir = OUTPUT_SQUADS_DIR / league_slug
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{team_id}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(squad_obj, f, indent=2, ensure_ascii=False)

        league_squads.setdefault(league_key, []).append(squad_obj)
        logo_status  = "🖼" if logo else "·"
        coach_status = "👔" if coach else "·"
        print(f"  ✓ {league_slug}/{team_id}.json  ({len(processed)} players) [{club_slug}] {logo_status} {coach_status}")

    # ── update leagueData.json (append new leagues, don't overwrite existing) ──
    existing: list[dict] = []
    if LEAGUE_DATA_PATH.exists():
        with open(LEAGUE_DATA_PATH, encoding="utf-8") as f:
            existing = json.load(f)

    existing_slugs = {entry["slug"] for entry in existing}
    for league_key, clubs in league_squads.items():
        cfg = LEAGUES[league_key]
        slug = cfg["slug"]
        standings = [
            {
                "squadId": c["id"],
                "slug":    c["slug"],
                "name":    c["name"],
                "colors":  c["colors"],
                "logo":    c.get("logo"),
                "country": c.get("country"),
            }
            for c in clubs
        ]
        if slug in existing_slugs:
            # update standings in-place
            for entry in existing:
                if entry["slug"] == slug:
                    entry["standings"] = standings
                    break
        else:
            existing.append({
                "slug":      slug,
                "name":      cfg["name"],
                "country":   cfg["country"],
                "season":    "2025-26",
                "standings": standings,
            })

    with open(LEAGUE_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ leagueData.json updated ({len(existing)} leagues)")
    print(f"\nDone — {player_counter} players total.")

    # ── enrich squads with financial data ──────────────────────────────────────
    print("\n── build_finances ────────────────────────────────────────────────────────")
    import build_finances
    build_finances.main()


if __name__ == "__main__":
    main()
