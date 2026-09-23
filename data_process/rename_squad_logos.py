"""
Sync to_process/squads_logos/<league_dir>/ to {to_slug(team_name)}.{ext} using
API teams in to_process/api_football/raw/teams (same slugs as pipeline.py).

Primary source: src/Data/logos/<league_slug>/{team_id}.{svg|png} from the last pipeline run.
Fallback: match remaining messy filenames in the league folder (football-logos.cc names, etc.).

Run from repo root: python data_process/rename_squad_logos.py
"""

from __future__ import annotations

import difflib
import json
import re
import shutil
from pathlib import Path

import pipeline as pl


def logo_key_from_path(p: Path) -> str:
    stem = p.stem
    stem = re.sub(r"\.football-logos\.cc$", "", stem)
    return pl._name_key(stem)


def build_dir_logo_map(src_dir: Path) -> dict[str, Path]:
    m: dict[str, Path] = {}
    for p in src_dir.iterdir():
        if not p.is_file() or p.suffix.lower() not in (".svg", ".png"):
            continue
        if p.name.startswith(".rename_tmp_"):
            continue
        k = logo_key_from_path(p)
        existing = m.get(k)
        if existing is None or (existing.suffix.lower() == ".png" and p.suffix.lower() == ".svg"):
            m[k] = p
    return m


def pick_src_for_team(
    name: str,
    logo_map: dict[str, Path],
    used_paths: set[Path],
) -> Path | None:
    nk = pl._name_key(name)
    if nk in logo_map:
        p = logo_map[nk]
        if p not in used_paths:
            return p
    available_keys = [k for k in logo_map if logo_map[k] not in used_paths]
    if not available_keys:
        return None
    for cutoff in (0.6, 0.55, 0.5, 0.45):
        close = difflib.get_close_matches(nk, available_keys, n=1, cutoff=cutoff)
        if close:
            return logo_map[close[0]]
    return None


def sync_league(league_slug: str, dir_name: str) -> tuple[int, list[str]]:
    """
    Returns (files_written, missing_messages).
    """
    src_dir = pl.LOGOS_SRC_DIR / dir_name
    if not src_dir.is_dir():
        return 0, [f"{league_slug}: missing dir {dir_name}"]

    fname = pl.LEAGUE_API_FILES.get(league_slug)
    if not fname:
        return 0, [f"{league_slug}: no API file mapping"]

    teams_path = pl.API_TEAMS_DIR / fname
    if not teams_path.exists():
        return 0, [f"{league_slug}: {teams_path.name} not found"]

    data = json.loads(teams_path.read_text(encoding="utf-8"))
    gen_dir = pl.OUTPUT_LOGOS_DIR / league_slug

    # Snapshot messy names before we overwrite (for fallback)
    logo_map = build_dir_logo_map(src_dir)
    used_paths: set[Path] = set()
    written: list[Path] = []
    missing: list[str] = []

    for item in data.get("response", []):
        t = item["team"]
        name = t["name"]
        tid = t["id"]
        slug = pl.to_slug(name)

        dest: Path | None = None
        for ext in (".svg", ".png"):
            g = gen_dir / f"{tid}{ext}"
            if g.is_file():
                dest = src_dir / f"{slug}{ext}"
                shutil.copy2(g, dest)
                written.append(dest)
                break

        if dest is not None:
            continue

        src = pick_src_for_team(name, logo_map, used_paths)
        if src is None:
            missing.append(f"{league_slug}: {name} (no logo in {gen_dir.name} and no local match)")
            continue
        used_paths.add(src)
        dest = src_dir / f"{slug}{src.suffix}"
        if src.resolve() != dest.resolve():
            if dest.exists():
                dest.unlink()
            shutil.move(str(src), str(dest))
        written.append(dest)

    # Remove anything that is not a slug-named file we just wrote
    expected_names = {p.name for p in written}
    for p in list(src_dir.iterdir()):
        if not p.is_file():
            continue
        if p.suffix.lower() not in (".svg", ".png"):
            continue
        if p.name in expected_names:
            continue
        p.unlink()

    return len(written), missing


def main() -> None:
    total = 0
    all_missing: list[str] = []
    for league_slug, dir_name in pl.LEAGUE_LOGO_DIRS.items():
        n, miss = sync_league(league_slug, dir_name)
        total += n
        all_missing.extend(miss)
    print(f"Wrote {total} club logo files under {pl.LOGOS_SRC_DIR.name} (slug filenames).")
    if all_missing:
        print(f"Warnings ({len(all_missing)}):")
        for m in all_missing:
            print(f"  - {m}")


if __name__ == "__main__":
    main()
