#!/usr/bin/env python3
"""Rebuild the bundled Material Symbols Rounded subset.

The app ships a locally hosted copy of the official Material 3 icon font so it
works offline. Loading the complete 5 MB font is wasteful, so this script keeps
only the symbols the interface actually asks for.

Usage:
    python scripts/build_icon_font.py                # rebuild from the pinned source
    python scripts/build_icon_font.py --source PATH  # rebuild from a saved font
    python scripts/build_icon_font.py --check        # verify the bundle instead of writing

The pinned source is the Material Symbols Rounded variable font served by
Google Fonts (Material 3 / expressive-era release). Whenever a new symbol name
is used in the interface it must be added to ICONS below and the font rebuilt;
`pwa/tests/test_integration.js` fails otherwise.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

# Official Material Symbols Rounded variable font (Material 3).
SOURCE_URL = (
    "https://fonts.gstatic.com/s/materialsymbolsrounded/v381/"
    "sykg-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190Fjzag.woff2"
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "pwa" / "assets" / "material" / "material-symbols-rounded-subset.woff2"
MANIFEST_PATH = ROOT / "pwa" / "assets" / "material" / "icons.txt"
SOURCE_CACHE = ROOT / "output" / "material-symbols-rounded-v381.woff2"

# Every Material 3 symbol the interface may render. Keep this list sorted.
ICONS = [
    "add",
    "app_promo",
    "arrow_back",
    "arrow_forward",
    "assignment",
    "bolt",
    "check",
    "check_circle",
    "check_circle_filled",
    "check_circle_outline",
    "clear",
    "close",
    "dark_mode",
    "delete",
    "delete_outline",
    "description",
    "device_reset",
    "error",
    "fact_check",
    "favorite",
    "favorite_border",
    "grade",
    "history",
    "install_mobile",
    "library_books",
    "light_mode",
    "lightbulb",
    "lightbulb_outline",
    "local_printshop",
    "menu",
    "menu_book",
    "mobile_arrow_down",
    "newspaper",
    "open_in_full",
    "picture_as_pdf",
    "play_arrow",
    "print",
    "progress_activity",
    "psychology",
    "public",
    "quiz",
    "radio_button_unchecked",
    "refresh",
    "remove_red_eye",
    "restore",
    "rocket_launch",
    "school",
    "search",
    "security_update",
    "star",
    "star_border",
    "star_outline",
    "style",
    "system_security_update",
    "system_update",
    "timer",
    "upload_file",
    "visibility",
    "workspace_premium",
]


def load_source(source: pathlib.Path) -> TTFont:
    if source.exists():
        return TTFont(source)
    print(f"Downloading Material Symbols Rounded from {SOURCE_URL}")
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "StudySynth-font-builder"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(data)
    print(f"Cached source font at {source} ({len(data):,} bytes)")
    return TTFont(source)


def _ligature_subtables(font: TTFont):
    """Yield every LigatureSubst subtable, unwrapping extension lookups."""
    table = font["GSUB"].table
    for lookup in table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            if subtable.LookupType == 7:
                subtable = subtable.ExtSubTable
            if getattr(subtable, "ligatures", None) is not None:
                yield subtable


def _ligature_name(first: str, components) -> str:
    glyphs = [first, *components]
    return "".join("_" if g == "underscore" else g for g in glyphs)


def ligatures(font: TTFont) -> set[str]:
    found: set[str] = set()
    for subtable in _ligature_subtables(font):
        for first, sequences in subtable.ligatures.items():
            for sequence in sequences:
                found.add(_ligature_name(first, sequence.Component))
    return found


def prune_ligatures(font: TTFont) -> None:
    """Drop symbol ligatures we do not ship.

    The Material Symbols ligature lookup is a single table covering every icon,
    so the glyph-closure step would otherwise drag the whole 5 MB library into
    the bundle even when only a few dozen names are requested.
    """
    keep = set(ICONS)
    for subtable in _ligature_subtables(font):
        pruned = {}
        for first, sequences in subtable.ligatures.items():
            sequences = [s for s in sequences if _ligature_name(first, s.Component) in keep]
            if sequences:
                pruned[first] = sequences
        subtable.ligatures = pruned


def build(source: pathlib.Path) -> None:
    font = load_source(source)
    prune_ligatures(font)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.hinting = False
    options.glyph_names = False
    options.desubroutinize = False

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text="".join(ICONS) + " ")
    subsetter.subset(font)
    font.flavor = "woff2"

    FONT_PATH.parent.mkdir(parents=True, exist_ok=True)
    font.save(FONT_PATH)
    MANIFEST_PATH.write_text("\n".join(ICONS) + "\n", encoding="utf-8")

    print(f"Wrote {FONT_PATH} ({FONT_PATH.stat().st_size:,} bytes)")
    print(f"Wrote {MANIFEST_PATH} ({len(ICONS)} symbols)")


def check() -> int:
    if not FONT_PATH.exists():
        print(f"Missing bundled font: {FONT_PATH}")
        return 1
    font = TTFont(FONT_PATH)
    found = ligatures(font)
    missing = [name for name in ICONS if name not in found]
    manifest = MANIFEST_PATH.read_text(encoding="utf-8").split() if MANIFEST_PATH.exists() else []
    problems = []
    if missing:
        problems.append(f"symbols absent from the bundled font: {', '.join(missing)}")
    if manifest != ICONS:
        problems.append("icons.txt is out of sync with the ICONS list")
    if problems:
        for problem in problems:
            print(f"FAIL: {problem}")
        return 1
    print(f"OK: {len(ICONS)} Material 3 symbols present in {FONT_PATH.name}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild the bundled Material Symbols Rounded subset")
    parser.add_argument("--source", type=pathlib.Path, default=SOURCE_CACHE, help="full Material Symbols font to subset")
    parser.add_argument("--check", action="store_true", help="verify the current bundle instead of rebuilding")
    args = parser.parse_args()

    if args.check:
        return check()
    build(args.source)
    return check()


if __name__ == "__main__":
    sys.exit(main())
