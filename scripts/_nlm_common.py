"""Shared helpers for the NotebookLM-backed fitness coach scripts.

Resolves which NotebookLM notebook to talk to, in this order of precedence:

  1. an explicit value passed on the command line (``--notebook``)
  2. the ``NOTEBOOKLM_ID`` environment variable
  3. the first non-comment, non-empty line of ``.notebooklm-id`` (repo root)

This keeps the scripts usable both interactively and from the coach skill,
without hard-coding anyone's notebook id into the repository.
"""

from __future__ import annotations

import os
from pathlib import Path

# Repo root is the parent of the ``scripts/`` directory this file lives in.
REPO_ROOT = Path(__file__).resolve().parent.parent
ID_FILE = REPO_ROOT / ".notebooklm-id"
ENV_VAR = "NOTEBOOKLM_ID"


class NotebookNotConfigured(RuntimeError):
    """Raised when no notebook id can be resolved from any source."""


def _read_id_file(path: Path) -> str | None:
    """Return the first meaningful line of an id file, or ``None``."""
    if not path.exists():
        return None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            return line
    return None


def resolve_notebook_id(explicit: str | None = None) -> str:
    """Resolve the notebook id, raising a helpful error if none is found."""
    if explicit:
        return explicit.strip()

    env = os.environ.get(ENV_VAR)
    if env and env.strip():
        return env.strip()

    from_file = _read_id_file(ID_FILE)
    if from_file:
        return from_file

    raise NotebookNotConfigured(
        "No NotebookLM notebook id configured.\n"
        "Fix it in any of these ways:\n"
        f"  • pass --notebook <id>\n"
        f"  • export {ENV_VAR}=<id>\n"
        f"  • cp .notebooklm-id.example .notebooklm-id  "
        f"and put your id on the first line\n"
        "Create a notebook first with:  notebooklm create \"Jeff Nippard - "
        "Training Coach\""
    )
