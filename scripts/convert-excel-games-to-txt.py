#!/usr/bin/env python3
"""Convert Dota game sheets from the Excel workbook into a static text file.

The generated file is intentionally simple so it can be parsed by vanilla
JavaScript on static hosting.
"""

from __future__ import annotations

import argparse
import re
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "Road to TI1x.xlsx"
DEFAULT_OUTPUT = ROOT / "data" / "dota-games.txt"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

# These style IDs come from the workbook formatting:
# red cells are bans, green cells are picks.
BAN_STYLE_IDS = {"4"}
PICK_STYLE_IDS = {"7"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert game tabs from Road to TI1x.xlsx into data/dota-games.txt."
    )
    parser.add_argument(
        "input",
        nargs="?",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Excel workbook path. Default: {DEFAULT_INPUT}",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output text path. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall("m:si", NS):
        strings.append("".join((node.text or "") for node in item.findall(".//m:t", NS)))
    return strings


def cell_value(cell: ET.Element | None, shared_strings: list[str]) -> str:
    if cell is None:
        return ""

    cell_type = cell.attrib.get("t", "")

    if cell_type == "inlineStr":
        inline = cell.find("m:is", NS)
        if inline is None:
            return ""
        return "".join((node.text or "") for node in inline.findall(".//m:t", NS))

    value_node = cell.find("m:v", NS)
    if value_node is None:
        return ""

    raw = value_node.text or ""
    if cell_type == "s":
        return shared_strings[int(raw)] if raw else ""
    if cell_type == "b":
        return "TRUE" if raw == "1" else "FALSE"
    return raw


def format_excel_date(value: str) -> str:
    try:
        number = float(value)
    except ValueError:
        return value

    if number <= 0:
        return value

    date = datetime(1899, 12, 30) + timedelta(days=number)
    return date.strftime("%Y-%m-%d")


def clean(value: str) -> str:
    return value.strip()


def escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
    )


def cell_row(ref: str) -> int:
    match = re.match(r"[A-Z]+(\d+)$", ref)
    return int(match.group(1)) if match else 0


def is_game_sheet(sheet_name: str) -> bool:
    return re.fullmatch(r"game \d+", sheet_name) is not None


def extract_games(input_path: Path) -> list[str]:
    with zipfile.ZipFile(input_path) as zf:
        shared_strings = load_shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        relmap = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        lines = [
            "# Dota games extracted from Road to TI1x.xlsx",
            "# Format: tab-separated records",
            "# GAME\t<sheet_name>",
            "# DATE\t<yyyy-mm-dd>\t<excel_raw_value>",
            "# RESULT\t<result>",
            "# MATCH_ID\t<match_id>",
            "# HERO\t<ban|pick>\t<cell>\t<hero_name>",
            "# END_GAME",
            "",
        ]

        sheets = []
        for sheet in workbook.find("m:sheets", NS):
            sheet_name = sheet.attrib["name"]
            if is_game_sheet(sheet_name):
                game_number = int(sheet_name.split()[1])
                worksheet_path = "xl/" + relmap[sheet.attrib[REL_ID]]
                sheets.append((game_number, sheet_name, worksheet_path))

        for _, sheet_name, worksheet_path in sorted(sheets):
            root = ET.fromstring(zf.read(worksheet_path))
            cells = {cell.attrib.get("r", ""): cell for cell in root.findall(".//m:c", NS)}

            raw_date = clean(cell_value(cells.get("B1"), shared_strings))
            result = clean(cell_value(cells.get("B2"), shared_strings))
            match_id = clean(cell_value(cells.get("B3"), shared_strings))

            lines.append(f"GAME\t{escape(sheet_name)}")
            lines.append(f"DATE\t{escape(format_excel_date(raw_date))}\t{escape(raw_date)}")
            lines.append(f"RESULT\t{escape(result)}")
            lines.append(f"MATCH_ID\t{escape(match_id)}")

            hero_records = []
            for ref, cell in cells.items():
                if ref[:1] not in {"E", "F"} or cell_row(ref) < 16:
                    continue

                hero = clean(cell_value(cell, shared_strings))
                if not hero:
                    continue

                style = cell.attrib.get("s", "")
                if style in BAN_STYLE_IDS:
                    hero_records.append((cell_row(ref), ref[:1], "ban", ref, hero))
                elif style in PICK_STYLE_IDS:
                    hero_records.append((cell_row(ref), ref[:1], "pick", ref, hero))

            for _, _, record_type, ref, hero in sorted(hero_records):
                lines.append(f"HERO\t{record_type}\t{escape(ref)}\t{escape(hero)}")

            lines.append("END_GAME")
            lines.append("")

        return lines


def main() -> None:
    args = parse_args()
    input_path = args.input.resolve()
    output_path = args.output.resolve()

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(extract_games(input_path)), encoding="utf-8")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
