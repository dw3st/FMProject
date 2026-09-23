"""
classify_trophies.py — Assign point values to every (league, country) trophy pair.

Outputs:
  data_process/to_process/api_football/trophy_classifications.json

Point tiers
-----------
Each trophy earns points based on two axes:

  LEAGUE TIER (prestige of the competition)
    5 — World elite  (UCL, Copa Libertadores, FIFA Intercontinental, FIFA World Cup)
    4 — Top domestic / major continental  (Premier League, La Liga, Serie A, Bundesliga,
        Ligue 1, Europa League, UEFA Super Cup, UEFA Euro Championship, FIFA Club World Cup,
        AFC Champions League Elite)
    3 — Strong domestic / major continental cup  (FA Cup, Copa del Rey, Coppa Italia,
        DFB-Pokal, Coupe de France, Argentine Liga, Brazilian Serie A, Copa do Brasil,
        Eredivisie, Primeira Liga, Copa America, UCL/UEL runner-up equiv., Conference League,
        AFC Champions League, CAF Africa Cup of Nations, Concacaf Gold Cup…)
    2 — Secondary domestic / notable cup  (Championship, Bundesliga 2, Ligue 2, Liga MX,
        Süper Lig, Scottish Premiership, J1 League, K League, Saudi League, Chilean Liga…)
    1 — State/regional / minor cup / friendly tournament  (Paulista, Carioca, Mineiro…)

  PLACE MULTIPLIER
    Winner    → ×1.0
    2nd Place → ×0.4

Final points = tier × place_multiplier

Run:
  python data_process/classify_trophies.py
"""

from __future__ import annotations

import json
from pathlib import Path

# ─── paths ────────────────────────────────────────────────────────────────────

DATA_PROCESS_DIR = Path(__file__).resolve().parent
TROPHIES_DIR     = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw" / "trophies"
OUT_PATH         = DATA_PROCESS_DIR / "to_process" / "api_football" / "trophy_classifications.json"

# ─── place multipliers ────────────────────────────────────────────────────────

PLACE_MULTIPLIER: dict[str, float] = {
    "Winner":    1.0,
    "2nd Place": 0.4,
}

# ─── league tier table ────────────────────────────────────────────────────────
# Key: normalized "league (country)" string → tier 1–5
# Unlisted entries default to tier 1.

LEAGUE_TIERS: dict[str, int] = {

    # ── Tier 5 — World / Continental elite ───────────────────────────────────
    "UEFA Champions League (Europe)":              5,
    "CONMEBOL Libertadores (South-America)":       5,
    "Copa Libertadores (South-America)":           5,  # alternate API name for same competition
    "FIFA Intercontinental Cup (World)":           5,
    "FIFA World Cup (World)":                      5,
    "World Cup (World)":                           5,  # alternate API name

    # ── Tier 4 — Top domestic leagues + major continental ────────────────────
    "Premier League (England)":                    4,
    "La Liga (Spain)":                             4,
    "Serie A (Italy)":                             4,
    "Bundesliga (Germany)":                        4,
    "Ligue 1 (France)":                            4,
    "UEFA Europa League (Europe)":                 4,
    "CONMEBOL Sudamericana (South-America)":       4,
    "UEFA Super Cup (Europe)":                     4,
    "UEFA European Championship (Europe)":         4,  # major international tournament
    "European Championship (Europe)":             4,  # alternate API name
    "FIFA Club World Cup (World)":                 4,  # major club world competition
    "AFC Champions League Elite (Asia)":           4,  # revamped elite Asian CL

    # ── Tier 3 — Strong domestic leagues + major cups + continental ───────────
    "FA Cup (England)":                            3,
    "League Cup (England)":                        3,
    "Community Shield (England)":                  3,
    "Copa del Rey (Spain)":                        3,
    "Super Cup (Spain)":                           3,
    "Coppa Italia (Italy)":                        3,
    "Super Cup (Italy)":                           3,
    "DFB-Pokal (Germany)":                         3,
    "DFB Pokal (Germany)":                         3,  # alternate API spelling
    "Supercup (Germany)":                          3,
    "Super Cup (Germany)":                         3,  # alternate API name
    "Coupe de France (France)":                    3,
    "Trophée des Champions (France)":              3,
    "Liga Profesional Argentina (Argentina)":      3,
    "Serie A (Brazil)":                            3,
    "Copa do Brasil (Brazil)":                     3,
    "Recopa Sudamericana (South-America)":         3,
    "CONMEBOL Copa America (South-America)":       3,
    "CONMEBOL Recopa (South-America)":             3,
    "Concacaf Champions Cup (Nc-America)":         3,
    "Eredivisie (Holland)":                        3,  # Dutch top flight (Ajax, PSV era)
    "Primeira Liga (Portugal)":                    3,  # Porto, Benfica, Sporting
    "UEFA Cup Winners' Cup (Europe)":              3,  # defunct but historically major
    "UEFA Conference League (Europe)":             3,  # UEFA's 3rd club competition
    "AFC Champions League (Asia)":                 3,  # Asian equivalent of Champions League
    "CAF Africa Cup of Nations (Africa)":          3,  # major continental championship
    "Concacaf Gold Cup (Nc-America)":              3,  # major continental championship

    # ── Tier 2 — Secondary domestic / notable leagues / cups ─────────────────
    "Championship (England)":                      2,
    "2. Bundesliga (Germany)":                     2,
    "Ligue 2 (France)":                            2,
    "Serie B (Brazil)":                            2,
    "Serie C (Brazil)":                            2,
    "Copa MX (Mexico)":                            2,
    "Liga MX (Mexico)":                            2,
    "Copa do Nordeste (Brazil)":                   2,
    "Super League (Greece)":                       2,
    "Stars League (Qatar)":                        2,
    "Ukrainian Premier League (Ukraine)":          2,
    "MLS Cup (United-States)":                     2,
    "ISL (India)":                                 2,
    "Indian Super League (India)":                 2,  # alternate API name
    "Chinese Super League (China-Pr)":             2,
    "LigaPro (Ecuador)":                           2,
    "Liga Pro (Ecuador)":                          2,  # alternate API name
    "Nc-America Champions Cup (Nc-America)":       2,
    "Süper Lig (Turkey)":                          2,  # Turkish top flight
    "First Division A (Belgium)":                  2,  # Belgian top flight
    "Allsvenskan (Sweden)":                        2,  # Swedish top flight
    "Premiership (Scotland)":                      2,  # Scottish top flight
    "Scottish Cup (Scotland)":                     2,
    "League Cup (Scotland)":                       2,
    "J1 League (Japan)":                           2,  # Japanese top flight
    "K League 1 (Korea-Republic)":                 2,  # Korean top flight
    "Saudi League (Saudi-Arabia)":                 2,  # major league (post-2023 investment)
    "Copa Argentina (Argentina)":                  2,  # Argentine domestic cup
    "Taça de Portugal (Portugal)":                 2,  # Portuguese cup
    "Taça da Liga (Portugal)":                     2,  # Portuguese league cup
    "Super Cup (Portugal)":                        2,
    "Bundesliga (Austria)":                        2,  # Austrian top flight
    "Supercopa do Brasil (Brazil)":                2,  # Brazilian super cup
    "KNVB Beker (Holland)":                        2,  # Dutch cup
    "Primera División (Chile)":                    2,  # Chilean top flight
    "Copa Chile (Chile)":                          2,
    "Ekstraklasa (Poland)":                        2,  # Polish top flight
    "HNL (Croatia)":                               2,  # Croatian top flight
    "Coupe de la Ligue (France)":                  2,  # abolished 2020, was secondary cup
    "King's Cup (Saudi-Arabia)":                   2,
    "Crown Prince Cup (Saudi-Arabia)":             2,

    # ── Tier 1 — State/regional / friendly / minor (default for unlisted) ────
    # Explicitly listed for clarity; unknown leagues also default here.
    "Paulista A1 (Brazil)":                        1,
    "Carioca Série A (Brazil)":                    1,
    "Mineiro 1 (Brazil)":                          1,
    "Matogrossense 1 (Brazil)":                    1,
    "Paraense A (Brazil)":                         1,
    "Goiano 1 (Brazil)":                           1,
    "Emirates Cup (World)":                        1,  # pre-season friendly
    "International Champions Cup (World)":         1,  # pre-season friendly
    "Florida Cup (World)":                         1,  # pre-season friendly
    "Audi Cup (World)":                            1,  # pre-season friendly
    "Trofeo Joan Gamper (World)":                  1,  # pre-season friendly
}

DEFAULT_TIER = 1

# ─── build classification ─────────────────────────────────────────────────────

def _trophy_key(league: str, country: str) -> str:
    return f"{league} ({country})"


def classify_all(trophies_dir: Path) -> dict:
    """
    Scan every trophy file and return a classification dict:
      {
        "tiers": { "<league> (<country>)": tier },
        "place_multipliers": { "Winner": 1.0, "2nd Place": 0.4 },
        "points": {
          "<league> (<country>)": {
            "tier": int,
            "winner_points": float,
            "runner_up_points": float
          }
        }
      }
    """
    # Collect every unique (league, country) seen in the actual data
    seen: set[str] = set()
    for f in sorted(trophies_dir.glob("*.json")):
        data = json.load(open(f, encoding="utf-8"))
        for t in data.get("response", []):
            key = _trophy_key(t.get("league", ""), t.get("country", ""))
            seen.add(key)

    points: dict[str, dict] = {}
    for key in sorted(seen):
        tier            = LEAGUE_TIERS.get(key, DEFAULT_TIER)
        winner_pts      = tier * PLACE_MULTIPLIER["Winner"]
        runner_up_pts   = tier * PLACE_MULTIPLIER["2nd Place"]
        points[key] = {
            "tier":             tier,
            "winner_points":    winner_pts,
            "runner_up_points": runner_up_pts,
        }

    return {
        "tiers":             LEAGUE_TIERS,
        "place_multipliers": PLACE_MULTIPLIER,
        "points":            points,
    }


def main() -> None:
    result = classify_all(TROPHIES_DIR)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)

    pts = result["points"]
    print(f"Classified {len(pts)} unique (league, country) pairs.")
    print("\nPoint values by tier:")
    by_tier: dict[int, list] = {}
    for key, info in sorted(pts.items()):
        by_tier.setdefault(info["tier"], []).append((key, info))
    for tier in sorted(by_tier, reverse=True):
        entries = by_tier[tier]
        print(f"\n  Tier {tier}  ({len(entries)} competitions)")
        for key, info in entries:
            print(f"    {info['winner_points']:.1f} / {info['runner_up_points']:.1f}  {key}")

    print(f"\nSaved → {OUT_PATH}")


if __name__ == "__main__":
    main()
