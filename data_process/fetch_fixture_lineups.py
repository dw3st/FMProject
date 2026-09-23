"""
fetch_fixture_lineups.py — Fetch raw fixture and lineup data from API-Football.

Writes raw JSON responses to:
  data_process/to_process/api_football/raw/fixtures/{league_id}_{season}.json
  data_process/to_process/api_football/raw/lineups/{fixture_id}.json

Does not process or enrich anything — see enrich_player_positions.py for that.

Run:
  python data_process/fetch_fixture_lineups.py
  python data_process/fetch_fixture_lineups.py --skip-existing   # keep cached files
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import threading
from collections import defaultdict
from pathlib import Path

import requests
from dotenv import load_dotenv

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

API_KEY  = os.environ.get("API_FOOTBALL_KEY", "")
BASE_URL = "https://v3.football.api-sports.io"

DATA_PROCESS_DIR = Path(__file__).resolve().parent
RAW_DIR          = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw"

FIXTURES_PER_TEAM = 10
RATE_LIMIT_RPM    = 100

# league_slug → list of (league_id, season) to fetch.
# Two seasons per league: current + previous.
# European leagues use season = start year of the Aug-May campaign.
# Brazilian leagues use the calendar year.
# Including the previous season gives lineup data for newly-promoted teams
# that have few (or zero) completed matches in the current season yet.
#
# Brazilian estaduais (state championships, Jan–Apr) are also included:
# they run before the Série A/B/C seasons start, so they are the best
# source of 2026 lineup data for Brazilian players right now.
LEAGUE_TARGETS: dict[str, list[tuple[int, int]]] = {
    # ── European top 5 ────────────────────────────────────────────────────────
    "premier_league": [(39,  2025), (39,  2024)],
    "bundesliga":     [(78,  2025), (78,  2024)],
    "ligue_1":        [(61,  2025), (61,  2024)],
    "serie_a":        [(135, 2025), (135, 2024)],
    "la_liga":        [(140, 2025), (140, 2024)],
    # ── Brazilian national leagues ────────────────────────────────────────────
    "brazil_serie_a": [(71,  2026), (71,  2025)],
    "brazil_serie_b": [(72,  2026), (72,  2025)],
    "brazil_serie_c": [(75,  2026), (75,  2025)],
    # ── Brazilian estaduais (Jan–Apr, rich 2026 lineup data) ─────────────────
    "paulista":       [(475, 2026), (475, 2025)],   # SP: Corinthians, Palmeiras, Santos, SPFC
    "carioca":        [(624, 2026), (624, 2025)],   # RJ: Flamengo, Fluminense, Vasco, Botafogo
    "mineiro":        [(629, 2026), (629, 2025)],   # MG: Atlético MG, Cruzeiro, América MG
    "gaucho":         [(477, 2026), (477, 2025)],   # RS: Grêmio, Internacional
    "paranaense":     [(606, 2026), (606, 2025)],   # PR: Athletico PR, Coritiba
    "baiano":         [(602, 2026), (602, 2025)],   # BA: Bahia, Vitória
    "pernambucano":   [(622, 2026), (622, 2025)],   # PE: Sport, Náutico
    "cearense":       [(609, 2026), (609, 2025)],   # CE: Fortaleza, Ceará SC
    "catarinense":    [(604, 2026), (604, 2025)],   # SC: Chapecoense, Avaí
    "goiano":         [(628, 2026), (628, 2025)],   # GO: Goiás, Atlético GO
}

# ─── rate limiter ─────────────────────────────────────────────────────────────

class _RateLimiter:
    def __init__(self, rpm: int) -> None:
        self._interval  = 60.0 / rpm
        self._lock      = threading.Lock()
        self._next_time = 0.0

    def acquire(self) -> None:
        with self._lock:
            now  = time.monotonic()
            wait = self._next_time - now
            if wait > 0:
                time.sleep(wait)
            self._next_time = time.monotonic() + self._interval

_rate_limiter = _RateLimiter(RATE_LIMIT_RPM)

# ─── API helper ───────────────────────────────────────────────────────────────

def api_get(path: str) -> dict:
    if not API_KEY:
        raise RuntimeError(
            "API_FOOTBALL_KEY not set. "
            "Copy data_process/.env.example → data_process/.env and fill in your key."
        )
    url     = f"{BASE_URL}/{path.lstrip('/')}"
    headers = {"x-apisports-key": API_KEY}
    _rate_limiter.acquire()
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            body = r.json()
            errors = body.get("errors")
            if errors:
                err  = errors if isinstance(errors, str) else json.dumps(errors)
                wait = 2 ** (attempt + 1)
                if attempt < 2:
                    log.warning("API error: %s — retry in %ds", err, wait)
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"API error: {err}")
            return body
        except requests.RequestException as exc:
            wait = 2 ** attempt
            if attempt < 2:
                log.warning("Request failed: %s — retry in %ds", exc, wait)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"All retries failed for {url}")


def _save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _load(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)

# ─── fixtures ─────────────────────────────────────────────────────────────────

def fetch_fixtures(league_id: int, season: int, skip_existing: bool) -> list[dict]:
    """
    GET /fixtures?league={league_id}&season={season}&status=FT
    Saves to raw/fixtures/{league_id}_{season}.json.
    Returns the response array.
    """
    dest = RAW_DIR / "fixtures" / f"{league_id}_{season}.json"
    if skip_existing and dest.exists():
        log.info("    fixtures %s_%s — cached (%d)", league_id, season,
                 len(_load(dest).get("response", [])))
        return _load(dest).get("response", [])

    log.info("    Fetching fixtures league=%s season=%s …", league_id, season)
    data = api_get(f"fixtures?league={league_id}&season={season}&status=FT")
    _save(dest, data)
    count = len(data.get("response", []))
    log.info("      → %d finished fixtures saved", count)
    return data.get("response", [])


def select_fixture_ids(fixtures: list[dict], max_per_team: int) -> list[int]:
    """
    From a full fixture list, pick up to `max_per_team` most-recent fixture IDs
    per team, de-duplicated across home and away appearances.
    """
    team_fixtures: dict[int, list[tuple[str, int]]] = defaultdict(list)
    for f in fixtures:
        fid  = f["fixture"]["id"]
        date = f["fixture"]["date"]
        home = f["teams"]["home"]["id"]
        away = f["teams"]["away"]["id"]
        team_fixtures[home].append((date, fid))
        team_fixtures[away].append((date, fid))

    selected: set[int] = set()
    for entries in team_fixtures.values():
        entries.sort(key=lambda x: x[0], reverse=True)
        for _, fid in entries[:max_per_team]:
            selected.add(fid)

    return sorted(selected)

# ─── lineups ──────────────────────────────────────────────────────────────────

def fetch_lineup(fixture_id: int, skip_existing: bool) -> bool:
    """
    GET /fixtures/lineups?fixture={fixture_id}
    Saves to raw/lineups/{fixture_id}.json.
    Returns True on success, False on error.
    """
    dest = RAW_DIR / "lineups" / f"{fixture_id}.json"
    if skip_existing and dest.exists():
        return True

    try:
        data = api_get(f"fixtures/lineups?fixture={fixture_id}")
        _save(dest, data)
        return True
    except Exception as exc:
        log.warning("    Lineup fetch failed fixture=%s: %s", fixture_id, exc)
        return False

# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch raw fixture + lineup data from API-Football."
    )
    parser.add_argument(
        "--skip-existing", action="store_true",
        help="Skip API calls for files already cached on disk.",
    )
    args = parser.parse_args()

    if not API_KEY:
        log.error("API_FOOTBALL_KEY not set in data_process/.env — aborting.")
        return

    all_fixture_ids: set[int] = set()

    # ── Step 1: fixtures ──────────────────────────────────────────────────────
    log.info("=== Step 1: Fetch finished fixtures ===")
    for slug, season_pairs in LEAGUE_TARGETS.items():
        for league_id, season in season_pairs:
            log.info("  %s (league=%s season=%s)", slug, league_id, season)
            fixtures = fetch_fixtures(league_id, season, args.skip_existing)
            ids      = select_fixture_ids(fixtures, FIXTURES_PER_TEAM)
            log.info("    → %d unique fixtures selected (≤%d per team)", len(ids), FIXTURES_PER_TEAM)
            all_fixture_ids.update(ids)

    total = len(all_fixture_ids)
    log.info("Total unique fixtures to fetch lineups for: %d", total)

    # ── Step 2: lineups ───────────────────────────────────────────────────────
    log.info("=== Step 2: Fetch lineups ===")
    fetched = skipped = failed = 0
    for i, fid in enumerate(sorted(all_fixture_ids), 1):
        dest = RAW_DIR / "lineups" / f"{fid}.json"
        if args.skip_existing and dest.exists():
            skipped += 1
            continue
        ok = fetch_lineup(fid, skip_existing=False)
        if ok:
            fetched += 1
        else:
            failed += 1
        if i % 50 == 0:
            log.info("  … %d / %d  fetched=%d  skipped=%d  failed=%d",
                     i, total, fetched, skipped, failed)

    log.info(
        "Done.  fetched=%d  skipped=%d  failed=%d  →  raw/lineups/ (%d files)",
        fetched, skipped, failed,
        len(list((RAW_DIR / "lineups").glob("*.json"))) if (RAW_DIR / "lineups").exists() else 0,
    )
    log.info("Next step: python data_process/enrich_player_positions.py")


if __name__ == "__main__":
    main()
