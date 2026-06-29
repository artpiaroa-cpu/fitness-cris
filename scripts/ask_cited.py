# /// script
# requires-python = ">=3.10"
# dependencies = ["notebooklm-py>=0.7"]
# ///
"""Ask your NotebookLM coach a question and print the real citations.

Every answer is grounded in the videos you loaded. The output is the answer
followed by the actual source video titles and the exact passages the model
cited — proof the engine is reading Jeff's content, not making things up.

Examples
--------
  uv run scripts/ask_cited.py \
      "How much training volume does Jeff recommend per muscle per week?"

  # JSON for the coach skill to consume
  uv run scripts/ask_cited.py --json "Best rep range for hypertrophy?"

Notebook id resolution: --notebook, then $NOTEBOOKLM_ID, then .notebooklm-id.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


async def _ask(args: argparse.Namespace) -> int:
    try:
        from notebooklm import NotebookLMClient
    except ImportError:
        sys.exit(
            "notebooklm-py is required. Run via uv:\n"
            "  uv run scripts/ask_cited.py \"your question\"\n"
        )

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _nlm_common import resolve_notebook_id

    notebook_id = resolve_notebook_id(args.notebook)
    source_ids = args.source.split(",") if args.source else None

    async with NotebookLMClient.from_storage() as client:
        result = await client.chat.ask(
            notebook_id, args.question, source_ids=source_ids
        )
        # Map source_id -> human title so citations show video names.
        titles: dict[str, str] = {}
        try:
            for s in await client.sources.list(notebook_id):
                titles[s.id] = s.title or "(untitled source)"
        except Exception:  # noqa: BLE001 - titles are a nicety, not required
            pass

    citations = []
    for ref in result.references:
        citations.append({
            "n": ref.citation_number,
            "source_id": ref.source_id,
            "title": titles.get(ref.source_id, ref.source_id),
            "passage": (ref.cited_text or "").strip(),
        })

    if args.json:
        print(json.dumps({
            "question": args.question,
            "answer": result.answer,
            "conversation_id": result.conversation_id,
            "citations": citations,
        }, indent=2, ensure_ascii=False))
        return 0

    print(result.answer.strip())
    if citations:
        print("\n" + "─" * 60)
        print("Sources (real Jeff videos):\n")
        # De-dupe by title for the readable view, keep first passage seen.
        seen = set()
        for c in citations:
            key = c["title"]
            if key in seen:
                continue
            seen.add(key)
            marker = f"[{c['n']}] " if c["n"] is not None else "• "
            print(f"{marker}{c['title']}")
            if c["passage"]:
                snippet = c["passage"]
                if len(snippet) > 280:
                    snippet = snippet[:277] + "…"
                print(f'    "{snippet}"')
            print()
    else:
        print("\n(No citations returned — the notebook may still be indexing, "
              "or the question wasn't answerable from the sources.)", file=sys.stderr)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("question", help="The question to ask the coach.")
    p.add_argument("--notebook", default=None, help="Notebook id (else NOTEBOOKLM_ID / .notebooklm-id).")
    p.add_argument("--source", default=None, help="Comma-separated source ids to restrict the query.")
    p.add_argument("--json", action="store_true", help="Emit structured JSON instead of prose.")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(_ask(args))


if __name__ == "__main__":
    raise SystemExit(main())
