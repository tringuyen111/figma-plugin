#!/usr/bin/env python3
"""Search current Figma Plugin API typings without loading the whole file."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

CANDIDATES = (
    Path("node_modules/@figma/plugin-typings/plugin-api.d.ts"),
    Path("node_modules/@figma/plugin-typings/index.d.ts"),
    Path("plugin-api.d.ts"),
    Path("plugin-api-standalone.d.ts"),
)


def find_typings(root: Path, explicit: Path | None) -> Path | None:
    if explicit is not None:
        p = explicit if explicit.is_absolute() else root / explicit
        return p if p.is_file() else None
    for rel in CANDIDATES:
        p = root / rel
        if p.is_file():
            return p
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("symbol", help="Literal symbol/text to locate")
    parser.add_argument("--root", default=".", help="Project root containing node_modules")
    parser.add_argument("--file", help="Explicit typings file path")
    parser.add_argument("--context", type=int, default=8, help="Lines before/after each match")
    parser.add_argument("--max-matches", type=int, default=8, help="Maximum matches to print")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    explicit = Path(args.file) if args.file else None
    typings = find_typings(root, explicit)
    if typings is None:
        print(
            "Figma typings not found. Install @figma/plugin-typings or pass --file /path/to/plugin-api.d.ts.",
            file=sys.stderr,
        )
        return 2

    lines = typings.read_text(encoding="utf-8", errors="replace").splitlines()
    needle = args.symbol.lower()
    matches = [i for i, line in enumerate(lines) if needle in line.lower()]
    if not matches:
        print(f"No matches for {args.symbol!r} in {typings}")
        return 1

    for num, idx in enumerate(matches[: max(1, args.max_matches)], start=1):
        start = max(0, idx - max(0, args.context))
        end = min(len(lines), idx + max(0, args.context) + 1)
        print(f"--- match {num}: {typings}:{idx + 1} ---")
        for line_no in range(start, end):
            marker = ">" if line_no == idx else " "
            print(f"{marker}{line_no + 1:6d} {lines[line_no]}")
    if len(matches) > args.max_matches:
        print(f"... {len(matches) - args.max_matches} more matches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
