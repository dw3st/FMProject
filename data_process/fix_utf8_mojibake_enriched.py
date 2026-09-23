"""
Repair UTF-8 mis-decoded as Latin-1 in API-Football enriched JSON (mojibake).

Walks data_process/to_process/api_football/enriched/**/*.json and rewrites string
values where latin-1 → utf-8 round-trip succeeds (e.g. "DodÃ´" → "Dodô").

Run:
  python data_process/fix_utf8_mojibake_enriched.py
"""

from __future__ import annotations

import json
from pathlib import Path

ENRICHED_DIR = Path(__file__).resolve().parent / "to_process" / "api_football" / "enriched"


def fix_mojibake(s: str) -> str:
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


def walk(obj: object) -> object:
    if isinstance(obj, dict):
        return {k: walk(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(x) for x in obj]
    if isinstance(obj, str):
        return fix_mojibake(obj)
    return obj


def main() -> None:
    changed_files = 0
    total_paths = 0
    for path in sorted(ENRICHED_DIR.rglob("*.json")):
        total_paths += 1
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        fixed = walk(data)
        if fixed != data:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(fixed, f, ensure_ascii=False, indent=2)
            changed_files += 1
    print(f"Scanned {total_paths} JSON files under {ENRICHED_DIR}")
    print(f"Rewrote {changed_files} files with mojibake fixes")


if __name__ == "__main__":
    main()
