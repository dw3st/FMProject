"""Load JSON constants for process_players."""

from __future__ import annotations

import json
from pathlib import Path

_CONSTANTS_DIR = Path(__file__).resolve().parent / "constants"


def _load_json(filename: str) -> object:
    with open(_CONSTANTS_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


def _budget_tiers() -> dict[str, tuple[int, int]]:
    raw = _load_json("budget_tiers.json")
    assert isinstance(raw, dict)
    return {k: (int(v[0]), int(v[1])) for k, v in raw.items()}


def _stat_profiles() -> dict[str, dict[str, tuple[int, int]]]:
    raw = _load_json("stat_profiles.json")
    assert isinstance(raw, dict)
    return {
        pos: {attr: (int(pair[0]), int(pair[1])) for attr, pair in prof.items()}
        for pos, prof in raw.items()
    }


LEAGUES: dict[str, dict] = _load_json("leagues.json")  # type: ignore[assignment]
LEAGUE_LOGO_DIRS: dict[str, list[str]] = _load_json("league_logo_dirs.json")  # type: ignore[assignment]
LOGO_NAME_OVERRIDES: dict[str, str] = _load_json("logo_name_overrides.json")  # type: ignore[assignment]
SQUAD_COLORS: dict[str, list[str]] = _load_json("squad_colors.json")  # type: ignore[assignment]
BUDGET_TIERS: dict[str, tuple[int, int]] = _budget_tiers()
BIG_CLUBS: set[str] = set(_load_json("big_clubs.json"))  # type: ignore[arg-type]
POSITION_POOLS: dict[str, list[str]] = _load_json("position_pools.json")  # type: ignore[assignment]
SECONDARY_POSITIONS: dict[str, list[str]] = _load_json("secondary_positions.json")  # type: ignore[assignment]
STAT_PROFILES: dict[str, dict[str, tuple[int, int]]] = _stat_profiles()
ARCHETYPES: dict[str, list[str]] = _load_json("archetypes.json")  # type: ignore[assignment]
SUMMARY_TEMPLATES: dict[str, list[str]] = _load_json("summary_templates.json")  # type: ignore[assignment]
