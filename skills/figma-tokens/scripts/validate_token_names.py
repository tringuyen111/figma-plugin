#!/usr/bin/env python3
"""Validate newline-delimited Figma token names for a conservative slash-path grammar."""
from __future__ import annotations
import re
import sys

PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*(?:/[a-z0-9][a-z0-9_-]*)+$")


def main() -> int:
    names = [line.strip() for line in sys.stdin if line.strip()]
    seen: set[str] = set()
    bad: list[str] = []
    dup: list[str] = []
    for name in names:
        if not PATTERN.fullmatch(name):
            bad.append(name)
        if name in seen:
            dup.append(name)
        seen.add(name)
    if bad:
        print("invalid:")
        for item in bad:
            print(f"  {item}")
    if dup:
        print("duplicates:")
        for item in sorted(set(dup)):
            print(f"  {item}")
    if bad or dup:
        return 1
    print(f"ok: {len(names)} token name(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
