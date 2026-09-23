"""
Compare squad player IDs to raw/player_stats/{id}_{season}.json files.

Run:
  python data_process/check_player_stats_coverage.py
  python data_process/check_player_stats_coverage.py --season 2026
  python data_process/check_player_stats_coverage.py --list-missing
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

DATA_PROCESS_DIR = Path(__file__).resolve().parent
RAW_DIR = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw"


def _valid_player_id(raw: object) -> int | None:
    if raw is None:
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return n


def _json_has_api_errors(data: dict) -> bool:
    err = data.get("errors")
    if not err:
        return False
    if isinstance(err, dict) and len(err) == 0:
        return False
    if isinstance(err, list) and len(err) == 0:
        return False
    return True


def player_ids_from_squads() -> set[int]:
    ids: set[int] = set()
    squads_dir = RAW_DIR / "squads"
    if not squads_dir.exists():
        return ids
    for squad_path in squads_dir.glob("*.json"):
        if not squad_path.stem.isdigit():
            continue
        with open(squad_path, encoding="utf-8") as f:
            data = json.load(f)
        if _json_has_api_errors(data):
            continue
        for block in data.get("response", []):
            for pl in block.get("players", []):
                vid = _valid_player_id(pl.get("id"))
                if vid is not None:
                    ids.add(vid)
    return ids


def main() -> None:
    p = argparse.ArgumentParser(description="Check player_stats coverage vs squads.")
    p.add_argument(
        "--season",
        type=int,
        default=2025,
        help="Season suffix on player_stats files (default: 2025)",
    )
    p.add_argument(
        "--list-missing",
        action="store_true",
        help="Print every missing player id",
    )
    p.add_argument(
        "--check-errors",
        action="store_true",
        help="Flag existing files that still have API errors in JSON",
    )
    args = p.parse_args()

    season = args.season
    stats_dir = RAW_DIR / "player_stats"

    expected = player_ids_from_squads()
    n_exp = len(expected)
    print(f"RAW_DIR: {RAW_DIR}")
    print(f"Season:  {season}")
    print(f"Unique player ids from squads (valid): {n_exp}")

    missing: list[int] = []
    error_files: list[int] = []

    for pid in sorted(expected):
        path = stats_dir / f"{pid}_{season}.json"
        if not path.exists():
            missing.append(pid)
            continue
        if args.check_errors:
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                if _json_has_api_errors(data):
                    error_files.append(pid)
            except (json.JSONDecodeError, OSError):
                error_files.append(pid)

    have = n_exp - len(missing)
    print(f"player_stats/{season}: files present: {have} / {n_exp}")

    if missing:
        print(f"MISSING ({len(missing)}): no file {stats_dir.name}/<id>_{season}.json")
        if args.list_missing:
            for pid in missing:
                print(f"  {pid}")
        else:
            preview = missing[:30]
            print(f"  (first {len(preview)}): {preview}")
            if len(missing) > 30:
                print(f"  ... and {len(missing) - 30} more (use --list-missing)")
    else:
        print("OK — every squad player has a stats file for this season.")

    if args.check_errors:
        if error_files:
            print(f"FILES WITH API ERRORS ({len(error_files)}): {error_files[:40]}")
            if len(error_files) > 40:
                print(f"  ... and {len(error_files) - 40} more")
        else:
            print("No error payloads in scanned player_stats files.")


if __name__ == "__main__":
    main()
