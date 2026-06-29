# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "yt-dlp>=2024.0.0",
#   "notebooklm-py[browser]>=0.7",
# ]
# ///
"""Build your own NotebookLM copy of a YouTube channel's videos.

Two subcommands:

  scrape   Pull a channel's full video list into a JSON file (no login needed).
  load     Add those videos as sources to a NotebookLM notebook you own.

Examples
--------
  # a) Scrape the channel's video list
  uv run scripts/load_channel.py scrape \
      --channel "https://www.youtube.com/@JeffNippard" \
      --output /tmp/jeff-videos.json

  # b) Create the notebook (prints an id) — copy it
  notebooklm create "Jeff Nippard - Training Coach"

  # c) Load the videos into the notebook
  uv run scripts/load_channel.py load \
      --videos /tmp/jeff-videos.json \
      --notebook <notebook-id> \
      --count 300 --concurrency 1

Notes
-----
* Free NotebookLM caps a notebook at 50 sources, Plus/Pro at 300.
* Keep --concurrency at 1. Loading too fast makes videos land as empty
  "red row" failures; one-at-a-time is slower but reliable.
* ``load`` is resumable: videos already present in the notebook (matched by
  URL or video id) are skipped, so you can re-run after a failure.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# scrape
# ---------------------------------------------------------------------------

def _normalize_channel_url(channel: str) -> str:
    """Point yt-dlp at the channel's full 'Videos' tab."""
    channel = channel.strip().rstrip("/")
    if channel.endswith(("/videos", "/streams", "/shorts")):
        return channel
    return channel + "/videos"


def cmd_scrape(args: argparse.Namespace) -> int:
    try:
        from yt_dlp import YoutubeDL
    except ImportError:
        sys.exit(
            "yt-dlp is required for scraping. Run via uv:\n"
            "  uv run scripts/load_channel.py scrape ...\n"
            "or install it:  uv tool install yt-dlp"
        )

    url = _normalize_channel_url(args.channel)
    print(f"Scraping video list from: {url}", file=sys.stderr)

    ydl_opts = {
        "extract_flat": "in_playlist",  # don't resolve each video, just list
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
    }
    if args.count:
        ydl_opts["playlistend"] = args.count

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    entries = _flatten_entries(info)
    videos = []
    seen = set()
    for e in entries:
        if not e:
            continue
        vid = e.get("id")
        if not vid or vid in seen:
            continue
        seen.add(vid)
        video_url = e.get("url") or f"https://www.youtube.com/watch?v={vid}"
        if video_url.startswith("/") or "watch?v=" not in video_url and "youtu" not in video_url:
            video_url = f"https://www.youtube.com/watch?v={vid}"
        videos.append({
            "id": vid,
            "title": e.get("title") or "(untitled)",
            "url": video_url,
        })

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(videos, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(videos)} videos to {out}", file=sys.stderr)
    return 0


def _flatten_entries(info: dict) -> list:
    """Channels can nest entries (e.g. tabs/playlists). Flatten to videos."""
    if not info:
        return []
    entries = info.get("entries")
    if entries is None:
        return [info]
    flat = []
    for e in entries:
        if e and e.get("entries") is not None:
            flat.extend(_flatten_entries(e))
        else:
            flat.append(e)
    return flat


# ---------------------------------------------------------------------------
# load
# ---------------------------------------------------------------------------

def _video_id_from_url(url: str | None) -> str | None:
    if not url:
        return None
    if "watch?v=" in url:
        return url.split("watch?v=", 1)[1].split("&", 1)[0]
    if "youtu.be/" in url:
        return url.split("youtu.be/", 1)[1].split("?", 1)[0]
    if "/shorts/" in url:
        return url.split("/shorts/", 1)[1].split("?", 1)[0]
    return None


async def _load(args: argparse.Namespace) -> int:
    try:
        from notebooklm import NotebookLMClient, SourceStatus
    except ImportError:
        sys.exit(
            "notebooklm-py is required for loading. Run via uv:\n"
            "  uv run scripts/load_channel.py load ...\n"
        )

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _nlm_common import resolve_notebook_id

    notebook_id = resolve_notebook_id(args.notebook)
    videos = json.loads(Path(args.videos).read_text(encoding="utf-8"))
    if args.count:
        videos = videos[: args.count]

    async with NotebookLMClient.from_storage() as client:
        # Figure out what's already there so re-runs skip finished work.
        existing = await client.sources.list(notebook_id)
        existing_ids = set()
        for s in existing:
            vid = _video_id_from_url(s.url)
            if vid:
                existing_ids.add(vid)
        print(
            f"Notebook {notebook_id[:12]}… already has {len(existing)} sources.",
            file=sys.stderr,
        )

        todo = [v for v in videos if v["id"] not in existing_ids]
        print(
            f"{len(todo)} videos to add ({len(videos) - len(todo)} already present).",
            file=sys.stderr,
        )

        sem = asyncio.Semaphore(max(1, args.concurrency))
        ok = 0
        failed: list[dict] = []
        done = 0
        total = len(todo)

        async def add_one(v: dict) -> None:
            nonlocal ok, done
            async with sem:
                try:
                    src = await client.sources.add_url(
                        notebook_id, v["url"], wait=True, wait_timeout=args.timeout
                    )
                    status = getattr(src, "status", None)
                    if status == SourceStatus.ERROR:
                        failed.append(v)
                        mark = "ERR "
                    else:
                        ok += 1
                        mark = "ok  "
                except Exception as exc:  # noqa: BLE001 - report and continue
                    failed.append({**v, "error": str(exc)})
                    mark = "FAIL"
                finally:
                    done += 1
                    print(f"  [{done}/{total}] {mark} {v['title'][:70]}", file=sys.stderr)

        # With concurrency 1 (recommended) this is effectively sequential.
        await asyncio.gather(*(add_one(v) for v in todo))

        print(f"\nDone. {ok} added, {len(failed)} failed.", file=sys.stderr)
        if failed:
            fpath = Path(args.videos).with_suffix(".failed.json")
            fpath.write_text(json.dumps(failed, indent=2, ensure_ascii=False), encoding="utf-8")
            print(
                f"Re-run the same load command to retry the {len(failed)} failures "
                f"(saved to {fpath}).",
                file=sys.stderr,
            )
        return 0 if not failed else 1


def cmd_load(args: argparse.Namespace) -> int:
    return asyncio.run(_load(args))


# ---------------------------------------------------------------------------
# cli
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("scrape", help="Scrape a channel's video list into JSON.")
    s.add_argument("--channel", required=True, help="Channel URL, e.g. https://www.youtube.com/@JeffNippard")
    s.add_argument("--output", required=True, help="Where to write the videos JSON.")
    s.add_argument("--count", type=int, default=0, help="Optional cap on how many videos to scrape (0 = all).")
    s.set_defaults(func=cmd_scrape)

    l = sub.add_parser("load", help="Load scraped videos into a NotebookLM notebook.")
    l.add_argument("--videos", required=True, help="Path to the JSON produced by 'scrape'.")
    l.add_argument("--notebook", default=None, help="Notebook id (else NOTEBOOKLM_ID / .notebooklm-id).")
    l.add_argument("--count", type=int, default=0, help="Max videos to load (0 = all). Free caps at 50, Plus/Pro at 300.")
    l.add_argument("--concurrency", type=int, default=1, help="Parallel uploads. Keep at 1 for reliability.")
    l.add_argument("--timeout", type=float, default=300.0, help="Per-video processing wait, seconds.")
    l.set_defaults(func=cmd_load)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
