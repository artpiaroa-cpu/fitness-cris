"""Parse a Strong app workout export and summarize training metrics.

The coach uses this to score your *actual* training — weekly volume per muscle,
training frequency, and rep ranges — against evidence-based criteria, instead of
guessing. Your data stays local; this only reads the CSV you drop at
``data/strong_workouts.csv``.

Strong's CSV export columns vary slightly by version but generally include:
    Date, Workout Name, Exercise Name, Set Order, Weight, Reps, RPE, Notes ...
The delimiter is sometimes ',' and sometimes ';' — both are handled.

Run standalone for a quick summary:
    python3 coach/strong_parser.py data/strong_workouts.csv
"""

from __future__ import annotations

import csv
import io
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# Coarse exercise-name -> muscle-group mapping. Substring match, case-insensitive.
# This is intentionally simple and editable; refine it for your own lifts.
# Order matters: more specific groups are checked first so e.g. "Romanian
# Deadlift" maps to Hamstrings before the generic "deadlift" -> Back rule.
MUSCLE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Hamstrings", ("hamstring", "leg curl", "rdl", "romanian", "good morning", "nordic")),
    ("Glutes", ("hip thrust", "glute", "bridge")),
    ("Calves", ("calf", "calves")),
    ("Quads", ("squat", "leg press", "lunge", "leg extension", "hack", "split squat")),
    ("Shoulders", ("ohp", "overhead press", "shoulder", "lateral", "delt", "face pull", "rear delt", "upright")),
    ("Triceps", ("tricep", "pushdown", "skull", "kickback", "close grip", "close-grip")),
    ("Biceps", ("curl", "bicep", "preacher", "hammer")),
    ("Chest", ("bench", "chest", "pec", "fly", "dip", "push up", "push-up", "incline press",
               "incline dumbbell", "incline barbell", "decline", "chest press")),
    ("Back", ("row", "pulldown", "pull up", "pull-up", "chin", "deadlift", "pullover", "lat")),
    ("Abs", ("crunch", "plank", "ab ", "abs", "leg raise", "rollout", "cable crunch")),
]


def classify_muscle(exercise: str) -> str:
    """Classify a logged exercise into a muscle group.

    Prefers the vendored exercise catalog (real ``target`` muscle for 1,324
    exercises); falls back to the keyword table when the catalog is missing or
    the name is too unusual to match confidently.
    """
    try:
        from exercise_catalog import muscle_group_for
    except ImportError:  # imported as a package (coach.strong_parser)
        try:
            from .exercise_catalog import muscle_group_for  # type: ignore[no-redef]
        except ImportError:
            muscle_group_for = None  # type: ignore[assignment]

    if muscle_group_for is not None:
        group = muscle_group_for(exercise)
        if group:
            return group

    name = exercise.lower()
    for muscle, keys in MUSCLE_KEYWORDS:
        if any(k in name for k in keys):
            return muscle
    return "Other"


@dataclass
class WorkoutSet:
    date: datetime
    exercise: str
    muscle: str
    weight: float
    reps: int
    rpe: float | None


@dataclass
class Summary:
    sets: list[WorkoutSet] = field(default_factory=list)

    @property
    def num_weeks(self) -> float:
        if not self.sets:
            return 0.0
        dates = [s.date for s in self.sets]
        span_days = (max(dates) - min(dates)).days
        return max(span_days / 7.0, 1.0)

    def weekly_sets_per_muscle(self) -> dict[str, float]:
        weeks = self.num_weeks
        counts: dict[str, int] = defaultdict(int)
        for s in self.sets:
            counts[s.muscle] += 1
        return {m: round(c / weeks, 1) for m, c in sorted(counts.items())}

    def sessions_per_week(self) -> float:
        days = {s.date.date() for s in self.sets}
        return round(len(days) / self.num_weeks, 1)

    def rep_range_distribution(self) -> dict[str, float]:
        buckets = {"1-5 (strength)": 0, "6-12 (hypertrophy)": 0, "13+ (endurance)": 0}
        for s in self.sets:
            if s.reps <= 5:
                buckets["1-5 (strength)"] += 1
            elif s.reps <= 12:
                buckets["6-12 (hypertrophy)"] += 1
            else:
                buckets["13+ (endurance)"] += 1
        total = sum(buckets.values()) or 1
        return {k: round(100 * v / total, 1) for k, v in buckets.items()}


def _sniff_delimiter(sample: str) -> str:
    # Strong exports use ',' or ';'. Pick whichever appears in the header.
    header = sample.splitlines()[0] if sample else ""
    return ";" if header.count(";") > header.count(",") else ","


def _to_float(value: str) -> float:
    value = (value or "").strip().replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return 0.0


def _to_int(value: str) -> int:
    return int(round(_to_float(value)))


def _parse_date(value: str) -> datetime | None:
    value = (value or "").strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def load_summary(path: str | Path) -> Summary:
    text = Path(path).read_text(encoding="utf-8-sig")
    delimiter = _sniff_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    def col(row: dict, *names: str) -> str:
        for n in names:
            for key in row:
                if key and key.strip().lower() == n.lower():
                    return row[key]
        return ""

    summary = Summary()
    for row in reader:
        date = _parse_date(col(row, "Date"))
        exercise = col(row, "Exercise Name", "Exercise").strip()
        if not date or not exercise:
            continue
        reps = _to_int(col(row, "Reps"))
        if reps <= 0:
            continue  # skip warmups / empty / non-rep entries
        weight = _to_float(col(row, "Weight", "Weight (kg)", "Weight (lbs)"))
        rpe_raw = col(row, "RPE")
        rpe = _to_float(rpe_raw) if rpe_raw.strip() else None
        summary.sets.append(WorkoutSet(
            date=date,
            exercise=exercise,
            muscle=classify_muscle(exercise),
            weight=weight,
            reps=reps,
            rpe=rpe,
        ))
    return summary


def _print_report(summary: Summary) -> None:
    if not summary.sets:
        print("No usable sets found in the export.")
        return
    print(f"Working sets parsed : {len(summary.sets)}")
    print(f"Date span           : ~{summary.num_weeks:.1f} weeks")
    print(f"Sessions / week     : {summary.sessions_per_week()}")
    print("\nWeekly sets per muscle group:")
    for muscle, n in summary.weekly_sets_per_muscle().items():
        print(f"  {muscle:12s} {n}")
    print("\nRep-range distribution (% of working sets):")
    for bucket, pct in summary.rep_range_distribution().items():
        print(f"  {bucket:20s} {pct}%")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python3 coach/strong_parser.py <path-to-strong-export.csv>")
    _print_report(load_summary(sys.argv[1]))
