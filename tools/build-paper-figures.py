#!/usr/bin/env python3
"""Build the paper-derived figures and tables for the website from LaTeX sources.

Nothing here is a screenshot of the paper PDF. Each asset is compiled standalone
with Tectonic against the paper's own cvpr.sty, preamble.tex and main.aux (so
colors, macros and citation numbers match the paper), rendered with pdftoppm,
and tight-cropped with an even white margin:

  * Tables 1-2   tables/rendering_results.tex and tables/mesh_results.tex,
                 without their captions (the site sets its own caption above each
                 table).
  * Method       the Fig. 2 failure diagram from figures/fig2.tex as its
                 four panels, without the caption.
  * Slides       the results carousel. The paper's combined render+mesh grids
                 (figures/app_qual_sn, figures/app_qual_tnt) are split into
                 render-only and mesh-only grids that keep the paper's images,
                 badges, labels and GOFish backing; the ScanNet++ wide-angle grid
                 is figures/app_qual_render/grid_p2.tex as is. An optional
                 Tanks & Temples wide-angle grid is generated from
                 tools/paper-inputs/tnt_wide (see SLIDES below).

Usage:
    python3 tools/build-paper-figures.py [PAPER_DIR]

PAPER_DIR must hold a fresh main.aux (build the paper first). The page's
citation numbers are synced from it via tools/sync-citations.py, which also
fails the build if any hardcoded number disagrees.

Requires tectonic, pdftoppm, cwebp and Pillow.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image
import numpy as np

SITE = Path(__file__).resolve().parents[1]
PAPER = Path(sys.argv[1] if len(sys.argv) > 1 else
             "/Users/allentu/efs/allentu/ICRA/GOFish_CVPR_2027").resolve()
OUT = SITE / "static" / "images" / "carousel"
METHOD_OUT = SITE / "static" / "images"
TNT_WIDE = SITE / "tools" / "paper-inputs" / "tnt_wide"

BASE_DPI = 300      # base PNG/JPG and responsive WebPs
ZOOM_DPI = 600      # tables and the method figure (vector)
SLIDE_ZOOM_DPI = 450  # photo grids: close to the 480 px source tiles, under ~1.5 MB
MARGIN_IN = 0.08    # even white margin around every crop

PREAMBLE = r"""\documentclass[10pt,twocolumn,letterpaper]{article}
\usepackage{cvpr}
\newif\ifdraft
\draftfalse
\input{preamble}
\definecolor{cvprblue}{rgb}{0.21,0.49,0.74}
\usepackage[breaklinks,colorlinks,allcolors=cvprblue]{hyperref}
\makeatletter
\input{refs}
\makeatother
\pagestyle{empty}
\begin{document}
\thispagestyle{empty}
"""

TABLES = {
    "table1": "tables/rendering_results",
    "table2": "tables/mesh_results",
}

# (output name, grid source or generator, part)
SLIDES = [
    ("slide-scannetpp-render-surface", "figures/app_qual_sn/grid_p1.tex", "render"),
    ("slide-scannetpp-mesh-surface", "figures/app_qual_sn/grid_p1.tex", "mesh"),
    ("slide-tnt-render-surface", "figures/app_qual_tnt/grid_p1.tex", "render"),
    ("slide-tnt-mesh-surface", "figures/app_qual_tnt/grid_p1.tex", "mesh"),
    ("slide-scannetpp-render-wide", "figures/app_qual_render/grid_p2.tex", "all"),
    ("slide-tnt-render-wide", "tnt_wide", "all"),
]


def run(cmd, **kwargs):
    subprocess.run(cmd, check=True, **kwargs)


def strip_braced(text, command):
    """Remove every `command{...}` with balanced braces."""
    while command + "{" in text:
        start = text.index(command + "{")
        depth = 0
        for end in range(start + len(command), len(text)):
            if text[end] == "{":
                depth += 1
            elif text[end] == "}":
                depth -= 1
                if depth == 0:
                    break
        text = text[:start] + text[end + 1:]
    return text


def compile_tex(work, name, body):
    (work / f"{name}.tex").write_text(PREAMBLE + body + "\n\\end{document}\n")
    run(["tectonic", "-Z", f"search-path={PAPER}", "--reruns", "0", f"{name}.tex"],
        cwd=work, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return work / f"{name}.pdf"


def render_cropped(pdf, dpi, margin_in=MARGIN_IN):
    stem = pdf.with_name(f"{pdf.stem}_{dpi}")
    run(["pdftoppm", "-r", str(dpi), "-singlefile", "-png", str(pdf), str(stem)])
    image = Image.open(f"{stem}.png").convert("RGB")
    ys, xs = np.where(np.asarray(image.convert("L")) < 250)
    margin = round(margin_in * dpi)
    return image.crop((xs.min() - margin, ys.min() - margin,
                       xs.max() + 1 + margin, ys.max() + 1 + margin))


def write_responsive(name, base, zoom, photo, out_dir=OUT):
    if photo:
        base.save(out_dir / f"{name}.jpg", quality=88, optimize=True, progressive=True)
    else:
        base.save(out_dir / f"{name}.png", optimize=True)
    with tempfile.TemporaryDirectory() as tmp:
        base_png = Path(tmp) / "base.png"
        zoom_png = Path(tmp) / "zoom.png"
        base.save(base_png)
        zoom.save(zoom_png)
        for width in (640, 960, 1920):
            if width > base.size[0]:
                continue
            run(["cwebp", "-quiet", "-mt", "-m", "6", "-q", "90", "-sharp_yuv",
                 "-resize", str(width), "0", str(base_png),
                 "-o", str(out_dir / f"{name}-{width}.webp")])
        zoom_args = (["-q", "82", "-sharp_yuv"] if photo else ["-lossless", "-z", "9"])
        run(["cwebp", "-quiet", "-mt", "-m", "6", *zoom_args, str(zoom_png),
             "-o", str(out_dir / f"{name}-zoom.webp")])
    print(f"{name}: {base.size[0]}x{base.size[1]} (zoom {zoom.size[0]}x{zoom.size[1]})")


def split_grid(source, part):
    """Re-pack a render+mesh TikZ grid as a render-only or mesh-only grid."""
    lines = source.split("\n")
    at = re.compile(r"at \((-?[\d.]+),(-?[\d.]+)\)")
    tops = sorted({float(at.search(l).group(2)) for l in lines
                   if "_render.jpg" in l and at.search(l)}, reverse=True)
    pitch = tops[0] - tops[1]

    def first_offset(predicate):
        return next(tops[0] - float(at.search(l).group(2)) for l in lines if predicate(l))

    render_badge = first_offset(lambda l: "PSNR}" in l)
    mesh_image = first_offset(lambda l: "_mesh.jpg" in l)
    mesh_badge = first_offset(lambda l: " F}" in l)
    badge_height = 0.110
    new_pitch = pitch - (mesh_badge - render_badge)
    out = []
    for line in lines:
        if line.startswith(r"\fill[oursbg"):
            bottom = float(re.findall(r"\((-?[\d.]+),(-?[\d.]+)\)", line)[1][1])
            margin = (tops[-1] - mesh_badge - badge_height) - bottom
            new_bottom = (tops[0] - (len(tops) - 1) * new_pitch - render_badge
                          - badge_height - margin)
            out.append(re.sub(r"rectangle \((-?[\d.]+),(-?[\d.]+)\)",
                              lambda m: "rectangle (%s,%.4f)" % (m.group(1), new_bottom),
                              line))
            continue
        match = at.search(line)
        if not match or "anchor=south" in line or float(match.group(2)) > tops[0] + 1e-6:
            out.append(line)
            continue
        y = float(match.group(2))
        row = max(i for i, top in enumerate(tops) if top >= y - 1e-6)
        offset = tops[row] - y
        if "_gt.jpg" in line:
            new_offset = 0.0
        elif r"\texttt{" in line:
            new_offset = render_badge
        else:
            in_mesh = offset > (render_badge + mesh_image) / 2
            if (part == "render") == in_mesh:
                continue
            new_offset = offset - (mesh_image if in_mesh else 0.0)
        new_y = tops[0] - row * new_pitch - new_offset
        out.append(line[:match.start()] + "at (%s,%.4f)" % (match.group(1), new_y)
                   + line[match.end():])
    return "\n".join(out)


def rank_fills(values, higher_is_better):
    order = sorted(range(len(values)), key=lambda i: float(values[i]),
                   reverse=higher_is_better)
    fills = ["black!8"] * len(values)
    for rank, index in enumerate(order[:3]):
        fills[index] = ("tabfirst", "tabsecond", "tabthird")[rank]
    return fills


def tnt_wide_grid():
    """Tanks & Temples wide-angle grid in the style of app_qual_render/grid_p2.tex.

    Inputs: tools/paper-inputs/tnt_wide/<Scene>_<method>.jpg and metrics.json
    ({scene: {method: {"psnr": str, "lpips": str} | null}}). Badges are drawn
    only when every method in a row has recorded per-image metrics."""
    meta = json.loads((TNT_WIDE / "metrics.json").read_text())
    columns = [("fisheye_gs", "Fisheye-GS"), ("3dgut_ppisp", "3DGUT + PPISP"),
               ("self_cali", r"Self-Cal.\ GS"), ("dfgs", "DirectFisheye-GS"),
               ("gofish", "GOFish (Ours)")]
    scenes = meta["scenes"]
    sample = Image.open(TNT_WIDE / f"{scenes[0]}_gofish.jpg")
    aspect = sample.height / sample.width
    step, badge, gap = 1.06, 0.110, 0.07
    pitch = aspect + 0.0367 + badge + gap
    ours_x = step * (len(columns) - 1)
    rows = []
    for row, scene in enumerate(scenes):
        top = -0.13 - row * pitch
        metrics = [meta["metrics"].get(scene, {}).get(key) for key, _ in columns]
        have_badges = all(metrics)
        if have_badges:
            psnr_fill = rank_fills([m["psnr"] for m in metrics], True)
            lpips_fill = rank_fills([m["lpips"] for m in metrics], False)
        for col, (key, _) in enumerate(columns):
            x = col * step
            rows.append(r"\node[anchor=north west,inner sep=0pt] at (%.4f,%.4f) "
                        r"{\includegraphics[width=\figthreew]{%s}};"
                        % (x, top, TNT_WIDE / f"{scene}_{key}.jpg"))
            if have_badges:
                y = top - aspect - 0.0367
                rows.append(r"\node[badge,minimum width=0.480\figthreew,anchor=north west,"
                            r"fill=%s] at (%.4f,%.4f) {%s PSNR};"
                            % (psnr_fill[col], x, y, metrics[col]["psnr"]))
                rows.append(r"\node[badge,minimum width=0.480\figthreew,anchor=north east,"
                            r"fill=%s] at (%.4f,%.4f) {%s LPIPS};"
                            % (lpips_fill[col], x + 1, y, metrics[col]["lpips"]))
        gt_x = len(columns) * step
        rows.append(r"\node[anchor=north west,inner sep=0pt] at (%.4f,%.4f) "
                    r"{\includegraphics[width=\figthreew]{%s}};"
                    % (gt_x, top, TNT_WIDE / f"{scene}_gt.jpg"))
        rows.append(r"\node[badge,anchor=north,minimum width=1\figthreew,fill=black!8] "
                    r"at (%.4f,%.4f) {\texttt{%s}};"
                    % (gt_x + 0.5, top - aspect - 0.0367, scene))
    bottom = -0.13 - (len(scenes) - 1) * pitch - aspect - 0.0367 - badge - 0.0583
    header = [r"\node[anchor=south,align=center,font=\footnotesize\bfseries,inner sep=0pt] "
              r"at (%.4f,-0.1180) {\strut %s};" % (i * step + 0.5, label)
              for i, label in enumerate([label for _, label in columns] + ["Ground Truth"])]
    return "\n".join([
        r"\setlength{\figthreew}{0.1578\textwidth}",
        r"\begin{tikzpicture}[x=\figthreew,y=\figthreew,",
        r"  badge/.style={rounded corners=1.2pt,inner sep=0pt,minimum height=0.110\figthreew,"
        r"minimum width=0.48\figthreew,",
        r"    font=\fontsize{6.0}{6.7}\selectfont,text height=4.4pt,text depth=1.2pt}]",
        r"\fill[oursbg,rounded corners=4pt] (%.4f,0.0584) rectangle (%.4f,%.4f);"
        % (ours_x - 0.03, ours_x + 1.03, bottom),
        *header, *rows, r"\end{tikzpicture}"])


def build_filtering(work):
    figure = (PAPER / "figures" / "filtering.tex").read_text()
    figure = strip_braced(figure, r"\caption").replace(r"\label{fig:filtering}", "")
    pdf = compile_tex(work, "method-filtering", figure)
    write_responsive("method-filtering", render_cropped(pdf, BASE_DPI, 0.02),
                     render_cropped(pdf, ZOOM_DPI, 0.02), photo=False, out_dir=METHOD_OUT)


def main():
    # Citation numbers: the HTML links are rewritten from the same main.aux the
    # tables below are compiled against, then checked, so they cannot drift.
    sync = [sys.executable, str(SITE / "tools" / "sync-citations.py")]
    run(sync + [str(PAPER)])
    run(sync + ["--check", str(PAPER)])
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gofish-paper-") as tmp:
        work = Path(tmp)
        aux = (PAPER / "main.aux").read_text()
        (work / "refs.tex").write_text("\n".join(
            l for l in aux.splitlines() if l.startswith((r"\bibcite", r"\newlabel"))))

        for name, source in TABLES.items():
            body = "\\onecolumn\n"
            body += "\\renewcommand{\\caption}[2][]{}\n\\input{%s}" % source
            pdf = compile_tex(work, name, body)
            write_responsive(name, render_cropped(pdf, BASE_DPI),
                             render_cropped(pdf, ZOOM_DPI), photo=False)

        method = (PAPER / "figures" / "fig2.tex").read_text()
        start = re.search(r"\\begin\{figure\}\[!?t\]", method).start()
        end = method.index(r"\end{figure}", start) + len(r"\end{figure}")
        figure = strip_braced(method[start:end], r"\caption").replace(r"\label{fig:failures}", "")

        # The figure split into its four unlabeled panels (one row on desktop,
        # two rows on phones). The diagrams keep the paper's \resizebox scale: each is the
        # full tikzpicture with the other scope made transparent, then cropped.
        # The renders are the paper's own minipages, each compiled alone.
        scope_b = r"\begin{scope}[xshift=3.3cm,yshift=-0.55cm]"
        assert scope_b in figure
        tikz_start = figure.index(r"\resizebox")
        tikz_end = figure.index(r"\end{tikzpicture}}") + len(r"\end{tikzpicture}}")
        tikz = figure[tikz_start:tikz_end]
        # Panel labels are set as HTML on the site, so the label nodes and the
        # minipage captions are dropped here.
        tikz = re.sub(r"\n\s*\\node\[align=center\] at \([^)]*\) \{\\textbf\{\([ab]\)\}[^\n]*", "", tikz)
        assert r"\textbf{(a)}" not in tikz and r"\textbf{(b)}" not in tikz
        panels = {
            "method-panel-a": tikz.replace(scope_b, scope_b[:-1] + ",opacity=0]"),
            "method-panel-b": tikz.replace(r"\begin{scope}" + "\n",
                                           r"\begin{scope}[opacity=0]" + "\n", 1),
        }
        images = re.findall(r"\\includegraphics\[width=\\linewidth\]\{[^}]+\}", figure)
        assert len(images) == 2
        panels["method-panel-c"] = "\\begin{minipage}{0.49\\linewidth}%s\\end{minipage}" % images[0]
        panels["method-panel-d"] = "\\begin{minipage}{0.49\\linewidth}%s\\end{minipage}" % images[1]
        for name, body in panels.items():
            pdf = compile_tex(work, name, "\\begin{figure}[t]\\centering\n%s\n\\end{figure}" % body)
            photo = name in ("method-panel-c", "method-panel-d")
            # Tight crops: the page sets the gaps between panels.
            margin = 0.0 if photo else 0.02
            write_responsive(name, render_cropped(pdf, BASE_DPI, margin),
                             render_cropped(pdf, ZOOM_DPI, margin), photo=photo,
                             out_dir=METHOD_OUT)

        # The Calibrated Mip Filtering diagram (figures/filtering.tex), without its caption.
        build_filtering(work)

        for name, source, part in SLIDES:
            if source == "tnt_wide":
                if not (TNT_WIDE / "metrics.json").exists():
                    print(f"{name}: skipped, no inputs in {TNT_WIDE}")
                    continue
                grid = tnt_wide_grid()
            else:
                grid = (PAPER / source).read_text()
                if part != "all":
                    grid = split_grid(grid, part)
            (work / f"{name}_grid.tex").write_text(grid)
            pdf = compile_tex(work, name, "\\onecolumn\n\\noindent\\input{%s_grid.tex}"
                              % (work / name))
            write_responsive(name, render_cropped(pdf, BASE_DPI),
                             render_cropped(pdf, SLIDE_ZOOM_DPI), photo=True)


if __name__ == "__main__":
    if not shutil.which("tectonic"):
        sys.exit("tectonic is required")
    main()
