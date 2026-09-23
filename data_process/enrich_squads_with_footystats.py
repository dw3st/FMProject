"""
enrich_squads_with_footystats.py — Enrich API-Football player stats with FootyStats CSV data.

Reads from:
  data_process/to_process/api_football/raw/player_stats/*.json  (player identity + API stats)
  data_process/to_process/footystats_org/*.csv                  (per-90 stats)

Writes to:
  data_process/to_process/api_football/enriched/player_stats/{playerId}.json

One output file per player containing their identity info and the matched
FootyStats per-90 stats (or null if no match found).

Run:
  python data_process/enrich_squads_with_footystats.py
"""

from __future__ import annotations

import csv
import json
import logging
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

# ─── logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── config ───────────────────────────────────────────────────────────────────

DATA_PROCESS_DIR  = Path(__file__).resolve().parent
API_DIR           = DATA_PROCESS_DIR / "to_process" / "api_football"
PLAYER_STATS_DIR  = API_DIR / "raw" / "player_stats"
FOOTYSTATS_DIR    = DATA_PROCESS_DIR / "to_process" / "footystats_org"
OUT_DIR           = API_DIR / "enriched" / "player_stats"

# ─── stats to extract ─────────────────────────────────────────────────────────

OUTFIELD_FIELDS: list[str] = [
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
]

GOALKEEPER_FIELDS: list[str] = [
    "saves_per_90_overall",
    "save_percentage_overall",
    "shots_faced_per_90_overall",
    "punches_per_90_overall",
    "xg_faced_per_90_overall",
    "conceded_per_90_overall",
]

# ─── name normalisation ───────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Lowercase, strip accents, remove dots, collapse whitespace."""
    text = text.lower().strip()
    text = "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )
    text = text.replace(".", "")
    return " ".join(text.split())


def name_tokens(text: str) -> list[str]:
    """Return all non-empty tokens of a normalised name."""
    return normalize(text).split()


def normalize_nationality(nat: str | None) -> str:
    if not nat:
        return ""
    return normalize(nat)


# Tokens that are structurally part of compound names but carry no identifying
# information — e.g. "Renan dos Santos" and "Carlos do Santos" share "santos"
# but "dos"/"do" tells us nothing about the player.
_STOP_TOKENS: frozenset[str] = frozenset({
    "da", "de", "do", "dos", "das",   # Portuguese
    "di", "del", "della", "degli",     # Italian
    "du", "de la", "van", "von",       # French / German / Dutch
    "e", "y", "i",                     # conjunctions
    "jr", "junior", "senior", "sr",    # suffixes — too common
    "filho", "neto",                   # Brazilian family suffixes
})


def significant_tokens(text: str) -> set[str]:
    """Return name tokens minus stopwords and single-character tokens."""
    return {t for t in name_tokens(text) if t not in _STOP_TOKENS and len(t) > 1}

# ─── CSV index ────────────────────────────────────────────────────────────────
# Structure: nationality → last_name_token → [row, ...]
# Multiple rows per (nationality, last_name) are kept for disambiguation.

CsvRow  = dict[str, str]
CsvIndex = dict[str, dict[str, list[CsvRow]]]


def build_csv_index(csv_dir: Path) -> CsvIndex:
    """
    Load all FootyStats CSVs and build a two-level index:
      normalized_nationality → normalized_last_name_token → [rows]

    Indexed by the LAST token only (family name anchor). Using every token
    would cause false matches on common particles like "da", "silva", "costa".

    Example: "Abner Salles da Silva" → indexed only under "silva".

    Deduplication: FootyStats often has multiple rows per player (one per game
    week or competition phase). We keep only the FIRST row per
    (nationality, normalized_full_name) pair.  Duplicates inflate bucket sizes
    and break the adaptive threshold logic.
    """
    index: CsvIndex = defaultdict(lambda: defaultdict(list))
    seen_players: set[tuple[str, str]] = set()   # (nat_key, normalized_full_name)
    total = 0

    for csv_file in sorted(csv_dir.glob("*.csv")):
        log.info("Loading CSV: %s", csv_file.name)
        with open(csv_file, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                full_name = row.get("full_name", "").strip()
                nat       = row.get("nationality", "").strip()

                if not full_name or not nat:
                    continue

                nat_key    = normalize_nationality(nat)
                norm_name  = normalize(full_name)
                player_key = (nat_key, norm_name)

                if player_key in seen_players:
                    continue                          # skip duplicate
                seen_players.add(player_key)

                tokens = name_tokens(full_name)
                if not tokens:
                    continue

                # Index by the last token only — the family name anchor.
                last_token = tokens[-1]
                index[nat_key][last_token].append(row)
                total += 1

    log.info("CSV index built: %d unique players across %d nationalities", total, len(index))
    return index

# ─── player_stats cache ───────────────────────────────────────────────────────

PlayerInfo = dict  # { name, firstname, lastname, nationality }


def load_player_stats_cache(stats_dir: Path) -> dict[int, PlayerInfo]:
    """
    Load all player_stats JSON files and return a dict:
      player_id → { name, firstname, lastname, nationality }

    Prefers the most recent season file. Falls back to older seasons
    when the primary file has an empty response (player had no stats
    that season).  Season preference: 2025 → 2024 → 2023 → …
    """
    SEASON_PREFERENCE = [2026, 2025, 2024, 2023, 2022]

    # Group files by player id: pid → {season: path}
    by_pid: dict[int, dict[int, Path]] = {}
    for f in stats_dir.glob("*.json"):
        parts = f.stem.split("_")
        if len(parts) == 2 and parts[1].isdigit() and parts[0].isdigit():
            pid    = int(parts[0])
            season = int(parts[1])
            by_pid.setdefault(pid, {})[season] = f

    log.info("Loading player_stats cache for %d unique players …", len(by_pid))

    cache: dict[int, PlayerInfo] = {}
    for pid, season_files in by_pid.items():
        for season in SEASON_PREFERENCE:
            f = season_files.get(season)
            if f is None:
                continue
            try:
                with open(f, encoding="utf-8") as fh:
                    data = json.load(fh)
                response = data.get("response", [])
                if not response:
                    continue          # try next season
                p = response[0].get("player", {})
                if p.get("id") is not None:
                    cache[pid] = {
                        "name":        p.get("name", ""),
                        "firstname":   p.get("firstname", ""),
                        "lastname":    p.get("lastname", ""),
                        "nationality": p.get("nationality", ""),
                    }
                    break             # found, stop looking
            except Exception as exc:
                log.warning("Failed to load %s: %s", f.name, exc)

    log.info("Player stats cache: %d players resolved", len(cache))
    return cache

# ─── matching ─────────────────────────────────────────────────────────────────

# Adaptive acceptance thresholds based on surname rarity.
#
# combined score = base_overlap + distinctive_bonus
#   base_overlap:      significant tokens shared between the API name set and the CSV name
#   distinctive_bonus: +1 if the FIRST token of the API lastname appears in the CSV
#                      (first lastname token is usually the most specific part,
#                       e.g. "Lodi" in "Lodi dos Santos", "Delfim" in "Delfim Ferreira")
#
# UNIQUE_SURNAME (≤1 candidate in the smallest probe bucket):
#   The probed surname is rare — a 2-token overlap is convincing enough.
#   e.g. "Ruan Tressoldi" → only one "Tressoldi" in Brazil → threshold 2.
#
# COMMON_SURNAME (multiple candidates per probe bucket):
#   Surnames like "Silva", "Santos", "Carvalho" are shared by thousands of
#   players — we need 3+ combined tokens to avoid false matches.
#   e.g. "Reinier Jesus Carvalho" → many Carvalho in Brazil → threshold 3.
THRESHOLD_UNIQUE_SURNAME = 2
THRESHOLD_COMMON_SURNAME = 3


def find_csv_match(
    player_info: PlayerInfo,
    index: CsvIndex,
) -> CsvRow | None:
    """
    Find a matching FootyStats row for an API player.

    Algorithm
    ---------
    1. Gate on nationality — no CSV data for this country → None.

    2. Build the API player's significant token set (firstname + lastname + display,
       stopwords and single-character tokens removed).

    3. Probe the CSV index on SIGNIFICANT lastname tokens + last display-name token.
       Stopword tokens are skipped — they return massive buckets with no signal.

    4. For each candidate, track the size of the SMALLEST probe bucket that found it.
       A candidate found via a rare surname ("tressoldi" → 1 result) has stronger
       evidence than one found via a common surname ("santos" → 500 results).

    5. Adaptive acceptance threshold:
         - Any probe bucket has exactly 1 result (unique surname) → threshold 2
         - All probe buckets have multiple results (common surnames) → threshold 3

    6. Score: (base_overlap, -discovery_bucket_size)
         - base_overlap: number of shared significant tokens
         - tiebreaker: prefer candidates from smaller (rarer) probe buckets

    7. Accept best candidate only if base_overlap ≥ threshold.
       No separate bonus — the tiebreaker handles surname-specificity preference.
    """
    nat = normalize_nationality(player_info.get("nationality", ""))
    if not nat:
        return None

    nat_bucket = index.get(nat)
    if nat_bucket is None:
        return None

    firstname = player_info.get("firstname", "")
    lastname  = player_info.get("lastname", "")
    name      = player_info.get("name", "")

    # Significant API token set for scoring (all fields, stopwords removed).
    api_tokens: set[str] = (
        significant_tokens(firstname)
        | significant_tokens(lastname)
        | significant_tokens(name)
    )

    # Probe keys: significant lastname tokens + last display-name token.
    # Stopwords ("da", "dos"…) skipped — they return massive buckets with no signal.
    probe_keys: set[str] = {
        t for t in name_tokens(lastname)
        if t not in _STOP_TOKENS and len(t) > 1
    }
    dn_tokens = name_tokens(name)
    if dn_tokens and dn_tokens[-1] not in _STOP_TOKENS:
        probe_keys.add(dn_tokens[-1])

    if not probe_keys:
        return None

    # ── Exact display-name short-circuit ──────────────────────────────────────
    # Players like "Kaio Jorge" have lastname="Pinto Ramos" in the API but are
    # stored as "Kaio Jorge" in footystats. Token overlap never reaches threshold
    # because the real surname tokens ("pinto", "ramos") are absent from the CSV.
    # If the normalized API display name matches the normalized CSV full_name
    # exactly, accept it immediately regardless of threshold.
    api_name_norm = normalize(name)
    if api_name_norm:
        for key in probe_keys:
            for row in nat_bucket.get(key, []):
                if normalize(row.get("full_name", "")) == api_name_norm:
                    return row

    # Collect candidates, tracking the smallest probe-bucket size each was found in.
    # Smaller bucket → rarer surname → stronger evidence.
    candidate_min_bucket: dict[int, int] = {}
    min_bucket_size_overall = float("inf")

    for key in probe_keys:
        bucket = nat_bucket.get(key, [])
        if not bucket:
            continue
        bsize = len(bucket)
        min_bucket_size_overall = min(min_bucket_size_overall, bsize)
        for row in bucket:
            rid = id(row)
            candidate_min_bucket[rid] = min(
                candidate_min_bucket.get(rid, bsize), bsize
            )

    if not candidate_min_bucket:
        return None

    # Retrieve all candidate rows from buckets.
    all_rows: list[CsvRow] = []
    seen: set[int] = set()
    for key in probe_keys:
        for row in nat_bucket.get(key, []):
            rid = id(row)
            if rid in candidate_min_bucket and rid not in seen:
                seen.add(rid)
                all_rows.append(row)

    if not all_rows:
        return None

    # Per-candidate adaptive threshold:
    # Each candidate is accepted/rejected based on the size of the SMALLEST
    # probe bucket that found IT — not the global minimum across all probes.
    #
    # Why: a single rare probe key (e.g. "dudu" bucket size=1) should not lower
    # the threshold for candidates found via a different, common probe key
    # (e.g. "rodrigues" bucket size=23).  Candidates earn their own leniency.
    fn_tokens = significant_tokens(firstname)

    def _score(row: CsvRow) -> tuple[int, int]:
        csv_sig  = significant_tokens(row.get("full_name", ""))
        base     = len(api_tokens & csv_sig)
        disc_neg = -candidate_min_bucket[id(row)]
        return (base, disc_neg)

    # Filter to candidates that pass their own threshold.
    valid: list[CsvRow] = []
    for row in all_rows:
        csv_sig   = significant_tokens(row.get("full_name", ""))
        base      = len(api_tokens & csv_sig)
        disc_size = candidate_min_bucket[id(row)]
        threshold = THRESHOLD_UNIQUE_SURNAME if disc_size == 1 else THRESHOLD_COMMON_SURNAME

        # For unique surnames: cap threshold by the CSV name token count.
        # A mononym like "Hulk" can only ever score 1 — requiring threshold=2
        # would make single-word display-name players unmatchable.
        # Only applies when disc_size==1 (name is unique in the nationality bucket).
        if disc_size == 1:
            threshold = min(threshold, len(csv_sig))

        if not csv_sig or base < threshold:
            continue

        # Extra guard for unique-surname multi-token CSV entries (disc_size == 1):
        # Require at least one firstname token in the CSV name to prevent
        # matching players who share a rare surname but different first names.
        # e.g. "Índio" (Hendel) must NOT match "Jamerson dos Santos Nascimento".
        # Skipped for mononyms (len==1) — no room for a firstname in a single token.
        if disc_size == 1 and len(csv_sig) > 1:
            if fn_tokens and not (fn_tokens & csv_sig):
                continue

        valid.append(row)

    if not valid:
        return None

    # Among valid candidates, return the one with the best (base, -disc_size).
    return max(valid, key=_score)

# ─── stat extraction ──────────────────────────────────────────────────────────

def extract_stats(row: CsvRow, is_goalkeeper: bool) -> dict[str, Any]:
    """Pull the relevant stat columns from a CSV row; cast numerics."""
    fields = GOALKEEPER_FIELDS + OUTFIELD_FIELDS if is_goalkeeper else OUTFIELD_FIELDS
    result: dict[str, Any] = {}
    for field in fields:
        raw = row.get(field, "").strip()
        if raw == "" or raw.lower() in ("n/a", "null", "-"):
            result[field] = None
        else:
            try:
                result[field] = float(raw)
            except ValueError:
                result[field] = raw
    return result

# ─── main ─────────────────────────────────────────────────────────────────────

SEASON_PREFERENCE = [2026, 2025, 2024, 2023, 2022]


def _best_raw_file(pid: int) -> Path | None:
    """Return the raw player_stats file with actual data, preferring newest season."""
    for season in SEASON_PREFERENCE:
        f = PLAYER_STATS_DIR / f"{pid}_{season}.json"
        if f.exists():
            try:
                data = json.load(open(f, encoding="utf-8"))
                if data.get("response"):
                    return f
            except Exception:
                pass
    return None


def main() -> None:
    csv_index    = build_csv_index(FOOTYSTATS_DIR)
    player_cache = load_player_stats_cache(PLAYER_STATS_DIR)

    if not player_cache:
        log.error("No player stats found in %s", PLAYER_STATS_DIR)
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    matched_total   = 0
    unmatched_total = 0

    for pid, player_info in sorted(player_cache.items()):
        raw_file = _best_raw_file(pid)
        if raw_file is None:
            continue

        raw_data = json.load(open(raw_file, encoding="utf-8"))

        # Detect GK from the statistics block inside the raw file.
        is_gk = False
        for entry in raw_data.get("response", []):
            stats = entry.get("statistics", [])
            position = (
                stats[0].get("games", {}).get("position", "")
                if stats else ""
            )
            if position:
                is_gk = position.lower() == "goalkeeper"
                break

        csv_row = find_csv_match(player_info, csv_index)

        if csv_row is not None:
            enriched      = extract_stats(csv_row, is_gk)
            enriched_meta = {
                "source":      "footystats",
                "matched":     True,
                "csvName":     csv_row.get("full_name", ""),
                "csvClub":     csv_row.get("Current Club", ""),
                "nationality": player_info.get("nationality", ""),
            }
            matched_total += 1
        else:
            enriched      = None
            enriched_meta = {
                "source":      "footystats",
                "matched":     False,
                "nationality": player_info.get("nationality", ""),
            }
            unmatched_total += 1

        # Inject into the raw data — preserving ALL original fields.
        raw_data["enriched"]     = enriched
        raw_data["enrichedMeta"] = enriched_meta

        out_path = OUT_DIR / f"{pid}.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(raw_data, fh, ensure_ascii=False, indent=2)

    total = matched_total + unmatched_total
    pct   = 100 * matched_total / total if total else 0
    log.info(
        "Done. Matched: %d / %d  (%.1f%%)  |  Written: %d files",
        matched_total, total, pct, total,
    )


if __name__ == "__main__":
    main()
