# Scripts

## Convert Excel Games To Text

Run this after updating `data/Road to TI1x.xlsx`:

```sh
python3 scripts/convert-excel-games-to-txt.py
```

It regenerates `data/dota-games.txt` from the `game N` Excel tabs.

The converter extracts:

- `Date` from `B1`
- `Result` from `B2`
- `Match ID` from `B3`
- Hero bans and picks from columns `E` and `F`, starting at row `16`

Only sheets named exactly `game 1`, `game 2`, etc. are included. Template sheets like `game 6 (template)` are ignored.

The workbook currently uses these style IDs:

- Red cells, style `4`: ban
- Green cells, style `7`: pick

You can also pass custom paths:

```sh
python3 scripts/convert-excel-games-to-txt.py "data/Road to TI1x.xlsx" -o "data/dota-games.txt"
```
