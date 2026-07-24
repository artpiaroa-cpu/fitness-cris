"""Look up exercises in the vendored catalog and map logged lifts to muscles.

Backed by ``data/exercises.min.json`` (built by
``scripts/build_exercise_catalog.py`` from the MIT-licensed
https://github.com/hasaneyldrm/exercises-dataset).

Two jobs:

1. **Classify** a workout-log exercise name into a muscle group, so volume
   analysis is based on the dataset's real ``target`` muscle rather than
   keyword guesses. Log apps write names like ``Bench Press (Barbell)`` while
   the catalog uses ``barbell bench press``, so matching is token-based.
2. **Search** the catalog by muscle and available equipment, so the coach can
   propose exercises the user can actually perform.

Usage:
    python3 coach/exercise_catalog.py "Romanian Deadlift"
    python3 coach/exercise_catalog.py --muscle chest --equipment barbell
"""

from __future__ import annotations

import json
import re
import sys
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = REPO_ROOT / "data" / "exercises.min.json"

# The dataset's 19 `target` values collapsed into the groups a lifter programs
# around. Anything unmapped falls through to a title-cased version of target.
TARGET_TO_GROUP = {
    "pectorals": "Chest",
    "lats": "Back",
    "upper back": "Back",
    "traps": "Back",
    "spine": "Back",
    "levator scapulae": "Neck",
    "delts": "Shoulders",
    "biceps": "Biceps",
    "triceps": "Triceps",
    "forearms": "Forearms",
    "quads": "Quads",
    "hamstrings": "Hamstrings",
    "glutes": "Glutes",
    "adductors": "Adductors",
    "abductors": "Abductors",
    "calves": "Calves",
    "abs": "Abs",
    "serratus anterior": "Chest",
    "cardiovascular system": "Cardio",
}

# Tokens that carry no matching signal — dropped before comparing names.
# Includes camera/gender qualifiers the dataset appends to some variants
# ("(back pov)", "(female)") which would otherwise dilute a match.
STOPWORDS = {"the", "a", "with", "and", "on", "to", "of", "up", "version",
             "pov", "female", "male", "side", "front view"}


def _stem(token: str) -> str:
    """Crude singularization so 'biceps'/'bicep' and 'thrusts'/'thrust' match."""
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _normalize(name: str) -> list[str]:
    """Lowercase, strip punctuation/parens, split into meaningful stems."""
    text = name.lower()
    text = re.sub(r"[()\[\],./\\-]", " ", text)
    return [_stem(t) for t in text.split() if t and t not in STOPWORDS]


@lru_cache(maxsize=1)
def load_catalog() -> list[dict]:
    """Load the vendored catalog. Returns [] if it hasn't been built yet."""
    if not CATALOG_PATH.exists():
        return []
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return data.get("exercises", [])


@lru_cache(maxsize=1)
def _indexed() -> list[tuple[frozenset, dict]]:
    """Pre-tokenize every catalog name once, for fast repeated matching."""
    return [(frozenset(_normalize(ex.get("name", ""))), ex) for ex in load_catalog()]


def find_exercise(name: str, min_score: float = 0.5) -> dict | None:
    """Best catalog match for a logged exercise name, or None if too weak.

    Scores by how much of the *query* is covered by the candidate name, with a
    small penalty for candidates padded with extra words, so
    ``Bench Press (Barbell)`` prefers ``barbell bench press`` over
    ``barbell bench press with chains against bands``.
    """
    query = frozenset(_normalize(name))
    if not query:
        return None

    best: tuple[float, int, dict] | None = None
    for tokens, ex in _indexed():
        if not tokens:
            continue
        overlap = len(query & tokens)
        if not overlap:
            continue
        coverage = overlap / len(query)          # how much of the query matched
        precision = overlap / len(tokens)         # how focused the candidate is
        score = coverage * 0.7 + precision * 0.3
        extra = len(tokens - query)               # padding words in the candidate
        # Ties (e.g. "barbell bench squat" vs "barbell full squat") go to the
        # candidate carrying the fewest extra words.
        if best is None or (score, -extra) > (best[0], -best[1]):
            best = (score, extra, ex)

    if best and best[0] >= min_score:
        return best[2]
    return None


def muscle_group_for(name: str) -> str | None:
    """Map a logged exercise name to a muscle group via the catalog."""
    ex = find_exercise(name)
    if not ex:
        return None
    target = (ex.get("target") or "").lower()
    if not target:
        return None
    return TARGET_TO_GROUP.get(target, target.title())


def search(muscle: str | None = None, equipment: str | None = None,
           limit: int = 20) -> list[dict]:
    """Find exercises by muscle group and/or equipment (substring, case-free)."""
    results = []
    for ex in load_catalog():
        if muscle:
            group = TARGET_TO_GROUP.get((ex.get("target") or "").lower(), "")
            haystack = " ".join(filter(None, [
                ex.get("target", ""), ex.get("body_part", ""),
                ex.get("muscle_group", ""), group,
            ])).lower()
            if muscle.lower() not in haystack:
                continue
        if equipment and equipment.lower() not in (ex.get("equipment") or "").lower():
            continue
        results.append(ex)
        if len(results) >= limit:
            break
    return results


def _describe(ex: dict, lang: str = "es") -> str:
    steps = (ex.get("instruction_steps") or {})
    lines = steps.get(lang) or steps.get("en") or []
    head = f"{ex.get('name')}  [{ex.get('equipment')} → {ex.get('target')}]"
    body = "\n".join(f"  {i}. {s}" for i, s in enumerate(lines[:6], 1))
    return head + ("\n" + body if body else "")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)

    if args[0] in ("--muscle", "--equipment"):
        muscle = equipment = None
        for i, a in enumerate(args):
            if a == "--muscle" and i + 1 < len(args):
                muscle = args[i + 1]
            if a == "--equipment" and i + 1 < len(args):
                equipment = args[i + 1]
        for ex in search(muscle=muscle, equipment=equipment):
            print(f"- {ex['name']}  [{ex.get('equipment')} → {ex.get('target')}]")
    else:
        query = " ".join(args)
        match = find_exercise(query)
        if not match:
            print(f"No match for {query!r}")
        else:
            print(_describe(match))
            print(f"\n→ muscle group: {muscle_group_for(query)}")
