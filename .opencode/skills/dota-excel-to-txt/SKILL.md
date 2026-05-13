---
name: dota-excel-to-txt
description: Regenerate data/dota-games.txt from the Dota Excel workbook after game tabs are updated.
compatibility: opencode
metadata:
  project: dota-website
  script: scripts/convert-excel-games-to-txt.py
---

## What I Do

Use this skill when `data/Road to TI1x.xlsx` has been updated and `data/dota-games.txt` needs to be regenerated.

The converter extracts from Excel sheets named exactly `game 1`, `game 2`, etc. It ignores template sheets such as `game 6 (template)`.

## Source Data

For each game sheet, extract:

- `Date` from cell `B1`
- `Result` from cell `B2`
- `Match ID` from cell `B3`
- Hero bans and picks from columns `E` and `F`, starting at row `16`

The workbook currently identifies hero events by cell style:

- Red cells, style ID `4`: `ban`
- Green cells, style ID `7`: `pick`

## Workflow

Run this command from the project root:

```sh
python3 scripts/convert-excel-games-to-txt.py
```

The script writes:

```txt
data/dota-games.txt
```

Then verify the output by reading the first part of `data/dota-games.txt` and checking that the newest game sheet appears with the expected `GAME`, `DATE`, `RESULT`, `MATCH_ID`, and `HERO` rows.

## Output Format

The generated file is tab-separated and designed for parsing with vanilla JavaScript on static hosting:

```txt
GAME	game 5
DATE	2026-05-09	46151.0
RESULT	1-0
MATCH_ID	8.804288197E9
HERO	ban	F16	Ringmaster
HERO	pick	F23	Spirit Breaker
END_GAME
```

## Custom Paths

If the workbook or output path changes, pass explicit paths:

```sh
python3 scripts/convert-excel-games-to-txt.py "data/Road to TI1x.xlsx" -o "data/dota-games.txt"
```

## Important Notes

Do not edit `data/dota-games.txt` manually unless the user explicitly asks. Prefer regenerating it from the Excel workbook so the text file remains reproducible.
