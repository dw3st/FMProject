"""
fetch_api_football.py — API-Football raw data fetcher.

Hits the API-Football v3 endpoints and saves raw JSON responses under:
  data_process/to_process/api_football/raw/
    leagues/{league_id}.json
    teams/{league_id}_{season}.json
    squads/{team_id}.json
    coaches/{team_id}.json          ← one file per team, contains coach data
    trophies/{coach_id}.json        ← one file per coach ID
    transfers/{team_id}.json
    player_stats/{player_id}_{season}.json   ← GET /players?id=&season=

Commands (--cmd):
  all         Full pipeline: leagues → teams → squads  (default)
  coaches     Fetch coach per team (reads raw/squads/ for team IDs)
  trophies    Fetch coach trophies (reads raw/coaches/ for coach IDs, one per coach)
  transfers     Fetch transfers per team (reads raw/teams/ for team IDs)
  squads_retry      Re-fetch squads only for raw/squads/*.json that have API errors
  player_stats       Player statistics: GET /players?id=&season= for each player in raw/squads/, or from --player-ids-file (season: --season)
  player_stats_retry Re-fetch player_stats files that have API errors

Run:
  python data_process/fetch_api_football.py
  python data_process/fetch_api_football.py --cmd coaches
  python data_process/fetch_api_football.py --cmd trophies
  python data_process/fetch_api_football.py --cmd trophies --skip-existing
  python data_process/fetch_api_football.py --cmd trophies --ids-file data_process/to_process/api_football/missing_trophy_coaches.json
  python data_process/fetch_api_football.py --cmd transfers
  python data_process/fetch_api_football.py --cmd squads_retry
  python data_process/fetch_api_football.py --cmd player_stats
  python data_process/fetch_api_football.py --cmd player_stats --season 2026
  python data_process/fetch_api_football.py --cmd player_stats --skip-existing
  python data_process/fetch_api_football.py --cmd coaches --country England

Requires data_process/.env with:
  API_FOOTBALL_KEY=your_key_here
"""

from __future__ import annotations

import argparse
import json
import time
import logging
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

# ─── logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── config ───────────────────────────────────────────────────────────────────

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)

API_KEY   = os.environ.get("API_FOOTBALL_KEY", "")
BASE_URL  = "https://v3.football.api-sports.io"
SOURCE    = "api_football"

DATA_PROCESS_DIR = Path(__file__).resolve().parent
RAW_DIR          = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw"
CONSTANTS_DIR    = DATA_PROCESS_DIR / "constants"

def _load_targets() -> list[dict[str, str]]:
    """Build fetch targets from constants/leagues.json.

    Uses `football_api_name` for the API-Football `name=` query (exact string from their API).
    `name` in each target is that API string; `label` is the human-facing name from constants.
    """
    with open(CONSTANTS_DIR / "leagues.json", encoding="utf-8") as f:
        leagues: dict = json.load(f)
    seen: set[tuple[str, str]] = set()
    targets: list[dict[str, str]] = []
    for meta in leagues.values():
        api_name = meta.get("football_api_name") or meta["name"]
        key = (meta["country"], api_name)
        if key not in seen:
            seen.add(key)
            targets.append({
                "country": meta["country"],
                "name": api_name,
                "label": meta["name"],
            })
    return targets

TARGETS = _load_targets()

DEFAULT_PLAYER_STATS_SEASON = 2025

MAX_WORKERS    = 5
MAX_RETRIES    = 3
RATE_LIMIT_RPM = 100  # requests per minute

# ─── rate limiter ─────────────────────────────────────────────────────────────

import threading

class _RateLimiter:
    """Token-bucket limiter: allows up to `rpm` requests per 60-second window."""

    def __init__(self, rpm: int) -> None:
        self._interval = 60.0 / rpm  # seconds between requests
        self._lock = threading.Lock()
        self._next_allowed = 0.0  # epoch time when next request may fire

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                time.sleep(wait)
            self._next_allowed = time.monotonic() + self._interval

_rate_limiter = _RateLimiter(RATE_LIMIT_RPM)

# ─── helpers ──────────────────────────────────────────────────────────────────

def api_fetch(path: str) -> dict:
    """GET BASE_URL/path with exponential-backoff retry. Returns parsed JSON."""
    if not API_KEY:
        raise RuntimeError(
            "API_FOOTBALL_KEY is not set. "
            "Copy data_process/.env.example → data_process/.env and fill in your key."
        )

    url = f"{BASE_URL}/{path.lstrip('/')}"
    headers = {"x-apisports-key": API_KEY}

    _rate_limiter.acquire()
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            # JSON is UTF-8 (RFC 8259). Decode bytes explicitly so we never rely on
            # charset sniffing / wrong Content-Type, which produced mojibake (e.g. Dodô → DodÃ´).
            body = json.loads(response.content.decode("utf-8"))

            errors = body.get("errors")
            if errors:
                # API returns errors as dict {"rateLimit": "..."} or list
                err_str = errors if isinstance(errors, str) else json.dumps(errors)
                wait = 2 ** (attempt + 1)  # longer wait for API-level errors
                if attempt < MAX_RETRIES - 1:
                    log.warning("API error (attempt %d): %s — retrying in %ds…", attempt + 1, err_str, wait)
                    time.sleep(wait)
                    continue
                else:
                    log.error("API error after %d attempts for %s: %s", MAX_RETRIES, url, err_str)
                    raise RuntimeError(f"API error: {err_str}")

            return body

        except requests.RequestException as exc:
            wait = 2 ** attempt
            if attempt < MAX_RETRIES - 1:
                log.warning("Request failed (%s). Retrying in %ds… [%s]", exc, wait, url)
                time.sleep(wait)
            else:
                log.error("All %d attempts failed for %s: %s", MAX_RETRIES, url, exc)
                raise


def write_raw(subdir: str, filename: str, data: dict) -> Path:
    """Write raw API response JSON to RAW_DIR/{subdir}/{filename}."""
    dest = RAW_DIR / subdir / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return dest


def read_raw(subdir: str, filename: str) -> dict:
    """Read a previously saved raw JSON file."""
    with open(RAW_DIR / subdir / filename, encoding="utf-8") as f:
        return json.load(f)


def raw_files(subdir: str) -> list[Path]:
    """List all JSON files under RAW_DIR/{subdir}."""
    d = RAW_DIR / subdir
    if not d.exists():
        return []
    return sorted(d.glob("*.json"))

# ─── step 1: leagues ──────────────────────────────────────────────────────────

def fetch_leagues(targets: list[dict[str, str]]) -> list[tuple[int, int]]:
    """
    Fetch target leagues, save raw responses, return [(league_id, season), …].
    """
    pairs: list[tuple[int, int]] = []

    for target in targets:
        api_name = target["name"]
        label = target.get("label", api_name)
        params = f"country={target['country']}&name={api_name.replace(' ', '%20')}"
        log.info("Fetching league: %s / %s (API name: %s)", target["country"], label, api_name)

        data = api_fetch(f"/leagues?{params}")
        responses = data.get("response", [])

        if not responses:
            log.warning("No league found for %s / %s", target["country"], label)
            continue

        for entry in responses:
            league_id: int = entry["league"]["id"]
            filename = f"{league_id}.json"
            write_raw("leagues", filename, entry)
            log.info("  Saved raw/leagues/%s", filename)

            current_season = next(
                (s["year"] for s in entry.get("seasons", []) if s.get("current")),
                None,
            )
            if current_season is None:
                log.warning("  No current season for league %d — skipping", league_id)
                continue

            pairs.append((league_id, current_season))
            log.info("  League %d | current season: %d", league_id, current_season)

    return pairs

# ─── step 2: teams ────────────────────────────────────────────────────────────

def fetch_teams(league_id: int, season: int) -> list[int]:
    """
    Fetch teams for a league/season, save raw response, return list of team IDs.
    """
    log.info("Fetching teams: league=%d season=%d", league_id, season)
    filename = f"{league_id}_{season}.json"

    data = api_fetch(f"/teams?league={league_id}&season={season}")
    write_raw("teams", filename, data)
    log.info("  Saved raw/teams/%s (%d teams)", filename, len(data.get("response", [])))

    return [entry["team"]["id"] for entry in data.get("response", [])]

# ─── step 3: squads ───────────────────────────────────────────────────────────

def fetch_squad(team_id: int) -> None:
    """Fetch squad for one team and save raw response."""
    filename = f"{team_id}.json"
    data = api_fetch(f"/players/squads?team={team_id}")
    write_raw("squads", filename, data)
    log.info("  Saved raw/squads/%s", filename)


def fetch_squads(team_ids: list[int]) -> None:
    """Fetch all squads concurrently (up to MAX_WORKERS at a time)."""
    log.info("Fetching squads for %d teams (workers=%d)…", len(team_ids), MAX_WORKERS)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_squad, tid): tid for tid in team_ids}
        for future in as_completed(futures):
            tid = futures[future]
            try:
                future.result()
            except Exception as exc:
                log.error("  Squad fetch failed for team %d: %s", tid, exc)


def _squads_with_api_errors() -> list[int]:
    """Team IDs whose raw/squads/{id}.json has a non-empty `errors` field."""
    bad: list[int] = []
    for path in raw_files("squads"):
        if not path.stem.isdigit():
            continue
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        err = data.get("errors")
        if not err:
            continue
        if isinstance(err, dict) and len(err) == 0:
            continue
        if isinstance(err, list) and len(err) == 0:
            continue
        bad.append(int(path.stem))
    return sorted(bad)


def cmd_squads_retry() -> None:
    """Re-fetch squads only for teams whose saved file still has an API error."""
    ids = _squads_with_api_errors()
    if not ids:
        log.info("No squad files with errors under %s", RAW_DIR / "squads")
        return
    log.info("Re-fetching squads for %d team(s) with errors: %s", len(ids), ids)
    fetch_squads(ids)
    log.info("Done. Re-run: python data_process/count_api_football_raw.py")

# ─── step 4: coaches ──────────────────────────────────────────────────────────

def _team_ids_from_squads() -> list[int]:
    """Read team IDs from already-fetched raw/squads/*.json filenames."""
    return [int(p.stem) for p in raw_files("squads") if p.stem.isdigit()]


def fetch_coach(team_id: int) -> None:
    """Fetch coach for one team and save raw response."""
    data = api_fetch(f"/coachs?team={team_id}")
    write_raw("coaches", f"{team_id}.json", data)
    count = len(data.get("response", []))
    log.info("  Saved raw/coaches/%d.json (%d coach record(s))", team_id, count)


def fetch_coaches(team_ids: list[int]) -> None:
    """Fetch coaches for all teams concurrently."""
    log.info("Fetching coaches for %d teams (workers=%d)…", len(team_ids), MAX_WORKERS)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_coach, tid): tid for tid in team_ids}
        for future in as_completed(futures):
            tid = futures[future]
            try:
                future.result()
            except Exception as exc:
                log.error("  Coach fetch failed for team %d: %s", tid, exc)


# ─── step 5: trophies ─────────────────────────────────────────────────────────

def _coach_ids_from_coaches() -> list[int]:
    """Extract unique coach IDs from raw/coaches/*.json."""
    ids: set[int] = set()
    for path in raw_files("coaches"):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for entry in data.get("response", []):
            cid = entry.get("id")
            if cid is not None:
                ids.add(int(cid))
    return sorted(ids)


def _coach_ids_from_ids_file(path: Path) -> list[int]:
    """Load a JSON array of coach IDs from a file (e.g. missing_trophy_coaches.json)."""
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise ValueError(f"Expected JSON array in {path}")
    ids: list[int] = []
    for item in raw:
        try:
            ids.append(int(item))
        except (TypeError, ValueError):
            log.warning("Skipping invalid coach id in %s: %r", path, item)
    return sorted(set(ids))


def fetch_trophy_for_coach(coach_id: int, *, skip_existing: bool = False) -> None:
    """
    Fetch trophies for a single coach and save as raw/trophies/{coach_id}.json.
    The response includes `parameters.coach` so build_coaches.py can key on it.
    """
    dest = RAW_DIR / "trophies" / f"{coach_id}.json"
    if skip_existing and dest.exists():
        try:
            with open(dest, encoding="utf-8") as f:
                existing = json.load(f)
            if not _json_has_api_errors(existing):
                return
        except (json.JSONDecodeError, OSError):
            pass
    data = api_fetch(f"/trophies?coach={coach_id}")
    write_raw("trophies", f"{coach_id}.json", data)
    count = len(data.get("response", []))
    log.info("  Saved raw/trophies/%d.json (%d trophy records)", coach_id, count)


def fetch_trophies(coach_ids: list[int], *, skip_existing: bool = False) -> None:
    """Fetch trophies for each coach individually (one request per coach)."""
    total = len(coach_ids)
    log.info("Fetching trophies for %d coaches (workers=%d)…", total, MAX_WORKERS)
    done = 0

    def work(cid: int) -> None:
        fetch_trophy_for_coach(cid, skip_existing=skip_existing)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(work, cid): cid for cid in coach_ids}
        for future in as_completed(futures):
            cid = futures[future]
            try:
                future.result()
                done += 1
                if done % 50 == 0 or done == total:
                    log.info("  Progress: %d / %d", done, total)
            except Exception as exc:
                log.error("  Trophies fetch failed for coach %d: %s", cid, exc)


# ─── step 6: transfers ────────────────────────────────────────────────────────

def _team_ids_from_teams() -> list[int]:
    """Read unique team IDs from already-fetched raw/teams/*.json responses."""
    ids: set[int] = set()
    for path in raw_files("teams"):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for entry in data.get("response", []):
            tid = entry.get("team", {}).get("id")
            if tid is not None:
                ids.add(int(tid))
    return sorted(ids)


def fetch_transfers_for_team(team_id: int) -> None:
    """Fetch transfers for one team and save raw response."""
    data = api_fetch(f"/transfers?team={team_id}")
    write_raw("transfers", f"{team_id}.json", data)
    count = len(data.get("response", []))
    log.info("  Saved raw/transfers/%d.json (%d transfer record(s))", team_id, count)


def fetch_transfers(team_ids: list[int]) -> None:
    """Fetch transfers for all teams concurrently."""
    log.info("Fetching transfers for %d teams (workers=%d)…", len(team_ids), MAX_WORKERS)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_transfers_for_team, tid): tid for tid in team_ids}
        for future in as_completed(futures):
            tid = futures[future]
            try:
                future.result()
            except Exception as exc:
                log.error("  Transfers fetch failed for team %d: %s", tid, exc)


# ─── player statistics (GET /players?id=&season=) ────────────────────────────

def _json_has_api_errors(data: dict) -> bool:
    err = data.get("errors")
    if not err:
        return False
    if isinstance(err, dict) and len(err) == 0:
        return False
    if isinstance(err, list) and len(err) == 0:
        return False
    return True


def _valid_player_id(raw: object) -> int | None:
    """API-Football rejects id=0; skip null/invalid/non-positive ids."""
    if raw is None:
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return n


def collect_player_season_pairs(season: int) -> list[tuple[int, int]]:
    """
    Read every raw/squads/{team_id}.json and collect player ids.
    Each player is paired with the given `season` (CLI --season, default 2025).
    """
    pairs: set[tuple[int, int]] = set()
    skipped_invalid = 0
    squads_dir = RAW_DIR / "squads"
    if not squads_dir.exists():
        return []

    for squad_path in sorted(squads_dir.glob("*.json")):
        if not squad_path.stem.isdigit():
            continue
        with open(squad_path, encoding="utf-8") as sf:
            squad_data = json.load(sf)
        if _json_has_api_errors(squad_data):
            continue
        for block in squad_data.get("response", []):
            for pl in block.get("players", []):
                vid = _valid_player_id(pl.get("id"))
                if vid is None:
                    skipped_invalid += 1
                    continue
                pairs.add((vid, season))

    if skipped_invalid:
        log.warning(
            "Skipped %d squad player row(s) with missing or invalid id (0/null)",
            skipped_invalid,
        )
    return sorted(pairs)


def fetch_one_player_stat(player_id: int, season: int) -> None:
    """GET /players?id=&season= and save raw/player_stats/{id}_{season}.json."""
    if player_id <= 0:
        log.warning("Skipping invalid player_id=%s", player_id)
        return
    data = api_fetch(f"/players?id={player_id}&season={season}")
    write_raw("player_stats", f"{player_id}_{season}.json", data)


def fetch_player_stats(
    pairs: list[tuple[int, int]],
    *,
    skip_existing_ok: bool,
) -> None:
    """Fetch player statistics for each (player_id, season)."""
    total = len(pairs)
    season = pairs[0][1] if pairs else 0
    log.info("Player stats: %d unique players, season=%d", total, season)

    def work(item: tuple[int, int]) -> None:
        pid, season = item
        dest = RAW_DIR / "player_stats" / f"{pid}_{season}.json"
        if skip_existing_ok and dest.exists():
            try:
                with open(dest, encoding="utf-8") as f:
                    existing = json.load(f)
                if not _json_has_api_errors(existing):
                    return
            except (json.JSONDecodeError, OSError):
                pass
        fetch_one_player_stat(pid, season)

    done = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(work, p): p for p in pairs}
        for future in as_completed(futures):
            pair = futures[future]
            try:
                future.result()
                done += 1
                if done % 100 == 0 or done == total:
                    log.info("  Progress: %d / %d", done, total)
            except Exception as exc:
                log.error("  player_stats failed for %s: %s", pair, exc)


def _pairs_from_ids_file(path: Path, season: int) -> list[tuple[int, int]]:
    """Load a JSON array of player ids; return unique (id, season) pairs."""
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise ValueError(f"Expected JSON array in {path}")
    pairs_set: set[tuple[int, int]] = set()
    skipped = 0
    for item in raw:
        vid = _valid_player_id(item)
        if vid is None:
            skipped += 1
            continue
        pairs_set.add((vid, season))
    if skipped:
        log.warning("Skipped %d invalid id(s) in %s", skipped, path)
    return sorted(pairs_set)


def cmd_player_stats(
    season: int,
    skip_existing: bool,
    *,
    ids_file: Path | None = None,
) -> None:
    log.info("Player stats: using season=%d (override with --season)", season)
    if ids_file is not None:
        if not ids_file.is_file():
            log.error("Player ids file not found: %s", ids_file)
            return
        pairs = _pairs_from_ids_file(ids_file, season)
        log.info("Loaded %d player id(s) from %s", len(pairs), ids_file)
    else:
        pairs = collect_player_season_pairs(season)
    if not pairs:
        log.error(
            "No players found — use --player-ids-file or need raw/squads/*.json (run --cmd all first).",
        )
        return
    fetch_player_stats(pairs, skip_existing_ok=skip_existing)
    log.info("Done. Player stats under %s", RAW_DIR / "player_stats")


def _player_stats_pairs_with_errors() -> list[tuple[int, int]]:
    """(player_id, season) from raw/player_stats/*.json files that have API errors."""
    bad: list[tuple[int, int]] = []
    d = RAW_DIR / "player_stats"
    if not d.exists():
        return []
    for path in sorted(d.glob("*.json")):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            stem = path.stem
            if "_" in stem:
                a, b = stem.rsplit("_", 1)
                if a.isdigit() and b.isdigit():
                    bad.append((int(a), int(b)))
            continue
        if _json_has_api_errors(data):
            stem = path.stem
            if "_" in stem:
                a, b = stem.rsplit("_", 1)
                try:
                    bad.append((int(a), int(b)))
                except ValueError:
                    pass
    return bad


def cmd_player_stats_retry() -> None:
    pairs = _player_stats_pairs_with_errors()
    if not pairs:
        log.info("No player_stats files with errors under %s", RAW_DIR / "player_stats")
        return
    log.info("Re-fetching %d player_stats file(s) with errors", len(pairs))
    fetch_player_stats(pairs, skip_existing_ok=False)
    log.info("Done.")


# ─── main ─────────────────────────────────────────────────────────────────────

def cmd_all(targets: list[dict[str, str]]) -> None:
    """Full pipeline: leagues → teams → squads."""
    log.info(
        "Targets: %s",
        [f"{t['country']} / {t.get('label', t['name'])} (API: {t['name']})" for t in targets],
    )

    pairs = fetch_leagues(targets)
    if not pairs:
        log.error("No leagues fetched. Aborting.")
        return

    all_team_ids: list[int] = []
    for league_id, season in pairs:
        team_ids = fetch_teams(league_id, season)
        all_team_ids.extend(team_ids)

    if not all_team_ids:
        log.error("No teams found. Aborting.")
        return

    fetch_squads(all_team_ids)
    log.info("Done. Raw data saved under %s", RAW_DIR)


def cmd_coaches() -> None:
    """Fetch coaches for all teams found in raw/squads/."""
    team_ids = _team_ids_from_squads()
    if not team_ids:
        log.error("No squad files found in %s — run the 'all' command first.", RAW_DIR / "squads")
        return
    fetch_coaches(team_ids)
    log.info("Done. Coaches saved under %s", RAW_DIR / "coaches")


def cmd_trophies(
    skip_existing: bool = False,
    ids_file: Path | None = None,
) -> None:
    """
    Fetch trophies for coaches, one request per coach.

    By default reads coach IDs from raw/coaches/*.json.
    Pass --ids-file to fetch only the IDs listed in that file
    (e.g. missing_trophy_coaches.json).
    Pass --skip-existing to skip coaches whose trophy file already exists
    without API errors.
    """
    if ids_file is not None:
        if not ids_file.is_file():
            log.error("Coach ids file not found: %s", ids_file)
            return
        coach_ids = _coach_ids_from_ids_file(ids_file)
        log.info("Loaded %d coach id(s) from %s", len(coach_ids), ids_file)
    else:
        coach_ids = _coach_ids_from_coaches()

    if not coach_ids:
        log.error("No coach IDs found — run the 'coaches' command first or provide --ids-file.")
        return

    fetch_trophies(coach_ids, skip_existing=skip_existing)
    log.info("Done. Trophies saved under %s", RAW_DIR / "trophies")


def cmd_transfers() -> None:
    """Fetch transfers for all teams found in raw/teams/."""
    team_ids = _team_ids_from_teams()
    if not team_ids:
        log.error("No team files found in %s — run the 'all' command first.", RAW_DIR / "teams")
        return
    fetch_transfers(team_ids)
    log.info("Done. Transfers saved under %s", RAW_DIR / "transfers")


def main(
    cmd: str = "all",
    targets: list[dict[str, str]] | None = None,
    skip_existing: bool = False,
    season: int = DEFAULT_PLAYER_STATS_SEASON,
    player_ids_file: Path | None = None,
    trophies_ids_file: Path | None = None,
) -> None:
    log.info("=== fetch_api_football.py | cmd=%s ===", cmd)
    log.info("RAW_DIR: %s", RAW_DIR)

    if cmd == "all":
        cmd_all(targets if targets is not None else TARGETS)
    elif cmd == "coaches":
        cmd_coaches()
    elif cmd == "trophies":
        cmd_trophies(skip_existing=skip_existing, ids_file=trophies_ids_file)
    elif cmd == "transfers":
        cmd_transfers()
    elif cmd == "squads_retry":
        cmd_squads_retry()
    elif cmd == "player_stats":
        cmd_player_stats(
            season=season,
            skip_existing=skip_existing,
            ids_file=player_ids_file,
        )
    elif cmd == "player_stats_retry":
        cmd_player_stats_retry()
    else:
        log.error("Unknown command: %s", cmd)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch raw API-Football data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
commands:
  all           Full pipeline: leagues → teams → squads  (default)
  coaches       Fetch coach per team (reads existing raw/squads/)
  trophies      Fetch coach trophies, one request per coach (reads raw/coaches/)
  transfers     Fetch transfers per team (reads existing raw/teams/)
  squads_retry      Re-fetch only raw/squads/*.json that have non-empty API errors
  player_stats       GET /players?id=&season= for each player in raw/squads/ (season: --season, default: 2025), or from --player-ids-file
  player_stats_retry Re-fetch raw/player_stats/*.json that have API errors

--country / --league only apply to the 'all' command.
--season applies to 'player_stats' only (default: 2025).
--skip-existing applies to 'trophies' and 'player_stats' (skip files without errors).
--ids-file      JSON array of coach ids for 'trophies' (e.g. missing_trophy_coaches.json).
--player-ids-file JSON array of player ids for 'player_stats' (skips squads scan).
        """,
    )
    parser.add_argument(
        "--cmd",
        metavar="CMD",
        default="all",
        choices=[
            "all",
            "coaches",
            "trophies",
            "transfers",
            "squads_retry",
            "player_stats",
            "player_stats_retry",
        ],
        help="Command to run (default: all)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="trophies / player_stats: skip files that already exist and have no API errors",
    )
    parser.add_argument(
        "--ids-file",
        type=Path,
        metavar="PATH",
        default=None,
        help=(
            "trophies: JSON file with a list of coach IDs to fetch "
            "(e.g. missing_trophy_coaches.json); skips reading raw/coaches/"
        ),
    )
    parser.add_argument(
        "--season",
        type=int,
        default=DEFAULT_PLAYER_STATS_SEASON,
        metavar="YEAR",
        help=f"player_stats: season year for /players?id=&season= (default: {DEFAULT_PLAYER_STATS_SEASON})",
    )
    parser.add_argument(
        "--player-ids-file",
        type=Path,
        metavar="PATH",
        default=None,
        help="player_stats: JSON file with a list of player ids (e.g. empty_stats_players.json); use with --season",
    )
    parser.add_argument(
        "--country",
        metavar="COUNTRY",
        help='Filter to a specific country, e.g. "England"  (all only)',
    )
    parser.add_argument(
        "--league",
        metavar="NAME",
        help='Filter to a specific league name, e.g. "Premier League"  (all only)',
    )
    args = parser.parse_args()

    def _norm(s: str) -> str:
        return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()

    def _league_matches(t: dict[str, str], query: str) -> bool:
        q = _norm(query)
        return _norm(t["name"]) == q or _norm(t.get("label", "")) == q

    active_targets = TARGETS
    if args.cmd == "all":
        if args.country:
            active_targets = [t for t in active_targets if _norm(t["country"]) == _norm(args.country)]
        if args.league:
            active_targets = [t for t in active_targets if _league_matches(t, args.league)]
        if not active_targets:
            lines = [
                f"  {t['country']} / {t.get('label', t['name'])}  (API: {t['name']})"
                for t in TARGETS
            ]
            parser.error("No matching targets found. Available:\n" + "\n".join(lines))

    main(
        cmd=args.cmd,
        targets=active_targets,
        skip_existing=args.skip_existing,
        season=args.season,
        player_ids_file=args.player_ids_file,
        trophies_ids_file=args.ids_file,
    )
