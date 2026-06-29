# fitness-cris — your own AI training coach, grounded in Jeff Nippard

A small toolkit that turns a YouTube channel (by default
[@JeffNippard](https://www.youtube.com/@JeffNippard)) into a personal,
**citation-backed** strength & hypertrophy coach.

It works by building your own [NotebookLM](https://notebooklm.google.com)
notebook from the channel's videos, then querying it so every piece of advice
comes with the **real video title and the exact passage** it's based on — no
hallucinated training claims. Open the folder in Claude Code and say
`interview me to get jacked` for a full consultation that writes you a program.

> You can only query notebooks your own Google account owns, so the setup below
> builds *your* copy of the content. It stays in your NotebookLM account; your
> lifting history (if you add it) never leaves your machine.

---

## What's in here

| Path | What it does |
| --- | --- |
| `scripts/load_channel.py` | `scrape` a channel's video list, then `load` the videos into your notebook |
| `scripts/ask_cited.py` | Ask the notebook a question, print the answer + real citations |
| `coach/strong_parser.py` | Summarize your Strong app export (weekly volume, frequency, rep ranges) |
| `.claude/skills/get-jacked/` | The `interview me to get jacked` coaching skill for Claude Code |
| `.notebooklm-id.example` | Template for storing your notebook id |
| `data/strong_workouts.example.csv` | Example of the Strong export format |

---

## 01 · Install the tooling

Install [uv](https://docs.astral.sh/uv/) (a clean Python tool installer), then
the two NotebookLM CLIs:

```bash
# Install uv (Mac/Linux)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Then the two NotebookLM tools
uv tool install notebooklm-mcp-cli
uv tool install "notebooklm-py[browser]"
uvx --from "notebooklm-py[browser]" playwright install chromium
```

On Windows PowerShell, install uv with `irm https://astral.sh/uv/install.ps1 | iex` instead.

> If a command says "not found" right after installing, close the terminal and
> open a new one — your PATH just needs a refresh.

## 02 · Log into NotebookLM (twice)

The **read** tool (`nlm`) and the **write** tool (`notebooklm`) are separate
projects with separate logins. Run each and complete the Google window — **use
the same account for both**:

```bash
nlm login          # read side. Lasts ~20 minutes.
notebooklm login   # write side. Lasts weeks.
nlm notebook list  # [] means "logged in, no notebooks yet"
```

> Burn this in: the `nlm` (read) login only lasts ~20 minutes. When the coach
> later says "authentication expired," that's not a bug — just run `nlm login`
> (or `notebooklm login`) again.

## 03 · Load the videos into a notebook

This builds your own copy of Jeff's content. From inside this folder:

```bash
# a) Scrape the channel's video list
uv run scripts/load_channel.py scrape \
  --channel "https://www.youtube.com/@JeffNippard" \
  --output /tmp/jeff-videos.json

# b) Create the notebook — it prints an id. COPY IT.
notebooklm create "Jeff Nippard - Training Coach"

# c) Load the videos (paste the id below)
uv run scripts/load_channel.py load \
  --videos /tmp/jeff-videos.json \
  --notebook <notebook-id> \
  --count 300 --concurrency 1
```

> Free NotebookLM caps a notebook at **50** sources, Plus/Pro at **300**. On
> free, change `--count 300` to `--count 50`. Keep `--concurrency 1` — loading
> too fast makes videos fail as empty red rows. Let it finish indexing before
> you query. `load` is resumable: re-run the same command to retry any failures.

## 04 · Point the coach at your notebook

Save your notebook id so the scripts and coach use it automatically:

```bash
cp .notebooklm-id.example .notebooklm-id
```

Open `.notebooklm-id` and replace the placeholder line with just your notebook
id. Save. (Or `export NOTEBOOKLM_ID=<your-id>`.)

## 05 · Prove the citations are real

The moment of truth:

```bash
uv run scripts/ask_cited.py \
  "How much training volume does Jeff recommend per muscle per week?"
```

You'll get an answer followed by real Jeff video titles and the exact passages
he said. If you see that, the engine works.

## 06 · Use your coach

Open the folder in Claude Code and say:

```
› interview me to get jacked
```

It runs a real consultation — one question at a time, conversational, not a
form. It walks through training volume, exercise selection, progression, and
frequency, citing a real Jeff video for every principle, then writes you a
program (saved to `program.md`).

**Want it built on your lifting history?** Export your log from the Strong app
and drop it at `data/strong_workouts.csv` — it's private and `.gitignore`d, so
it never leaves your machine. The coach scores your actual volume, frequency,
and rep ranges against Jeff's criteria instead of guessing. (See
`data/strong_workouts.example.csv` for the expected format. Open the folder with
no data loaded and it starts the interview on its own.)

You can sanity-check your own export anytime:

```bash
python3 coach/strong_parser.py data/strong_workouts.csv
```

---

## Notes & troubleshooting

- **"authentication expired"** → re-run `nlm login` (read, ~20 min) or
  `notebooklm login` (write, weeks). Expected, not a bug.
- **Videos show as empty red rows** → you loaded too fast. Keep
  `--concurrency 1` and re-run `load` to retry just the failures.
- **No citations come back** → the notebook may still be indexing right after a
  load; wait a bit, or ask a more specific question.
- **Different channel** → pass any `--channel` URL to `scrape`. The coach skill
  and prompts reference Jeff by name; tweak `.claude/skills/get-jacked/SKILL.md`
  if you swap the source content.
- These tools use undocumented Google APIs (via `notebooklm-py`) that can change
  without notice. If something breaks after a NotebookLM update, check for a
  newer version: `uv tool upgrade notebooklm-py notebooklm-mcp-cli`.
