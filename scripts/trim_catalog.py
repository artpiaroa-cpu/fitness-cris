#!/usr/bin/env python3
"""Recorta el catálogo de ejercicios a lo que la app web realmente usa.

El dataset completo (data/exercises.min.json, ~1,8 MB) tiene 1324 ejercicios,
pero la app solo consulta los del POOL curado de web/js/catalog.js — unos 52.
Servir el fichero entero castiga la primera visita sin aportar nada, así que
publicamos solo el subconjunto emparejado.

Reproduce el mismo algoritmo de coincidencia que catalog.js (y que
coach/exercise_catalog.py): tokens con stemming ligero, puntuación por
cobertura y precisión, y desempate por menos palabras extra. Si el POOL cambia,
vuelve a ejecutar esto.

Uso:
    python3 scripts/trim_catalog.py
    python3 scripts/trim_catalog.py --check    # no escribe, solo informa
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FULL = REPO / "data" / "exercises.min.json"
POOL = REPO / "web" / "js" / "catalog.js"
OUT = REPO / "web" / "data" / "exercises.min.json"

# Mismas stopwords que catalog.js: incluyen los cualificadores de cámara y
# género que el dataset añade a algunas variantes.
STOP = {"the", "a", "with", "and", "on", "to", "of", "up", "version",
        "pov", "female", "male", "side", "front view"}


def stem(token: str) -> str:
    """Singularización burda: 'biceps'→'bicep', 'thrusts'→'thrust'."""
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def normalize(name: str) -> list[str]:
    text = re.sub(r"[()\[\],./\\-]", " ", name.lower())
    return [stem(t) for t in text.split() if t and t not in STOP]


def best_match(query: str, index: list[tuple[set, dict]], min_score: float = 0.5):
    qs = set(normalize(query))
    if not qs:
        return None
    best = None
    for tokens, ex in index:
        if not tokens:
            continue
        overlap = len(qs & tokens)
        if not overlap:
            continue
        score = (overlap / len(qs)) * 0.7 + (overlap / len(tokens)) * 0.3
        extra = len(tokens - qs)
        if best is None or (score, -extra) > (best[0], -best[1]):
            best = (score, extra, ex)
    return best[2] if best and best[0] >= min_score else None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Solo informar, sin escribir.")
    args = p.parse_args(argv)

    if not FULL.exists():
        sys.exit(f"No encuentro el catálogo completo en {FULL}")

    catalog = json.loads(FULL.read_text(encoding="utf-8"))["exercises"]
    index = [(set(normalize(e["name"])), e) for e in catalog]

    # Los nombres de consulta en inglés viven en el campo `en:` del POOL.
    queries = re.findall(r"en:\s*['\"]([^'\"]+)['\"]", POOL.read_text(encoding="utf-8"))
    if not queries:
        sys.exit(f"No he encontrado campos `en:` en {POOL}")

    kept: dict[str, dict] = {}
    missing: list[str] = []
    for q in queries:
        match = best_match(q, index)
        if match:
            kept[match["id"]] = match
        else:
            missing.append(q)

    print(f"consultas del POOL : {len(queries)}")
    print(f"emparejadas        : {len(kept)}")
    if missing:
        print(f"SIN COINCIDENCIA   : {missing}")

    if args.check:
        return 1 if missing else 0

    payload = {
        "src": "subconjunto de hasaneyldrm/exercises-dataset (MIT) usado por la app",
        "note": "Generado por scripts/trim_catalog.py. No editar a mano.",
        "count": len(kept),
        "exercises": list(kept.values()),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
                   encoding="utf-8")
    kb = os.path.getsize(OUT) / 1024
    full_kb = os.path.getsize(FULL) / 1024
    print(f"escrito {OUT.relative_to(REPO)} ({kb:.0f} KB, desde {full_kb:.0f} KB)")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
