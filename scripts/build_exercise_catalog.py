# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Build a slim exercise catalog from the upstream exercises-dataset.

Source: https://github.com/hasaneyldrm/exercises-dataset (1,324 exercises)
  * Data and text instructions: MIT license.
  * Images/GIFs are © Gym visual (https://gymvisual.com/) and are NOT vendored
    here — we only keep the relative media paths so you can point at the
    upstream repo if you want them. Get your own license for commercial use.

The upstream JSON is ~17 MB because instructions ship in 10 languages. We keep
only English + Spanish and the fields the coach actually uses, which cuts it to
a size that is reasonable to commit.

Usage:
    uv run scripts/build_exercise_catalog.py                 # writes data/exercises.min.json
    uv run scripts/build_exercise_catalog.py --languages en  # English only
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
import urllib.request
from pathlib import Path

UPSTREAM = (
    "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/"
    "main/data/exercises.json"
)
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "data" / "exercises.min.json"

# Fields worth keeping. Everything else (timestamps, media ids) is dropped.
KEEP = ("id", "name", "category", "body_part", "equipment", "target",
        "secondary_muscles", "muscle_group", "image", "gif_url")


def _coerce_langs(value: object) -> dict:
    """Instructions arrive as a dict, or as a stringified Python dict."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip().startswith("{"):
        try:
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, SyntaxError):
            return {}
    return {}


def slim(record: dict, languages: tuple[str, ...]) -> dict:
    out = {k: record.get(k) for k in KEEP if record.get(k) is not None}

    steps = _coerce_langs(record.get("instruction_steps"))
    kept_steps = {lang: steps[lang] for lang in languages if lang in steps}
    if kept_steps:
        out["instruction_steps"] = kept_steps

    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", default=UPSTREAM, help="Upstream exercises.json URL.")
    p.add_argument("--output", default=str(DEFAULT_OUT), help="Where to write the slim catalog.")
    p.add_argument("--languages", default="en,es",
                   help="Comma-separated instruction languages to keep (default: en,es).")
    args = p.parse_args(argv)

    languages = tuple(l.strip() for l in args.languages.split(",") if l.strip())

    print(f"Downloading {args.url} …", file=sys.stderr)
    with urllib.request.urlopen(args.url) as resp:  # noqa: S310 - fixed https URL
        records = json.load(resp)
    print(f"  {len(records)} exercises fetched.", file=sys.stderr)

    catalog = [slim(r, languages) for r in records]

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "https://github.com/hasaneyldrm/exercises-dataset",
        "license": "Data/text: MIT. Images/GIFs: © Gym visual (not included).",
        "languages": list(languages),
        "count": len(catalog),
        "exercises": catalog,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    size_mb = out.stat().st_size / 1_048_576
    print(f"Wrote {len(catalog)} exercises to {out} ({size_mb:.1f} MB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
