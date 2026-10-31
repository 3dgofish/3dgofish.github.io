# GOFish: Full Field-of-View Gaussian Splatting and Mesh Extraction

Website source for [GOFish](https://3dgofish.github.io/).

Built as plain HTML, CSS and JavaScript with no runtime framework or deployment build step. The
generated CSS and JavaScript bundles are checked in, so what is in the repository is what the
browser gets. The notes below cover the parts that are not obvious from reading the markup.

---

## Credits

**Template.** This site began as the academic paper template by the authors of
**[Nerfies](https://github.com/nerfies/nerfies.github.io)**, through the SpeeDe3DGS and related
project sites. The stylesheets, JavaScript and media pipeline have since been substantially
rewritten, while the page architecture and publication class vocabulary retain that foundation.

**Favicon.** The GOFish playing-card mark is original to this project. `gofish-logo.svg` is the
three-card hand used by the browser and PDF viewer; `gofish-favicon.svg` retains the fish-only
alternative. The checked-in PNG fallbacks are generated from the active SVG source.

**Libraries.** [Bulma](https://bulma.io/) (MIT); [Font Awesome](https://fontawesome.com/) and
[Academicons](https://jpswalsh.github.io/academicons/) (SIL OFL 1.1), subset to the glyphs in use;
[Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) (SIL OFL 1.1), self-hosted; and
[PDF.js](https://mozilla.github.io/pdf.js/) (Apache 2.0), loaded from a CDN on demand.

**Licence.** The Nerfies template is released under
[CC BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/), so this site is offered under the
same terms. If you build on it, please credit Nerfies and this repository and pass those terms on.

---

## Performance

- **AV1-first video delivery.** Every published clip has a quality-targeted AV1 encode served by GitHub
  Pages. Browsers without AV1 support fall through to fast-start H.264 copies hosted in the
  public `AllenTu/GOFish-web` Hugging Face repository.
- **Results loaded on demand.** The FIORD viewer does not assign its first four video sources
  until it approaches the viewport. A method change reloads only the baseline side; the unchanged
  GOFish streams keep playing. Off-screen video playback and canvas painting pause.
- **Flash-free panel swaps.** A changing panel keeps its last decoded frame while the next source
  loads, seeks the replacement to the active GOFish clock, then crossfades aligned frames over
  200 ms. Frame 0 is never exposed between selection and alignment. Scene changes transition every
  panel independently; method changes affect only the right-side baseline panels.
- **Synchronized canvas drawing.** Four independent, time-aligned videos are cached and composed
  into one interactive canvas. The backing store is capped at 2× DPR, and playback-rate nudges
  keep streams aligned without constant hard seeks.
- **Packed teaser media.** Each teaser uses one synchronized packed video clock. Local AV1 is
  preferred, Hugging Face H.264 is the fallback, and lightweight posters reserve the square before
  decode.
- **Responsive result figures.** Desktop carousels use 640/960/1920 WebP sources and fetch a 4K
  inspection asset only on zoom. Mobile selects that high-resolution source directly but retains
  native lazy loading and browser pinch zoom.
- **Compact scene rails.** Viewer thumbnails use 192px AVIF, then WebP, with the original image as
  a lazy fallback for older browsers.
- **Bundled static assets.** `tools/build-bundles.mjs` combines and minifies the source styles and scripts;
  self-hosted subset fonts avoid full icon/font packages and third-party render-blocking requests.
- **Preserved media masters.** The development repository retains the original fast-start H.264
  files beside separately generated AV1 copies. The public website checkout keeps AV1 locally and
  streams H.264 fallbacks from Hugging Face. Responsive WebP/AVIF images likewise sit beside their
  PNG/JPEG fallbacks.
- **`cache_bust.py`.** One version query covers local assets in HTML attributes, inline poster
  backgrounds, stylesheet URLs and JavaScript-built video URLs.

## Publication and SEO metadata

The page publishes a canonical URL, crawl directives, XML sitemap, Open Graph and Twitter cards,
Google Scholar citation metadata, and `ScholarlyArticle` JSON-LD. The publication date, arXiv ID,
paper, code, project, and model URLs are live and should be kept in sync if the paper later gains a
venue or DOI.

## Light and dark themes

- **`theme.css` + `theme-switcher.js`.** Every color resolves through a custom property, so a
  theme is one attribute on `<html>` rather than a cascade of overrides.
- **Light is the deliberate default.** The saved choice is applied by an inline head script before
  first paint, preventing a light-to-dark flash.
- **Dark is a palette, not an inversion.** Shadows, labels, links and controls use values chosen
  for the black page; research figures remain on light cards so encoded colors stay faithful.

## Accessibility

- Landmarks and a document-order heading outline with one `<h1>`.
- Meaningful alternative text for figures and discernible names for links and controls.
- Pointer, touch and keyboard operation for both axes of each comparison, plus play/pause.
- Visible focus rings in both themes and responsive touch targets.
- `prefers-reduced-motion` disables carousel and interaction animation.
- Long text wraps instead of being clipped behind horizontal overflow.
- The PDF overlay is focus-trapped, labelled as a dialog, closes with Escape, restores focus, and
  falls back to the operating system viewer on touch-primary mobile devices.

## Repository layout

```text
.
├── index.html
├── static/
│   ├── css/                       # source styles + generated site.css bundle
│   ├── files/                     # downloadable assets
│   ├── images/
│   │   ├── carousel/              # responsive and inspection result figures
│   │   ├── fiord/                 # FIORD scene thumbnails and teaser posters
│   │   └── fullcircle/            # FullCircle scene thumbnails
│   ├── js/                        # source scripts + generated site.js bundle
│   ├── videos/                    # H.264 masters + AV1 delivery copies
│   └── webfonts/                  # subset icon fonts + Noto Sans
├── tools/
│   ├── build-bundles.mjs          # combine source CSS and JavaScript
│   ├── build-paper-figures.py     # compile paper tables, method figure and result slides
│   ├── build-media.sh             # build validated AV1 delivery copies
│   ├── build-thumbnail-images.sh  # build AVIF/WebP scene-rail thumbnails
│   ├── build-teaser-video.sh      # rebuild packed teaser videos and posters
│   ├── build-webfonts.sh          # rebuild font subsets
│   └── sync-comparison-media.sh   # safely copy finalized FIORD/FullCircle masters
├── cache_bust.py
├── run_server.sh
├── robots.txt
└── sitemap.xml
```

## The moving parts

- **Packed teaser comparisons** (`teaser-comparison.js`)
  One three-column Hall clip and one two-column simulation clip are cropped around interactive
  dividers. A single media clock guarantees exact timing inside each teaser.
- **FIORD and FullCircle results comparison** (`gofish-comparison.js`)
  Dataset, scene and method controls select synchronized render/mesh streams. The canvas supplies
  the draggable split, per-dataset metric labels, playback control, AV1/H.264 fallback, lazy
  loading and atomic panel swaps. Seven scene thumbnails remain visible while longer dataset rails
  scroll.
- **Results carousel** (`slideshow.js` + `slideshow.css`)
  A dependency-free cyclic ring with arrows, dots and keyboard navigation. Desktop offers
  click-to-inspect figures; mobile uses native high-resolution image zoom.
- **Source and delivery video** (`static/videos/` + `tools/build-media.sh`)
  `<name>.mp4` is the preserved H.264 master and `<name>.av1.mp4` is its web-delivery counterpart.
  The incremental builder uses the same SVT-AV1 settings as the related project sites, writes
  atomically, validates codec/dimensions/frame rate/duration, and supports concurrent jobs. Public
  deployment excludes the local H.264 masters and uses `AllenTu/GOFish-web` for those fallbacks.
- **In-page PDF viewer** (`pdf-modal.js`)
  The paper PDF opens in a focus-trapped overlay. PDF.js is fetched only when needed to choose the
  initial fit, while the arXiv abstract link opens normally.

## Related project websites

These paper pages share the same static foundation and media/build conventions:

- **[RIDE-Splat](https://ridesplat.github.io/)** — [source](https://github.com/ridesplat/ridesplat.github.io)
- **[PUP 3D-GS](https://pup3dgs.github.io/)** — [source](https://github.com/pup3dgs/pup3dgs.github.io)
- **[Speedy-Splat](https://speedysplat.github.io/)** — [source](https://github.com/speedysplat/speedysplat.github.io)
- **[SpeeDe3DGS](https://speede3dgs.github.io/)** — [source](https://github.com/speede3dgs/speede3dgs.github.io)
- **[SplatSuRe](https://splatsure.github.io/)** — [source](https://github.com/splatsure/splatsure.github.io)
- **[TransFIRA](https://transfira.github.io/)** — [source](https://github.com/transfira/transfira.github.io)

My personal site, **[tuallen.github.io](https://tuallen.github.io/)**
([source](https://github.com/tuallen/tuallen.github.io)), is a separate lineage — a different
template, no Bulma, and its own component system — but it shares the carousel behaviour, theme
toggle, cache-busting approach, and other web-delivery conventions used across these sites.

## Local development

```sh
npm install                           # install the pinned bundle minifier
./run_server.sh                       # serve at http://localhost:8000
python3 cache_bust.py                 # dry run: show version changes
python3 cache_bust.py --apply         # update local-asset versions
tools/sync-comparison-media.sh        # copy stable FIORD masters from the paper workspace
tools/build-teaser-video.sh           # rebuild packed teasers and posters
JOBS=2 tools/build-media.sh           # build incremental AV1 delivery copies
tools/build-thumbnail-images.sh       # rebuild compact scene-rail thumbnails
python3 tools/build-paper-figures.py  # compile paper tables, method figure and result slides from LaTeX
tools/build-webfonts.sh               # rebuild and validate font subsets
npm run build                         # rebuild and minify site.css and site.js
```
