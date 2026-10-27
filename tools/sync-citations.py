#!/usr/bin/env python3
"""Keep the site's citation numbers equal to the paper's.

Every citation link on the page carries the BibTeX key it cites:

    <a data-cite="wu20253dgut" href="..." aria-label="3DGUT project website, reference 36">36</a>

This reads the numbers from the paper's main.aux (\\bibcite{key}{{N}...}) and
rewrites each link's text and its "reference N" aria-label to match.

Usage:
    python3 tools/sync-citations.py [PAPER_DIR]           # rewrite index.html
    python3 tools/sync-citations.py --check [PAPER_DIR]   # exit 1 on any mismatch

tools/build-paper-figures.py runs the rewrite before building, so the HTML and
the table images (compiled against the same main.aux) always agree.
"""

import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
DEFAULT_PAPER = Path("/Users/allentu/efs/allentu/ICRA/GOFish_CVPR_2027")
HTML = SITE / "index.html"

LINK = re.compile(r'(<a\b[^>]*?data-cite="([^"]+)"[^>]*?aria-label="[^"]*?reference )(\d+)("[^>]*>)(\d+)(</a>)',
                  re.S)


def paper_numbers(paper):
    aux = (paper / "main.aux").read_text()
    return {m.group(1): m.group(2)
            for m in re.finditer(r"\\bibcite\{([^}]+)\}\{\{(\d+)\}", aux)}


def sync(paper, check):
    numbers = paper_numbers(paper)
    html = HTML.read_text()
    problems, changes = [], []
    untagged = re.findall(r'<a\b(?:(?!data-cite)[^>])*aria-label="[^"]*reference \d+"', html)
    if untagged:
        problems.append(f"{len(untagged)} citation link(s) without data-cite")

    def fix(m):
        key, label_n, text_n = m.group(2), m.group(3), m.group(5)
        if key not in numbers:
            problems.append(f"{key}: not cited in the paper's main.aux")
            return m.group(0)
        want = numbers[key]
        if label_n != want or text_n != want:
            changes.append(f"{key}: {text_n} -> {want}")
        return m.group(1) + want + m.group(4) + want + m.group(6)

    new_html = LINK.sub(fix, html)
    found = len(LINK.findall(html))
    if found != html.count("data-cite="):
        problems.append("a data-cite link did not match the expected markup")
    if check:
        for line in sorted(set(changes)):
            print("stale:", line)
        for line in problems:
            print("error:", line)
        if changes or problems:
            sys.exit(1)
        print(f"citations OK ({found} links)")
        return
    if problems:
        sys.exit("\n".join(problems))
    HTML.write_text(new_html)
    for line in sorted(set(changes)):
        print("updated:", line)
    print(f"citations synced ({found} links)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--check"]
    sync(Path(args[0]) if args else DEFAULT_PAPER, "--check" in sys.argv)
