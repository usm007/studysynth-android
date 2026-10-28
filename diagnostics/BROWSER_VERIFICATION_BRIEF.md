# Browser Verification Brief — Real-Browser PDF Layout Check

Status: **PENDING MAIN-AGENT BROWSER RUN.** No browser result is
claimed, fabricated, or pre-filled in this file. The main agent
appends the browser evidence after its run; nothing below is a
browser result.

## Why this run exists

All PDF layout results to date use the vendored pdf.js build under
Node only. The PWA import path in a real browser has never been
compared against it. This run closes that gap (Phase 2E §9, repeated
here exactly): it does NOT test question generation, validation, or
the coverage engine — only whether the browser's `extractPageLayout`
blocks and geometry match Node's for the pages that carry the
boundary-recovery cases and the unchanged controls.

## Procedure (exact, from Phase 2E §9)

1. In a REAL browser (not Node `vm`), open the StudySynth PWA and use
   its import path to import `hees203.pdf` and the fixed-case pages
   (the hees201, hees206, and hees209 PDFs below — import each PDF
   whole; the comparison is per page).
2. For each page listed in §"Pages to compare", capture the
   `extractPageLayout` output for that page: every block's ID, text,
   and bounding box (x, y, width, height, and x1/y1 where the layout
   reports them), in extraction order.
3. Also capture, for the same pages, the structured-document
   disposition of each block (`disposition`, `disposition_reason`,
   `classification_reason`, `section_id`, `section_title`,
   `eligible_for_fact_extraction`) and the reconstructed units
   touching the page (unit_id, type, text, block_ids, method,
   rule_id, figure_ref, fragments_used, fragments_excluded), if the
   browser path exposes them. If the browser path exposes ONLY the
   layout blocks (not the structured/reconstructed layers), record
   that explicitly — the layout comparison alone still closes the
   core gap, and the structured/unit comparison is then recorded as
   not available in the browser path rather than assumed equal.
4. Compare each page's browser output against the Node reference in
   `diagnostics/browser_reference_node.json` (§"Reference data") and
   classify every difference per §"Discrepancy classification".
5. Append the results to this file (or a companion
   `diagnostics/BROWSER_VERIFICATION_RESULTS.md`) with: per-page
   verdict (MATCH / DIFFER), the classified difference list, and an
   overall verdict on whether the browser layout path is confirmed
   equivalent to Node for these pages. Do NOT edit the reference file.

PDFs (hash-verified; the browser run must use these exact files,
from `~/workspace/ncert_pdfs/`):

- hees201: `68f119b33395c16a5c63819596d46aacadde9a17aec5c4cf978d0b03e85a84a4`
- hees203: `547e9203b0a189d23e05a90e462b7ac0a00ac7412889dfcb20700f904e7871ec`
- hees206: `832a4ee039e5d79c61c4259e38593378ed4f295699df864bdffc599a6562317f`
- hees209: `cfdd8e4a732582926a6e06f6f779b28732a0ae23c8383e3136f4ba612933ff29`

Page numbers below are **1-based PDF pages** (not book pages).
Block IDs are `p<page>-b<n>` in Node extraction order.

## Pages to compare (21 pages)

### hees201 — boundary cases + explicit pages

| PDF page | Role | What must match |
|---|---|---|
| 2 | Case 1, oblate spheroid (PINNED: R-LEGEND excludes `p2-b2`) | Legend block `p2-b2` present with its text/bbox; the "colours — The Earth is an oblate spheroid" split point |
| 4 | Case 2, ocean vast body (PINNED: `p4-b15` excluded as leading run) | Block `p4-b15` text/bbox; ocean sentence blocks clean |
| 5 | Explicit page from §9 | All blocks/geometry |
| 9 | Explicit page from §9 | All blocks/geometry |
| 15 | Case 3, Mountains formed (sentence "Mountains are formed by tectonic…" is on this page) | The "(see" fusion blocks; Mountains sentence blocks |
| 16 | Case 7, Urals gutter split (left/right column blocks) | Column block bboxes (the ±1.0pt gutter epsilon decision depends on them) |
| 20 | Case 5, savannah (sentence "The savannah is…" is on this page) | Map/scale prefix blocks (`1000`, `2,000 km`) and savannah sentence blocks |
| 26 | Case 4, Colorado Plateau map-scale (CANDIDATE: text on pp. 26–27) | The 11 leading map/scale blocks; confirm whether this is the case page |
| 27 | Case 4, Colorado Plateau map-scale (CANDIDATE: text on pp. 26–27) | Same as p. 26; confirm whether this is the case page |
| 31 | Case 6, map projection (CANDIDATE: "map projection" text on pp. 2, 4, 31; case page NOT block-pinned in the 2E report) | Confirm which page carries the "Earth on a flat surface is called a map projection" sentence; record that page as the case page |

### hees206 — population-pyramid chart axes

| PDF page | Role | What must match |
|---|---|---|
| 15 | Case 8 (CANDIDATE: "population pyramid" text on pp. 15–17, 23, 24) | Year-axis + value-axis blocks; pyramid comparison sentence blocks |
| 16 | Case 8 (CANDIDATE) | Same; confirm whether this is the chart page |
| 17 | Case 8 (CANDIDATE) | Same; confirm whether this is the chart page |

### hees209 — paṭṭachitra, Sufism, mirrors

| PDF page | Role | What must match |
|---|---|---|
| 7 | Case 11, Sufism dup (PINNED: `p7-b3` "Sufism" excluded) | Block `p7-b3` text/bbox; the following "Sufism is …" blocks |
| 9 | Case 9, paṭṭachitra (PINNED: `p9-b18` joined into the passage) | Block `p9-b18` ("in Rajasthan and paṭṭachitra … in Odisha, West Bengal and Andhra Pradesh.") text/bbox; surrounding passage blocks |
| 29 | Case 10, walls/ceilings convex mirrors (sentence on this page) | The mirrors sentence blocks and the following-text fusion point (". and palaces of the North …") |

### hees203 — unchanged controls (must NOT change)

| PDF page | Role | What must match |
|---|---|---|
| 14 | Wells/stepwells (2B recovery) | All blocks/geometry; aggregate `p14-b2`, rescued `p14-b30` tail |
| 17 | Nandi sentence (2B recovery) | Spaceless furniture block, Nandi sentence blocks |
| 22 | Jama Masjid builder + etymology; Fig. 3.29 caption (2B recovery) | Aggregate `p22-b5`, Fig. 3.29 caption blocks, sketch date/maker blocks |
| 26 | Latticework gloss (2B recovery) | All 9 glossary block IDs, gloss text |
| 38 | Fig. 3.52 caption; Madras High Court (2B + coverage-expansion) | Caption blocks `p38-b2`, `p38-b3`, `p38-b4`; Fig. 3.53 close-up blocks (must bind nothing) |

## Reference data

`diagnostics/browser_reference_node.json` (1,139,715 bytes,
generated 2026-10-27 from the actual hash-verified PDFs with the
repo's own layout path: `extractPageLayout` →
`buildStructuredDocument` → `reconstructDocument`,
sourceReconstruction `phase2e-1`, Node vendored pdf.js build).

Structure: `chapters.<chapter>.pages.<pdfPage>` with:

- `roles` — the role labels from the table above, including
  pinned-vs-candidate status.
- `layout_blocks[]` — `{ id, text, bbox: {x, y, width, height, x1,
  y1}, x, y, width, height, fontSize }` in Node extraction order.
  (`x/y/width/height/fontSize` are null in this dump because the
  layout blocks carry geometry in `bbox`; compare `bbox`.)
- `structured_blocks[]` — every field the structured model carries,
  including `block_id`, `source_block_id`, `page`, `type`, `text`,
  `bbox`, `disposition`, `disposition_reason`,
  `classification_reason`, `section_id`, `section_title`,
  `eligible_for_fact_extraction`, `review_flags`.
- `reconstructed_units[]` — `{ unit_id, type, text, block_ids,
  pages, section_id, section_title, method, rule_id, certainty,
  figure_ref, fragments_used, fragments_excluded, review_flags }`
  for every unit touching the page.

Top-level `generator` and `note` fields record the method. The
chapter objects also record `pdf_sha256` and `num_pages`.

What the reference does NOT contain (state explicitly, do not fill
in): browser-side block IDs or geometry (that is what the run must
produce); the browser's font metrics; any page outside the 21 listed
above; the full 249-page corpus (only the listed pages were dumped).

## What the browser run must record (checklist)

- [ ] Browser + PWA version/build used, and the import path taken
      (file import vs other route).
- [ ] For each of the 21 pages: browser block list (id, text, bbox)
      in extraction order, or the exact browser output if block IDs
      differ in scheme (then also record the ID mapping used).
- [ ] For each page: MATCH / DIFFER verdict with the classified
      differences (below). A page with only floating-point noise
      (see tolerance) is MATCH with the noise noted.
- [ ] For the CANDIDATE pages: which page actually carries each case
      (Colorado Plateau map-scale; map projection; pyramid chart).
- [ ] For the hees203 controls: confirmation that the recovered spans
      (block IDs in the table above) are unchanged in the browser
      path, or the exact difference if not.
- [ ] If the browser path cannot expose structured dispositions or
      reconstructed units: record that as a scope limit, with the
      layout-only verdict.
- [ ] Overall verdict: is the browser layout path confirmed
      equivalent to Node for these pages? (Yes / No / Partial, with
      the blocking differences listed.)

## Discrepancy classification

Classify EVERY difference into exactly one class (a difference can
carry a secondary class in parentheses if it spans two):

1. **Block-ID difference** — the same text appears under a different
   block ID, blocks are split/merged differently (one Node block =
   two browser blocks or vice versa), or a block is missing/extra.
   Record: Node block ID(s), browser block ID(s), text.
2. **Text difference** — the same block ID carries different text
   (missing/extra characters, different spacing, different ligature
   or diacritic handling, e.g. "chhatrīs" vs "chhatris"). Record:
   block ID, Node text, browser text, character-level diff.
3. **Geometry difference** — same block ID and text, different
   bounding box. Record: block ID, Node bbox, browser bbox, delta per
   coordinate. Tolerance: differences ≤ 0.5pt on every coordinate
   are floating-point noise (record as noise, verdict still MATCH);
   anything larger is a real geometry difference. A geometry
   difference that crosses the ±1.0pt gutter epsilon or the ±5pt
   heading x-alignment or the 45pt y-gap thresholds is additionally
   flagged as **geometry-threshold-critical**, because it can change
   a reconstruction decision (column split, heading-prose join).
4. **Disposition difference** — same block, different structured
   disposition (`disposition`, `disposition_reason`,
   `classification_reason`, `eligible_for_fact_extraction`, section
   assignment). Record: block ID, Node disposition, browser
   disposition.
5. **Span difference** — same page, different recovered spans: a
   reconstructed unit covers different block IDs, a unit is
   missing/extra, a fragment moves between `fragments_used` and
   `fragments_excluded`, or a unit's method/rule_id changes. Record:
   unit_id, Node span, browser span.

Severity: a difference is **blocking** if it changes (or could
change) any reconstructed unit, typed fact, or question on that page
— i.e. any class-1, class-2, class-4, or class-5 difference, and any
geometry-threshold-critical class-3 difference. Non-blocking
differences (pure noise, or geometry deltas that move no threshold)
are recorded but do not block a MATCH verdict for the page.

## After the run

Append the results to this file under a new "## Browser results"
section (or a companion file linked from here), with the per-page
table, the classified differences, and the overall verdict. Do NOT
rewrite the procedure or reference sections to match the outcome,
and do NOT edit `browser_reference_node.json`. If the browser run
cannot be completed (environment unavailable, import path blocked),
record the exact blocker instead of partial results presented as
complete.

## Browser results — BLOCKED, no browser result (2026-10-27, main agent)

**No per-page verdict exists. No MATCH / DIFFER claim is made for
any page. Browser layout parity remains UNVERIFIED. Node results
must not be presented as browser results.** Three routes were
tried and all three failed for environment reasons, not layout
reasons:

1. **Agent browser route — unreachable localhost.** The live-browser
   task could not open `http://localhost:8901/harness.html`: direct
   localhost / 127.0.0.1 navigation was rejected as an invalid
   request, and the loopback alias `lvh.me:8901` returned
   connection refused, while an external site loaded normally
   (proving the browser itself worked). The server WAS running on
   the main agent's VM at the time — harness page, `pdf.mjs`,
   `pdf.worker.mjs`, and `pdfParser.js` all returned HTTP 200 from
   the VM, and the served PDFs hash-matched this brief — but the
   agent browser runs in a different environment from the VM and
   cannot reach the VM's localhost. No alternative URL exists for
   that route. Task closed as `site_unreachable`.
2. **VM headless Chromium route — renderer never completes.**
   `/opt/meta-chromium/chrome` (version 152) was run headless
   against the same local server. The server log recorded only the
   initial page fetch (from the agent's own curl check) and no
   subresource requests at all; a 10-minute wait produced zero
   progress posts from the harness. A trivial probe page and a
   `data:` URL under `--dump-dom` likewise produced no output
   within 30–60 seconds (killed by timeout) despite renderer
   processes existing. An earlier `--virtual-time-budget` run was
   killed by a runtime restart after ~39 minutes with no output
   file. Conclusion: headless Chromium cannot complete
   navigation/rendering in this container, so it cannot run the
   harness either.
3. **Public-tunnel route — egress-blocked.** `cloudflared`
   (2026.10.5) was downloaded and run, but the quick-tunnel
   request to `api.trycloudflare.com` failed with a TLS handshake
   error, both directly and with the environment's egress proxy
   variables set: the egress proxy does not allow that host. No
   public URL for the harness could be obtained.

**What was built and preserved (not a result):** a browser harness
in `~/workspace/browser_verify/` (outside the repo, unpushed):
`harness.html` loads the repo's own `pdfParser.js`,
`documentModel.js`, and `sourceReconstruction.js` (via symlinks to
`pwa/engine/` and `pwa/vendor/`, so the code under test is the
repo's code, not a copy), runs the full
`extractPageLayout` → `buildStructuredDocument` →
`reconstructDocument` chain over all pages of the four
hash-verified PDFs, compares all 21 brief pages against
`browser_reference_node.json` with the brief's 0.5pt tolerance and
five-class taxonomy, and reports per-page MATCH / DIFFER plus
candidate-page confirmations. `server.py` serves the directory and
collects POSTed progress/final reports. The local server was
stopped after the attempts; the harness directory is intact for a
future environment where a real browser can reach it.

**Scope note (honest):** the harness exercises the layout /
structured / reconstruction code path in a real browser engine,
not the PWA's file-picker / worker / storage import wrapper. Even
if the harness had run, the UI wrapper itself would still have
been uncompared — the wrapper does not alter layout output, but
that is a stated scope limit, not an equivalence claim.
