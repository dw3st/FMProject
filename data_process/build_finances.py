"""
build_finances.py — Enrich squad JSON files with financial data.

Reads:
  src/Data/squads/**/*.json          — squad files (capacity, name, country)
  to_process/transfer_summary.csv   — historical transfer volume per club
  to_process/followers.json         — known social media followers
  to_process/financial_leagues.json — revenue bands (low/mid/high/elite) per league

Writes:
  Updated squad JSONs with a 'finances' field added:
  {
    "score":          0.0–1.0,
    "broadcasting":   int  (EUR),
    "commercial":     int  (EUR),
    "total":          int  (EUR),
    "budget":         int  (EUR),
    "followers":      int
  }

Run:
  python data_process/build_finances.py
"""

from __future__ import annotations

import csv
import difflib
import json
import math
import random
import re
import unicodedata
from pathlib import Path

# ─── paths ────────────────────────────────────────────────────────────────────

ROOT             = Path(__file__).resolve().parent.parent
DATA_PROCESS_DIR = Path(__file__).resolve().parent
TO_PROCESS_DIR   = DATA_PROCESS_DIR / "to_process"
SQUADS_DIR       = ROOT / "src" / "Data" / "squads"

TRANSFERS_CSV    = TO_PROCESS_DIR / "transfer_summary.csv"
FOLLOWERS_JSON   = TO_PROCESS_DIR / "followers.json"
FINANCIAL_JSON   = TO_PROCESS_DIR / "financial_leagues.json"

# ─── league slug → financial_leagues.json key ─────────────────────────────────

SLUG_TO_FIN_KEY: dict[str, str] = {
    "premier_league":  "premier_league",
    "bundesliga":      "bundesliga",
    "ligue_1":         "ligue_one",
    "serie_a":         "serie_a",
    "la_liga":         "la_liga",
    "brazil_serie_a":  "brasileirao_a",
    "brazil_serie_b":  "brasileirao_b",
    "brazil_serie_c":  "brasileirao_c",
}

# Squad country field → followers.json ISO country code
COUNTRY_TO_ISO: dict[str, str] = {
    "England": "ENG",
    "Spain":   "ESP",
    "Italy":   "ITA",
    "Germany": "GER",
    "France":  "FRA",
    "Brazil":  "BRA",
}

# Follower ranges for leagues with no anchors (Serie B / C)
FALLBACK_FOLLOWERS: dict[str, tuple[int, int]] = {
    "brazil_serie_b": (50_000,   2_000_000),
    "brazil_serie_c": (10_000,   300_000),
}

# ─── known squad-name → transfer-CSV-name overrides ──────────────────────────
# Maps _key(squad_name) → _key(csv_name) for clubs whose abbreviation or
# alternative name would otherwise fail to fuzzy-match.

TRANSFER_OVERRIDES: dict[str, str] = {
    "psg":               "paris saint germain",
    "olympique lyonnais":"lyon",
    "olympique marseille":"marseille",
    "inter milan":       "inter",
    "ac milan":          "milan",
    "borussia m gladbach": "m gladbach",
}

# ─── name normalisation (same approach as pipeline) ──────────────────────────

def _key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\b(fc|sc|ac|cf|ec|sk|bj|rj|fb|fk|if|af|cd|ud|sd|ca|rc|as|ss|us|asc|rcd|ssc|afc|bsc|vfb|vfl|rb|fsv|tsg|svw|1\.)\b", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _fuzzy_match(name: str, candidates: dict[str, any], cutoff: float = 0.6) -> any | None:
    key = _key(name)
    # 1. Exact match
    if key in candidates:
        return candidates[key]
    # 2. Known override (e.g. "psg" → "paris saint germain")
    override = TRANSFER_OVERRIDES.get(key)
    if override and override in candidates:
        return candidates[override]
    # 3. Fuzzy fallback
    close = difflib.get_close_matches(key, candidates.keys(), n=1, cutoff=cutoff)
    return candidates[close[0]] if close else None

# ─── loaders ─────────────────────────────────────────────────────────────────

def load_transfers() -> dict[str, float]:
    """name_key → volume_eur (keeps the highest value on key collisions)"""
    result: dict[str, float] = {}
    with open(TRANSFERS_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            vol = float(row.get("volume_eur") or 0)
            key = _key(row["name"])
            if vol > result.get(key, 0):
                result[key] = vol
    return result


def load_followers() -> list[dict]:
    return json.load(open(FOLLOWERS_JSON, encoding="utf-8"))


def load_financial_bands() -> dict[str, dict]:
    return json.load(open(FINANCIAL_JSON, encoding="utf-8"))


def load_squads_by_league() -> dict[str, list[dict]]:
    """Returns {league_slug: [squad_dict, ...]}"""
    result: dict[str, list[dict]] = {}
    for path in sorted(SQUADS_DIR.glob("**/*.json")):
        league_slug = path.parent.name
        squad = json.load(open(path, encoding="utf-8"))
        squad["_path"] = path
        result.setdefault(league_slug, []).append(squad)
    return result

# ─── follower matching ────────────────────────────────────────────────────────

def build_follower_index(followers: list[dict]) -> dict[str, dict]:
    """Build name_key → entry for all known clubs."""
    index: dict[str, dict] = {}
    for entry in followers:
        index[_key(entry["club"])] = entry
    return index


def match_followers(club_name: str, country_iso: str | None,
                    follower_index: dict[str, dict]) -> dict | None:
    """
    Try to match a squad to a followers.json entry.
    Prefers same-country match; falls back to global match.
    """
    # Build country-filtered subset first
    if country_iso:
        subset = {k: v for k, v in follower_index.items() if v.get("country") == country_iso}
        match = _fuzzy_match(club_name, subset, cutoff=0.65)
        if match:
            return match
    # Global fallback with higher cutoff to avoid wrong-country false positives
    return _fuzzy_match(club_name, follower_index, cutoff=0.75)

# ─── score computation ────────────────────────────────────────────────────────

def _log_scores(values: list[float | None], missing_pct_lo: float, missing_pct_hi: float,
                rng: random.Random) -> list[float]:
    """
    Log-normalise a list of values to [0, 1].
    None → random between the given percentile range of valid values.
    """
    valid = [math.log1p(v) for v in values if v is not None and v > 0]

    def _percentile(data: list[float], p: float) -> float:
        if not data:
            return 0.0
        data = sorted(data)
        idx = p / 100 * (len(data) - 1)
        lo, hi = int(idx), min(int(idx) + 1, len(data) - 1)
        return data[lo] + (data[hi] - data[lo]) * (idx - lo)

    lo_val = _percentile(valid, missing_pct_lo * 100) if valid else 0.0
    hi_val = _percentile(valid, missing_pct_hi * 100) if valid else 1.0

    filled = [
        math.log1p(v) if (v is not None and v > 0)
        else rng.uniform(lo_val, max(lo_val, hi_val))
        for v in values
    ]

    mn, mx = min(filled), max(filled)
    if mx == mn:
        return [0.5] * len(filled)
    return [(x - mn) / (mx - mn) for x in filled]


def compute_scores(squads: list[dict], transfers: dict[str, float],
                   rng: random.Random) -> list[float]:
    """Compute 0–1 financial score for each squad in a league."""
    vols = [_fuzzy_match(s["name"], transfers) for s in squads]
    caps = [(s.get("venue") or {}).get("capacity") for s in squads]

    transfer_scores = _log_scores(vols, 0.0, 0.25, rng)
    capacity_scores = _log_scores(caps, 0.15, 0.40, rng)

    return [0.60 * t + 0.40 * c for t, c in zip(transfer_scores, capacity_scores)]

# ─── follower estimation ──────────────────────────────────────────────────────

def estimate_followers(squad: dict, country_iso: str | None, score: float,
                       league_slug: str, anchors: list[tuple[float, int]],
                       follower_index: dict[str, dict], rng: random.Random) -> int:
    """
    anchors: list of (score, follower_count) for known clubs in this league, sorted by score.
    """
    # 1. Try direct match — use real value with tiny noise
    match = match_followers(squad["name"], country_iso, follower_index)
    if match:
        noise = rng.uniform(0.97, 1.03)
        return max(1_000, int(match["total2024"] * noise))

    # 2. Log-interpolate from league anchors
    if len(anchors) >= 2:
        # Find surrounding anchors by score
        below = [(s, f) for s, f in anchors if s <= score]
        above = [(s, f) for s, f in anchors if s > score]

        if below and above:
            lo_s, lo_f = below[-1]
            hi_s, hi_f = above[0]
            t = (score - lo_s) / (hi_s - lo_s) if hi_s != lo_s else 0.5
            log_est = math.log(lo_f) + t * (math.log(hi_f) - math.log(lo_f))
            noise = rng.uniform(0.55, 1.45)
            return max(5_000, int(math.exp(log_est) * noise))
        elif below:
            # Below all anchors — extrapolate downward
            lo_s, lo_f = below[-1]
            ratio = (score / lo_s) if lo_s > 0 else 0.3
            est = lo_f * (ratio ** 2.5)
            noise = rng.uniform(0.5, 1.5)
            return max(5_000, int(est * noise))
        else:
            # Above all anchors — extrapolate upward
            hi_s, hi_f = above[0]
            ratio = (score / hi_s) if hi_s > 0 else 1.0
            est = hi_f * ratio
            noise = rng.uniform(0.8, 1.2)
            return int(est * noise)

    # 3. Fallback range for leagues with no anchors (Serie B / C)
    lo, hi = FALLBACK_FOLLOWERS.get(league_slug, (50_000, 2_000_000))
    est = lo + (hi - lo) * (score ** 1.4)
    noise = rng.uniform(0.5, 1.5)
    return max(lo // 2, int(est * noise))

# ─── revenue computation ──────────────────────────────────────────────────────

def _band_value(bands: dict, score: float, rng: random.Random,
                power: float = 1.0, noise_range: float = 0.0) -> int:
    """
    Map a 0–1 score into a financial band {low, mid, high, elite}.
    power > 1 amplifies the top end (use for commercial).
    noise_range adds per-club randomness (0.15 = ±15%).
    """
    lo  = bands["low"]
    mid = bands["mid"]
    hi  = bands["high"]
    eli = bands["elite"]

    s = score ** power  # apply curve

    if s <= 0.33:
        t = s / 0.33
        value = lo + (mid - lo) * t
    elif s <= 0.66:
        t = (s - 0.33) / 0.33
        value = mid + (hi - mid) * t
    else:
        t = (s - 0.66) / 0.34
        value = hi + (eli - hi) * t

    if noise_range > 0:
        value *= rng.uniform(1.0 - noise_range, 1.0 + noise_range)

    return int(value)


def compute_finances(squad: dict, score: float, league_slug: str,
                     bands: dict, followers: int, rng: random.Random) -> dict:
    rev = bands["revenue"]

    broadcasting  = _band_value(rev["broadcasting"], score, rng,
                                power=1.0, noise_range=0.08)
    commercial    = _band_value(rev["commercial"], score, rng,
                                power=2.0, noise_range=0.25)
    total         = broadcasting + commercial

    budget = int(total * rng.uniform(0.80, 0.90))

    return {
        "score":          round(score, 4),
        "broadcasting":   broadcasting,
        "commercial":     commercial,
        "total":          total,
        "budget":         budget,
        "followers":      followers,
    }

# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    rng = random.Random(42)

    transfers      = load_transfers()
    all_followers  = load_followers()
    fin_bands      = load_financial_bands()
    squads_by_lg   = load_squads_by_league()
    follower_index = build_follower_index(all_followers)

    total_written = 0

    for league_slug, squads in sorted(squads_by_lg.items()):
        fin_key = SLUG_TO_FIN_KEY.get(league_slug)
        if fin_key not in fin_bands:
            print(f"  ⚠ No financial bands for {league_slug} — skipping")
            continue

        bands = fin_bands[fin_key]

        # Compute per-club financial scores
        scores = compute_scores(squads, transfers, rng)

        # Build follower anchors for this league:
        # For each squad that matches a known follower entry, record (score, followers)
        iso = COUNTRY_TO_ISO.get(
            next((s.get("country") for s in squads if s.get("country")), ""),
            None
        )
        anchors: list[tuple[float, int]] = []
        for squad, score in zip(squads, scores):
            club_iso = COUNTRY_TO_ISO.get(squad.get("country") or "", iso)
            match = match_followers(squad["name"], club_iso, follower_index)
            if match:
                anchors.append((score, match["total2024"]))
        anchors.sort(key=lambda x: x[0])

        print(f"\n  {league_slug}  ({len(squads)} clubs, {len(anchors)} follower anchors)")

        for squad, score in zip(squads, scores):
            club_iso = COUNTRY_TO_ISO.get(squad.get("country") or "", iso)
            followers = estimate_followers(
                squad, club_iso, score, league_slug, anchors, follower_index, rng
            )
            finances = compute_finances(squad, score, league_slug, bands, followers, rng)

            # Remove legacy money field; add finances
            squad.pop("money", None)
            squad["finances"] = finances

            path: Path = squad.pop("_path")
            # Write back — strip internal key before serialising
            out = {k: v for k, v in squad.items() if not k.startswith("_")}
            with open(path, "w", encoding="utf-8") as f:
                json.dump(out, f, indent=2, ensure_ascii=False)

            total_written += 1
            print(f"    {squad['name']:<28} score={score:.2f}  "
                  f"commercial={finances['commercial']//1_000_000:>4}M  "
                  f"followers={finances['followers']//1_000:>7}K")

    print(f"\nDone — {total_written} squads enriched.")


if __name__ == "__main__":
    main()
