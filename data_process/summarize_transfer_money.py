"""
Summarize money movement from API-Football raw transfer JSON files.

Reads: data_process/to_process/api_football/raw/transfers/*.json

Each transfer has teams.out (seller) and teams.in (buyer) and a `type` string
(€ 250K, € 3M, Loan, Free, …). Parsed EUR fees are attributed as:
  - buyer (in):  spend
  - seller (out): income

Transfers appear in more than one team's file; we dedupe by
(player_id, date, out_id, in_id).

Run:
  python data_process/summarize_transfer_money.py
  python data_process/summarize_transfer_money.py --csv transfer_summary.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

DATA_PROCESS_DIR = Path(__file__).resolve().parent
TRANSFERS_DIR = DATA_PROCESS_DIR / "to_process" / "api_football" / "raw" / "transfers"


def _json_has_api_errors(data: dict) -> bool:
    err = data.get("errors")
    if not err:
        return False
    if isinstance(err, dict) and len(err) == 0:
        return False
    if isinstance(err, list) and len(err) == 0:
        return False
    return True


def parse_fee_eur(type_str: str | None) -> float | None:
    """Return fee in EUR, or None if free/loan/unknown."""
    if not type_str:
        return None
    t = type_str.strip()
    low = t.lower()
    if low in ("free", "loan", "n/a", "swap", "-", ""):
        return None
    if "loan" in low and not re.search(r"[€$]\s*[\d]", t):
        return None

    m = re.search(
        r"[€$]\s*([\d][\d.,]*)\s*([kKmMbB])?",
        t.replace("\u00a0", " "),
    )
    if not m:
        m = re.search(r"([\d][\d.,]*)\s*([kKmMbB])\b", t)
        if not m:
            return None

    raw = m.group(1)
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw and raw.count(",") == 1 and len(raw.split(",")[-1]) <= 2:
        raw = raw.replace(",", ".")
    else:
        raw = raw.replace(",", "")

    try:
        val = float(raw)
    except ValueError:
        return None

    suf = (m.group(2) or "").lower()
    mult = {"k": 1e3, "m": 1e6, "b": 1e9}.get(suf, 1.0)
    return val * mult


def load_transfers() -> tuple[dict[int, dict], set[tuple[int, str, int, int]]]:
    """
    Returns (per_club aggregates, seen_keys for dedupe).
    Each club: name, spend, income, fees_parsed, transfers_no_fee.
    """
    clubs: dict[int, dict] = {}
    seen: set[tuple[int, str, int, int]] = set()

    def ensure(cid: int, name: str) -> None:
        if cid not in clubs:
            clubs[cid] = {
                "id": cid,
                "name": name,
                "spend_eur": 0.0,
                "income_eur": 0.0,
                "transfers_with_fee": 0,
                "transfers_no_parsed_fee": 0,
            }

    paths = sorted(TRANSFERS_DIR.glob("*.json")) if TRANSFERS_DIR.exists() else []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if _json_has_api_errors(data):
            continue

        for row in data.get("response", []):
            pid = row.get("player", {}).get("id")
            if pid is None:
                continue
            for tr in row.get("transfers", []):
                teams = tr.get("teams") or {}
                tin = teams.get("in") or {}
                tout = teams.get("out") or {}
                iid = tin.get("id")
                oid = tout.get("id")
                if iid is None or oid is None:
                    continue
                iid, oid = int(iid), int(oid)
                date = str(tr.get("date") or "")
                key = (int(pid), date, oid, iid)
                if key in seen:
                    continue
                seen.add(key)

                fee = parse_fee_eur(tr.get("type"))
                in_name = str(tin.get("name") or f"team_{iid}")
                out_name = str(tout.get("name") or f"team_{oid}")

                ensure(iid, in_name)
                ensure(oid, out_name)

                if fee is not None and fee > 0:
                    clubs[iid]["spend_eur"] += fee
                    clubs[oid]["income_eur"] += fee
                    clubs[iid]["transfers_with_fee"] += 1
                    clubs[oid]["transfers_with_fee"] += 1
                else:
                    clubs[iid]["transfers_no_parsed_fee"] += 1
                    clubs[oid]["transfers_no_parsed_fee"] += 1

    return clubs, seen


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize transfer fees from raw API-Football JSON.")
    parser.add_argument(
        "--csv",
        metavar="FILE",
        help="Write CSV to this path",
    )
    parser.add_argument(
        "--sort",
        choices=["net", "volume", "spend", "income", "name"],
        default="volume",
        help="Sort clubs by column (default: volume = spend+income)",
    )
    args = parser.parse_args()

    if not TRANSFERS_DIR.exists():
        print(f"No directory: {TRANSFERS_DIR}")
        return

    clubs, n_seen = load_transfers()
    print(f"Transfers dir: {TRANSFERS_DIR}")
    print(f"Unique transfer events (deduped): {len(n_seen)}")
    print(f"Clubs with activity: {len(clubs)}")
    print()
    print(
        "Cumulative over all transfers in your files (historical; not one season). "
        "Fees parsed from `type` when it looks like €/$. "
        "Loan/Free/N/A / unparseable → no fee (no$ column)."
    )
    print()

    rows: list[dict] = []
    for c in clubs.values():
        spend = c["spend_eur"]
        inc = c["income_eur"]
        net = inc - spend
        vol = spend + inc
        rows.append({
            "id": c["id"],
            "name": c["name"],
            "spend_eur": spend,
            "income_eur": inc,
            "net_eur": net,
            "volume_eur": vol,
            "with_fee": c["transfers_with_fee"],
            "no_fee": c["transfers_no_parsed_fee"],
        })

    sort_key = {
        "net": lambda r: r["net_eur"],
        "volume": lambda r: r["volume_eur"],
        "spend": lambda r: r["spend_eur"],
        "income": lambda r: r["income_eur"],
        "name": lambda r: r["name"].lower(),
    }[args.sort]
    rows.sort(key=sort_key, reverse=args.sort != "name")

    # Console table (top 30 by sort)
    hdr = f"{'id':>6}  {'club':<28}  {'spend_€M':>10}  {'in_€M':>10}  {'net_€M':>10}  {'vol_€M':>10}  {'w/fee':>6}  {'no$':>6}"
    print(hdr)
    print("-" * len(hdr))
    for r in rows[:30]:
        print(
            f"{r['id']:>6}  {r['name'][:28]:<28}  "
            f"{r['spend_eur']/1e6:>10.2f}  {r['income_eur']/1e6:>10.2f}  {r['net_eur']/1e6:>10.2f}  "
            f"{r['volume_eur']/1e6:>10.2f}  {r['with_fee']:>6}  {r['no_fee']:>6}"
        )
    if len(rows) > 30:
        print(f"... {len(rows) - 30} more clubs (use --csv for full list)")

    if args.csv:
        out = Path(args.csv)
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f,
                fieldnames=[
                    "id", "name", "spend_eur", "income_eur", "net_eur", "volume_eur",
                    "transfer_events_with_parsed_fee", "transfer_events_no_parsed_fee",
                ],
            )
            w.writeheader()
            for r in sorted(rows, key=lambda x: x["name"]):
                w.writerow({
                    "id": r["id"],
                    "name": r["name"],
                    "spend_eur": round(r["spend_eur"], 2),
                    "income_eur": round(r["income_eur"], 2),
                    "net_eur": round(r["net_eur"], 2),
                    "volume_eur": round(r["volume_eur"], 2),
                    "transfer_events_with_parsed_fee": r["with_fee"],
                    "transfer_events_no_parsed_fee": r["no_fee"],
                })
        print(f"\nWrote {out} ({len(rows)} clubs).")


if __name__ == "__main__":
    main()
