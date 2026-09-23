"""
Summarize all API-Football raw JSON under to_process/api_football/raw/.

Covers: leagues, teams, squads, coaches, trophies, transfers, player_stats.

Run from repo root or data_process:
  python data_process/count_api_football_raw.py
"""

from __future__ import annotations

import json
from pathlib import Path

DATA_PROCESS_DIR = Path(__file__).resolve().parent
RAW_DIR = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw"


def load(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def has_api_errors(data: dict) -> bool:
    err = data.get("errors")
    if not err:
        return False
    if isinstance(err, dict) and len(err) == 0:
        return False
    if isinstance(err, list) and len(err) == 0:
        return False
    return True


def section_header(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def main() -> None:
    print(f"Raw directory: {RAW_DIR}")
    if not RAW_DIR.exists():
        print("  (directory does not exist)")
        return

    # ─── leagues ─────────────────────────────────────────────────────────────
    leagues_dir = RAW_DIR / "leagues"
    league_files = sorted(leagues_dir.glob("*.json")) if leagues_dir.exists() else []
    league_err = 0
    for p in league_files:
        d = load(p)
        if has_api_errors(d):
            league_err += 1
    section_header("Leagues (raw/leagues/*.json)")
    print(f"  JSON files:        {len(league_files)}")
    print(f"  Files with errors: {league_err}")

    # ─── teams ─────────────────────────────────────────────────────────────────
    teams_dir = RAW_DIR / "teams"
    team_ids: set[int] = set()
    team_rows = 0
    team_files = sorted(teams_dir.glob("*.json")) if teams_dir.exists() else []
    team_err = 0
    for path in team_files:
        data = load(path)
        if has_api_errors(data):
            team_err += 1
            continue
        for entry in data.get("response", []):
            team_rows += 1
            tid = entry.get("team", {}).get("id")
            if tid is not None:
                team_ids.add(int(tid))
    section_header("Teams (raw/teams/*.json)")
    print(f"  JSON files:        {len(team_files)}")
    print(f"  Team rows:         {team_rows}")
    print(f"  Unique team IDs:   {len(team_ids)}")
    print(f"  Files with errors: {team_err}")

    # ─── squads / players ─────────────────────────────────────────────────────
    squads_dir = RAW_DIR / "squads"
    squad_files = sorted(squads_dir.glob("*.json")) if squads_dir.exists() else []
    player_rows = 0
    player_ids: set[int] = set()
    squad_err = 0
    for path in squad_files:
        data = load(path)
        if has_api_errors(data):
            squad_err += 1
            continue
        for entry in data.get("response", []):
            for p in entry.get("players", []):
                player_rows += 1
                pid = p.get("id")
                if pid is not None:
                    player_ids.add(int(pid))
    section_header("Squads / players (raw/squads/*.json)")
    print(f"  Squad files:        {len(squad_files)}")
    print(f"  Player list rows:   {player_rows}")
    print(f"  Unique player IDs:  {len(player_ids)}")
    print(f"  Files with errors:  {squad_err}")

    # ─── coaches ──────────────────────────────────────────────────────────────
    coaches_dir = RAW_DIR / "coaches"
    coach_files = sorted(coaches_dir.glob("*.json")) if coaches_dir.exists() else []
    coach_rows = 0
    coach_ids: set[int] = set()
    coach_err = 0
    for path in coach_files:
        data = load(path)
        if has_api_errors(data):
            coach_err += 1
            continue
        for entry in data.get("response", []):
            coach_rows += 1
            cid = entry.get("id")
            if cid is not None:
                coach_ids.add(int(cid))
    section_header("Coaches (raw/coaches/*.json, one file per team)")
    print(f"  JSON files:         {len(coach_files)}")
    print(f"  Coach rows:         {coach_rows}")
    print(f"  Unique coach IDs:   {len(coach_ids)}")
    print(f"  Files with errors:  {coach_err}")

    # ─── trophies ─────────────────────────────────────────────────────────────
    trophies_dir = RAW_DIR / "trophies"
    trophy_files = sorted(trophies_dir.glob("*.json")) if trophies_dir.exists() else []
    trophy_rows = 0
    trophy_err = 0
    for path in trophy_files:
        data = load(path)
        if has_api_errors(data):
            trophy_err += 1
            continue
        trophy_rows += len(data.get("response", []))
    section_header("Trophies (raw/trophies/*.json, batched requests)")
    print(f"  JSON files:          {len(trophy_files)}")
    print(f"  Trophy rows (total): {trophy_rows}")
    print(f"  Files with errors:   {trophy_err}")

    # ─── transfers ────────────────────────────────────────────────────────────
    transfers_dir = RAW_DIR / "transfers"
    transfer_files = sorted(transfers_dir.glob("*.json")) if transfers_dir.exists() else []
    transfer_players = 0
    transfer_events = 0
    transfer_err = 0
    for path in transfer_files:
        data = load(path)
        if has_api_errors(data):
            transfer_err += 1
            continue
        for entry in data.get("response", []):
            transfer_players += 1
            for _t in entry.get("transfers", []):
                transfer_events += 1
    section_header("Transfers (raw/transfers/*.json, one file per team)")
    print(f"  JSON files:               {len(transfer_files)}")
    print(f"  Players with transfers:     {transfer_players}")
    print(f"  Individual transfer rows: {transfer_events}")
    print(f"  Files with errors:        {transfer_err}")

    # ─── player statistics ────────────────────────────────────────────────────
    ps_dir = RAW_DIR / "player_stats"
    ps_files = sorted(ps_dir.glob("*.json")) if ps_dir.exists() else []
    ps_err = 0
    for path in ps_files:
        data = load(path)
        if has_api_errors(data):
            ps_err += 1
    section_header("Player stats (raw/player_stats/*.json, one file per player per season)")
    print(f"  JSON files:        {len(ps_files)}")
    print(f"  Files with errors: {ps_err}")

    print()


if __name__ == "__main__":
    main()
