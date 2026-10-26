/**
 * StudySynth — Layout-Aware Source Reconstruction (Phase 2B).
 *
 * Phase 2A preserved every classified block with a disposition, but the
 * production batch still forwards only `bodyText`. Text preserved in
 * captions, fragments, ambiguous blocks, table segments and misclassified
 * blocks could not participate in knowledge extraction.
 *
 * This module is a SHADOW pipeline: it consumes the Phase 2A structured
 * document model (documentModel.buildStructuredDocument output) and
 * groups blocks into reconstructed source units suitable for
 * interpretation. It NEVER overwrites a block's text, NEVER changes a
 * block's disposition, and NEVER feeds the production question path.
 * A reconstructed unit is a new derived representation; the original
 * blocks stay exactly as the document model recorded them.
 *
 * Rules are ordered, deterministic, and recorded on every unit
 * (method + rule_id + certainty + explanation). Geometry comes from the
 * parser's own block bboxes (top-down y, x from the left margin, PDF
 * points); no universal coordinate system and no single fixed
 * x-threshold is assumed — column and margin decisions are derived
 * per page from the page's own blocks.
 *
 * Rule order (each step claims blocks; later steps see only leftovers):
 *   R-AGG      aggregate table blocks duplicating granular segments
 *   R-FURN     running-title furniture (spaceless-title, right-margin
 *              column) and page numbers; merged furniture blocks are
 *              STRIPPED, not dropped whole, when a body tail survives
 *   R-HEAD     false-heading demotion (body-column geometry + body
 *              height + unterminated predecessor + lowercase successor)
 *   R-CAP      caption stitching (contiguous caption + continuation
 *              fragments; the whole unit is caption-derived)
 *   R-GLOSS    margin-column glossary definitions (Term: definition)
 *   R-PROSE    column passages from remaining prose-eligible blocks
 *   R-TABLE    surviving table blocks (rows parsed, else unresolved)
 *   R-LEFT     leftovers become explicit unresolved units
 *   R-XPAGE    cross-page continuation candidates from the document
 *              model (strong merges are validated text; weak stay
 *              unmerged candidates)
 *
 * Runs 100% offline, deterministic, zero-network, zero-ML. No Date,
 * no Math.random, no locale-dependent ordering: unit IDs derive only
 * from the document ID and source order.
 */

(function (global) {
  'use strict';

  const RECONSTRUCTION_VERSION = 'phase2b-1';

  // Running book titles, as in pdfParser.js (spaced forms). The spaceless
  // comparison below also catches spaceless joins such as
  // "OurCulturalHeritageandKnowledgeTraditions".
  const RUNNING_TITLES_SPACED = [
    'exploring society',
    'india and the world',
    'governance and democracy',
    'economic life',
    'tapestry of the past',
    'our cultural heritage'
  ];
  const RUNNING_TITLES_SPACELESS = RUNNING_TITLES_SPACED.map((t) =>
    t.replace(/\s+/g, ''));

  // Words that let a caption continuation start with a capital: the
  // previous block ends with a function word, so the capitalised block
  // continues the same sentence (e.g. "... inside the" + "Mehrangarh").
  const CONTINUATION_FUNCTION_WORDS = [
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'with',
    'alongside', 'beside', 'from', 'by', 'at', 'on', 'over', 'under'
  ];

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  // Light punctuation-spacing normalisation for JOINED text only. Original
  // block texts are preserved verbatim in provenance; this only repairs
  // the item-join artefacts ("Temple ." -> "Temple.", "( vavs" ->
  // "(vavs"). Diacritics, hyphenation and "15 th" tokenisation are kept.
  function normalizeJoinedText(value) {
    return cleanText(value)
      .replace(/\s+([,.;:!?%\)\]])/g, '$1')
      .replace(/([\(\[])\s+/g, '$1');
  }

  function normalizeForMatch(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wordsOf(text) {
    return normalizeForMatch(text).split(' ').filter(Boolean);
  }

  function endsWithTerminalPunctuation(text) {
    return /[.!?"'")\]]\s*$/.test(cleanText(text));
  }

  function startsLowercase(text) {
    return /^[a-z]/.test(cleanText(text));
  }

  function startsUppercaseOrAe(text) {
    const t = cleanText(text);
    return /^[A-Z\u00C6]/.test(t);
  }

  function bboxOf(block) {
    const b = block.bbox || {};
    const x = Number.isFinite(b.x) ? b.x : 0;
    const y = Number.isFinite(b.y) ? b.y : 0;
    const width = Number.isFinite(b.width) ? b.width : 0;
    const height = Number.isFinite(b.height) ? b.height : 0;
    return {
      x: x, y: y, width: width, height: height,
      x1: Number.isFinite(b.x1) ? b.x1 : x + width,
      y1: Number.isFinite(b.y1) ? b.y1 : y + height
    };
  }

  function xOverlap(a, b) {
    return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x, b.x));
  }

  function compareBlocks(a, b) {
    const ba = bboxOf(a);
    const bb = bboxOf(b);
    if (ba.y !== bb.y) return ba.y - bb.y;
    if (ba.x !== bb.x) return ba.x - bb.x;
    const ida = a.source_block_id || a.block_id || '';
    const idb = b.source_block_id || b.block_id || '';
    return ida < idb ? -1 : ida > idb ? 1 : 0;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function modeValue(values) {
    const counts = {};
    let best = null;
    let bestCount = 0;
    values.forEach((v) => {
      counts[v] = (counts[v] || 0) + 1;
      if (counts[v] > bestCount) { bestCount = counts[v]; best = v; }
    });
    return best;
  }

  function isAggregateTableText(text) {
    return text.indexOf(' | ') !== -1;
  }

  function parseTableRows(text) {
    const source = cleanText(text);
    if (source.indexOf('|') === -1) return null;
    const rows = source.split(' ; ').map((row) =>
      row.split('|').map((cell) => cell.trim()));
    if (rows.length < 1) return null;
    const width = rows[0].length;
    if (width < 2) return null;
    for (const row of rows) {
      if (row.length !== width) return null;
      for (const cell of row) {
        if (!cell || cell.length > 120) return null;
      }
    }
    return rows;
  }

  function captionFigureRef(text) {
    const match = cleanText(text).match(/^(?:fig\.?|figure|photo|map|table)\s+(\d+(?:\.\d+)*)/i);
    if (!match) return null;
    const kind = /^(?:fig\.?|figure)$/i.test(match[0].split(/\s+/)[0])
      ? 'fig' : match[0].split(/\s+/)[0].toLowerCase();
    return kind + ' ' + match[1];
  }

  // Conservative list detection inside a passage (same rule as the
  // document model): at least two items with explicit markers. Never
  // invents boundaries from commas or ordinary prose.
  function detectListItems(text) {
    const source = cleanText(text);
    if (!source) return null;
    const parts = source.split(/\s+(?=(?:•|·|–|-|\d{1,2}[.)]|[a-z][.)])\s+)/);
    if (parts.length < 2) return null;
    const items = [];
    for (const part of parts) {
      const match = part.match(/^(?:•|·|–|-|\d{1,2}[.)]|[a-z][.)])\s+(.+)$/);
      if (!match || match[1].length < 2 || match[1].length > 300) return null;
      items.push(match[1].trim());
    }
    if (items.length < 2) return null;
    return items;
  }

  // Join block texts in order. A fragment ending with '-' joins without
  // a space (line-break hyphenation: "criss-" + "crossing" ->
  // "criss-crossing"). Everything else joins with a single space.
  function joinBlockTexts(blocks) {
    let out = '';
    blocks.forEach((block) => {
      const text = cleanText(block.text);
      if (!text) return;
      if (!out) { out = text; return; }
      out += (out.endsWith('-') ? '' : ' ') + text;
    });
    return normalizeJoinedText(out);
  }

  // De-hyphenate line-break hyphens inside already-joined text
  // ("criss- crossing" -> "criss-crossing"). Applied to glossary units
  // only, where the margin column breaks words across lines.
  function dehyphenate(text) {
    return cleanText(text).replace(/(\w)-\s+(\w)/g, '$1-$2');
  }

  function longestSpacelessToken(text) {
    const tokens = cleanText(text).split(/\s+/).filter(Boolean);
    let best = 0;
    tokens.forEach((t) => { if (t.length > best) best = t.length; });
    return best;
  }

  function startsWithRunningTitle(text) {
    const spaceless = cleanText(text).replace(/\s+/g, '').toLowerCase();
    return RUNNING_TITLES_SPACELESS.some((t) => spaceless.indexOf(t) === 0);
  }

  // Strip a leading running-title furniture prefix ("Exploring Society:
  // India and Beyond | Grade 8 Part 2 ") and return the surviving tail,
  // or null when the block carries no such prefix. Geometry cannot do
  // this split: the furniture and body items share x-intervals.
  // The Part-consuming pattern is tried FIRST: a single pattern with an
  // optional Part group backtracks on a furniture-only block ("... | Grade
  // 8 Part 2" with nothing after it) and would otherwise return the bogus
  // tail "Part 2".
  function stripFurniturePrefix(text) {
    const source = cleanText(text);
    let match = source.match(/^(.*?)\|\s*grade\s+\d+\s+part\s+\d+\s*(.*)$/i);
    if (!match) match = source.match(/^(.*?)\|\s*grade\s+\d+\s*(.*)$/i);
    if (!match) return null;
    const head = match[1];
    const headSpaceless = head.replace(/\s+/g, '').toLowerCase();
    const headIsTitle = RUNNING_TITLES_SPACELESS.some((t) =>
      headSpaceless.indexOf(t) !== -1);
    if (!headIsTitle) return null;
    return { prefix: source.slice(0, source.length - match[2].length).trim(), tail: match[2].trim() };
  }

  function majoritySection(blocks) {
    const counts = {};
    let best = null;
    let bestCount = 0;
    blocks.forEach((b) => {
      const key = b.section_id || 'sec_unknown';
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > bestCount) {
        bestCount = counts[key];
        best = { section_id: key, section_title: b.section_title || null };
      }
    });
    return best || { section_id: 'sec_unknown', section_title: null };
  }

  function provenanceOf(blocks) {
    // For rescued furniture tails, provenance carries the ORIGINAL block
    // text (furniture prefix included): the tail in fragments_used is
    // what was used, but provenance must show what the block actually
    // contained, or the "exact original block text" claim is false.
    return blocks.map((b) => ({
      block_id: b.source_block_id,
      page: b.page,
      type: b.type,
      text: cleanText(b.original_text || b.text),
      bbox: bboxOf(b)
    }));
  }

  /**
   * Reconstruct source units for one document model.
   *
   * @param {Object} docModel — buildStructuredDocument output.
   * @param {Object} options — { documentId }.
   * @returns {Object} { version, document_id, units[], exclusions[],
   *   accounting{}, reconciliation{} }.
   *
   * Unit schema (stable for Phase 2B diagnostics):
   *   unit_id, type, text, block_ids[], fragments_used[], fragments_excluded[],
   *   pages[], section_id, section_title, method, rule_id, certainty,
   *   certainty_explanation, review_flags[], figure_ref (captions),
   *   term/definition (glossary), table_rows (tables),
   *   provenance[] (exact original block text + positions).
   */
  function reconstructDocument(docModel, options) {
    const opts = options || {};
    const documentId = opts.documentId || (docModel && docModel.document_id) || 'unknown-document';
    const allBlocks = docModel && Array.isArray(docModel.blocks) ? docModel.blocks : [];

    const units = [];
    const exclusions = [];
    let unitSeq = 0;

    // Block accounting: every document block lands in exactly one bucket.
    const bucketOf = {}; // source_block_id -> bucket
    const excludedBlocks = {}; // source_block_id -> exclusion record

    function nextUnitId() {
      unitSeq++;
      return 'RU-' + String(unitSeq).padStart(3, '0');
    }

    function makeUnit(fields) {
      const unit = {
        unit_id: nextUnitId(),
        type: fields.type,
        text: fields.text || '',
        block_ids: fields.block_ids || [],
        fragments_used: fields.fragments_used || [],
        fragments_excluded: fields.fragments_excluded || [],
        pages: fields.pages || [],
        section_id: fields.section_id || 'sec_unknown',
        section_title: fields.section_title || null,
        method: fields.method,
        rule_id: fields.rule_id,
        certainty: fields.certainty,
        certainty_explanation: fields.certainty_explanation || '',
        review_flags: fields.review_flags || [],
        figure_ref: fields.figure_ref || null,
        term: fields.term || null,
        definition: fields.definition || null,
        table_rows: fields.table_rows || null,
        provenance: fields.provenance || []
      };
      units.push(unit);
      return unit;
    }

    function markBucket(block, bucket) {
      bucketOf[block.source_block_id] = bucket;
    }

    function excludeBlock(block, reason, ruleId, detail) {
      exclusions.push({
        block_id: block.source_block_id,
        page: block.page,
        type: block.type,
        reason: reason,
        rule_id: ruleId,
        detail: detail || null
      });
      excludedBlocks[block.source_block_id] = true;
      markBucket(block, 'excluded:' + reason);
    }

    // Group blocks by page, in source order.
    const pagesMap = {};
    allBlocks.forEach((b) => {
      (pagesMap[b.page] || (pagesMap[b.page] = [])).push(b);
    });
    const pageNumbers = Object.keys(pagesMap).map(Number).sort((a, b) => a - b);

    pageNumbers.forEach((pageNumber) => {
      const pageBlocks = pagesMap[pageNumber].slice();
      const byY = pageBlocks.slice().sort(compareBlocks);
      const bodyBlocks = pageBlocks.filter((b) => b.type === 'body');
      const bodyHeights = bodyBlocks.map((b) => bboxOf(b).height).filter((h) => h > 0);
      const bodyHeightMedian = median(bodyHeights) || 12;
      const bodyXValues = bodyBlocks.map((b) => bboxOf(b).x);
      const modalBodyX = modeValue(bodyXValues);
      const bodyX1Max = bodyBlocks.reduce((m, b) => Math.max(m, bboxOf(b).x1), 0);

      const claimed = {}; // source_block_id -> unit kind that claimed it
      const rescuedTails = {}; // source_block_id -> { text, prefix }

      // ---- R-AGG: aggregate table blocks duplicating granular segments.
      const granularWords = {};
      pageBlocks.forEach((b) => {
        if (b.type === 'table' && isAggregateTableText(b.text)) return;
        wordsOf(b.text).forEach((w) => { granularWords[w] = true; });
      });
      pageBlocks.forEach((b) => {
        if (b.type !== 'table' || !isAggregateTableText(b.text)) return;
        const aggWords = wordsOf(b.text);
        const covered = aggWords.filter((w) => granularWords[w]).length;
        const coverage = aggWords.length ? covered / aggWords.length : 0;
        const tallAggregate = b.text.indexOf(' ; ') !== -1
          && bboxOf(b).height > 2.5 * bodyHeightMedian;
        if (coverage >= 0.9 || tallAggregate) {
          excludeBlock(b, 'aggregate_duplicates_granular_segments', 'reconstruct-v1/aggregate-duplicate',
            'coverage ' + coverage.toFixed(2) + (tallAggregate ? ', multi-row tall aggregate' : '')
            + '; granular segments are the source, aggregate retained for diagnostics');
          claimed[b.source_block_id] = 'excluded';
        }
      });

      // ---- R-FURN: furniture, page numbers, furniture-prefix strips.
      pageBlocks.forEach((b) => {
        if (claimed[b.source_block_id]) return;
        const box = bboxOf(b);
        const text = cleanText(b.text);
        // Page numbers: pure digits, narrow, at a side margin.
        if (/^\d+$/.test(text) && box.width <= 30 && (box.x <= 110 || box.x >= 520)) {
          excludeBlock(b, 'page_number', 'reconstruct-v1/page-number', 'pure-digit block at side margin');
          claimed[b.source_block_id] = 'excluded';
          return;
        }
        // Spaceless running title anywhere on the page (defeats both the
        // parser's spaced pattern and its margin test).
        if (longestSpacelessToken(text) >= 25 && startsWithRunningTitle(text)) {
          excludeBlock(b, 'running_title_furniture', 'reconstruct-v1/spaceless-title',
            'spaceless running-title token, height ' + box.height);
          claimed[b.source_block_id] = 'excluded';
          return;
        }
        // Right-margin furniture column: starts well beyond every body
        // block's right edge, is short, and carries a long spaceless token.
        // Uses the page's own body extent, never a fixed x-threshold.
        if (box.x > bodyX1Max + 40 && box.height <= 0.75 * bodyHeightMedian
          && longestSpacelessToken(text) >= 25) {
          excludeBlock(b, 'right_margin_furniture', 'reconstruct-v1/right-margin-column',
            'x ' + box.x + ' beyond body right edge ' + bodyX1Max + ', height ' + box.height);
          claimed[b.source_block_id] = 'excluded';
          return;
        }
        // Callout banners: short all-caps multi-word fragments
        // ("DON'T MISS OUT") are sidebar artefacts, not prose. The
        // no-digits guard keeps date strings ("2600 BCE", "600–900 CE")
        // and the multi-word guard keeps single labels out of this rule.
        if ((b.type === 'fragment' || b.type === 'ambiguous')
          && text.length >= 3 && text.length <= 40
          && !/[a-z]/.test(text) && /[A-Z]/.test(text) && !/\d/.test(text)
          && text.split(/\s+/).filter(Boolean).length >= 2) {
          excludeBlock(b, 'callout_banner_artifact', 'reconstruct-v1/callout-banner',
            'all-caps short fragment, no lowercase letters');
          claimed[b.source_block_id] = 'excluded';
          return;
        }
        // Merged furniture blocks: strip the furniture prefix, rescue tail.
        if (b.type === 'page_furniture') {
          const stripped = stripFurniturePrefix(text);
          if (stripped && stripped.tail) {
            rescuedTails[b.source_block_id] = stripped;
            return; // kept as a rescued fragment below; not excluded whole
          }
          excludeBlock(b, 'page_furniture', 'reconstruct-v1/furniture-block',
            'furniture block with no surviving body tail');
          claimed[b.source_block_id] = 'excluded';
          return;
        }
      });

      // Rescued furniture tails become fragments with full provenance.
      const rescuedBlocks = pageBlocks.filter((b) => rescuedTails[b.source_block_id]).map((b) => {
        const stripped = rescuedTails[b.source_block_id];
        return {
          source_block_id: b.source_block_id,
          block_id: b.block_id,
          page: b.page,
          type: 'fragment',
          text: stripped.tail,
          original_text: cleanText(b.text),
          furniture_prefix: stripped.prefix,
          bbox: bboxOf(b),
          section_id: b.section_id,
          section_title: b.section_title,
          rescued_tail: true
        };
      });

      // Working pool: unclaimed blocks (in y-order) + rescued tails.
      let pool = byY.filter((b) => !claimed[b.source_block_id]).concat(rescuedBlocks);
      pool = pool.sort(compareBlocks);
      const isClaimed = (b) => !!claimed[b.source_block_id];
      const claim = (b, kind) => { claimed[b.source_block_id] = kind; };

      // ---- R-HEAD: false-heading demotion.
      const demoted = {};
      pool.forEach((b, index) => {
        if (b.type !== 'heading') return;
        const box = bboxOf(b);
        const prev = pool.slice(0, index).reverse().find((o) =>
          !isClaimed(o) && o.type !== 'heading' && o.type !== 'caption');
        const next = pool.slice(index + 1).find((o) =>
          !isClaimed(o) && o.type !== 'heading' && o.type !== 'caption');
        // Body LINE height is 12pt; block heights are multi-line, so the
        // test is against a single-line height (<= 14.5), not the median
        // block height. Genuine NCERT section headings are 17pt and
        // fail this test; the p.17 fragment heading is 12pt and passes.
        const heightMatches = box.height <= 14.5;
        const xMatches = modalBodyX != null && Math.abs(box.x - modalBodyX) <= 5;
        const prevUnterminated = prev && !endsWithTerminalPunctuation(prev.text);
        const nextLowercase = next && startsLowercase(next.text);
        if (heightMatches && xMatches && prevUnterminated && nextLowercase) {
          demoted[b.source_block_id] = true;
        }
      });

      // ---- R-CAP: caption stitching.
      pool.forEach((b) => {
        if (isClaimed(b) || b.type !== 'caption') return;
        const parts = [b];
        claim(b, 'caption');
        let prev = b;
        for (;;) {
          const prevBox = bboxOf(prev);
          // Only the IMMEDIATE next unclaimed block in y-order may
          // continue a caption. Skipping ahead would steal prose: on
          // p.14 the caption's true successor in y-order is a prose
          // fragment with no x-overlap, and the block after that is a
          // body block that must stay in the prose passage.
          const next = pool.filter((o) => !isClaimed(o) && o.type !== 'caption'
            && o.type !== 'heading' && o.type !== 'page_furniture')
            .sort(compareBlocks)
            .find((o) => bboxOf(o).y >= prevBox.y);
          if (!next) break;
          const ob = bboxOf(next);
          if (ob.y - prevBox.y > 30) break;
          if (xOverlap(prevBox, ob) < 30) break;
          if (endsWithTerminalPunctuation(prev.text)) break;
          if (!startsLowercase(next.text)) {
            const lastWord = cleanText(prev.text).split(/\s+/).pop() || '';
            if (CONTINUATION_FUNCTION_WORDS.indexOf(
              lastWord.toLowerCase().replace(/[^a-z]/g, '')) === -1) break;
          }
          parts.push(next);
          claim(next, 'caption');
          prev = next;
        }
        const section = majoritySection(parts);
        const joined = joinBlockTexts(parts);
        makeUnit({
          type: 'caption',
          text: joined,
          block_ids: parts.map((p) => p.source_block_id),
          fragments_used: parts.map((p) => ({
            block_id: p.source_block_id, text: cleanText(p.text), role: 'caption_part'
          })),
          pages: [pageNumber],
          section_id: section.section_id,
          section_title: section.section_title,
          method: 'caption_continuation_join',
          rule_id: 'reconstruct-v1/caption-continuation',
          certainty: 'caption_stitched',
          certainty_explanation: 'Contiguous y-ordered caption + continuation blocks with '
            + 'x-overlap and sentence continuity; the whole unit is caption-derived.',
          review_flags: [],
          figure_ref: captionFigureRef(b.text),
          provenance: provenanceOf(parts)
        });
        parts.forEach((p) => markBucket(p, 'unit_block'));
      });

      // ---- R-GLOSS: margin-column glossary definitions.
      // Clusters of fragment/ambiguous blocks linked by x-overlap, with
      // no body block, sitting entirely on one side of the body column.
      const glossCandidates = pool.filter((b) => !isClaimed(b)
        && (b.type === 'fragment' || b.type === 'ambiguous'));
      // Clusters linked by x-overlap, split on y-top gaps > 60 so two
      // separate margin notes never merge into one fake definition.
      const glossClusters = [];
      glossCandidates.slice().sort(compareBlocks).forEach((b) => {
        const box = bboxOf(b);
        let cluster = null;
        for (let i = glossClusters.length - 1; i >= 0; i--) {
          const c = glossClusters[i];
          const last = c.blocks[c.blocks.length - 1];
          if (c.blocks.some((o) => xOverlap(bboxOf(o), box) >= 20)
            && (box.y - bboxOf(last).y) <= 60) {
            cluster = c;
            break;
          }
        }
        if (!cluster) {
          cluster = { blocks: [] };
          glossClusters.push(cluster);
        }
        cluster.blocks.push(b);
      });
      // Body column extent from UNCLAIMED body blocks only: caption
      // continuations typed as body (e.g. a caption tail at x=148) must
      // not shrink the body column and hide a margin gloss.
      const unclaimedBody = pool.filter((b) => !isClaimed(b) && b.type === 'body');
      const unclaimedBodyXMin = unclaimedBody.length
        ? Math.min.apply(null, unclaimedBody.map((o) => bboxOf(o).x)) : null;
      const unclaimedBodyX1Max = unclaimedBody.length
        ? Math.max.apply(null, unclaimedBody.map((o) => bboxOf(o).x1)) : 0;
      glossClusters.forEach((cluster) => {
        if (!cluster.blocks.length) return;
        const ordered = cluster.blocks.slice().sort(compareBlocks);
        const joined = dehyphenate(joinBlockTexts(ordered));
        const termMatch = joined.match(/^([A-Z][A-Za-z\u2019' -]{0,40}?):\s+([\s\S]+)$/);
        if (!termMatch) return;
        // A second "Term:" after a sentence end means two notes merged;
        // refuse the gloss rather than swallowing the second note.
        if (/[.!?]\s+[A-Z][A-Za-z\u2019' -]{1,40}:\s/.test(termMatch[2])) return;
        const clusterX1Max = Math.max.apply(null, ordered.map((o) => bboxOf(o).x1));
        const clusterXMin = Math.min.apply(null, ordered.map((o) => bboxOf(o).x));
        const isMarginColumn = (unclaimedBodyXMin != null && clusterX1Max < unclaimedBodyXMin)
          || (unclaimedBodyX1Max && clusterXMin > unclaimedBodyX1Max);
        if (!isMarginColumn) return;
        ordered.forEach((o) => claim(o, 'glossary'));
        const section = majoritySection(ordered);
        makeUnit({
          type: 'glossary_definition',
          text: joined,
          block_ids: ordered.map((o) => o.source_block_id),
          fragments_used: ordered.map((o) => ({
            block_id: o.source_block_id, text: cleanText(o.text), role: 'gloss_fragment'
          })),
          pages: [pageNumber],
          section_id: section.section_id,
          section_title: section.section_title,
          method: 'margin_column_gloss_join',
          rule_id: 'reconstruct-v1/margin-gloss',
          certainty: 'glossary_margin_column',
          certainty_explanation: 'Fragment/ambiguous blocks in a margin column, '
            + 'joined in y-order, matching an explicit Term: definition structure. '
            + 'No link to any nearby building or image is inferred from proximity.',
          review_flags: ['glossary_building_link_not_inferred'],
          term: termMatch[1].trim(),
          definition: termMatch[2].trim(),
          provenance: provenanceOf(ordered)
        });
        ordered.forEach((o) => markBucket(o, 'unit_block'));
      });

      // ---- R-PROSE: column passages from remaining prose-eligible blocks.
      const proseEligible = (b) => !isClaimed(b) && (
        b.type === 'body' || b.type === 'fragment' || b.type === 'ambiguous'
        || demoted[b.source_block_id]
        || (b.type === 'table' && !isAggregateTableText(b.text))
        || !!b.rescued_tail
      );
      const prosePool = pool.filter(proseEligible);
      // Column clustering. Word-blocks in one column never overlap each
      // other in x (words sit side by side with gaps), so pairwise
      // overlap strands single words ("or", "In", "a") as orphans, and
      // incremental span growth strands the first words until a wide
      // block happens to bridge them. Two mechanisms, in order:
      // (a) When the parser found a gutter (layout stats), it is the
      //     column boundary: blocks strictly left of gapStart go left,
      //     strictly right of gapEnd go right, and spanning/in-gutter
      //     blocks continue the previous block's cluster (full-width
      //     body text is passage flow, not a third column).
      // (b) Without gutter stats (e.g. synthetic fixtures), merge by
      //     span proximity: a block joins a cluster when its interval
      //     is within 40pt of the cluster's span. Word gaps are ~27pt;
      //     genuine gutters are wider, and (a) handles real pages.
      const pageEntry = (docModel.pages || []).find((p) => p.page === pageNumber);
      const gutter = pageEntry && pageEntry.layout_stats && pageEntry.layout_stats.gutter;
      const hasGutter = gutter && gutter.gapStart != null && gutter.gapEnd != null;
      const clusters = [];
      let lastCluster = null;
      prosePool.forEach((b) => {
        const box = bboxOf(b);
        let target = null;
        if (hasGutter) {
          if (box.x1 <= gutter.gapStart) {
            target = clusters.find((c) => c.side === 'left');
            if (!target) { target = { blocks: [], side: 'left' }; clusters.push(target); }
          } else if (box.x >= gutter.gapEnd) {
            target = clusters.find((c) => c.side === 'right');
            if (!target) { target = { blocks: [], side: 'right' }; clusters.push(target); }
          } else {
            target = lastCluster;
            if (!target) { target = { blocks: [], side: 'flow' }; clusters.push(target); }
          }
        } else {
          for (let i = clusters.length - 1; i >= 0; i--) {
            const cluster = clusters[i];
            const spanX = Math.min.apply(null, cluster.blocks.map((o) => bboxOf(o).x));
            const spanX1 = Math.max.apply(null, cluster.blocks.map((o) => bboxOf(o).x1));
            if (box.x <= spanX1 + 40 && box.x1 >= spanX - 40) {
              target = cluster;
              break;
            }
          }
          if (!target) { target = { blocks: [] }; clusters.push(target); }
        }
        target.blocks.push(b);
        lastCluster = target;
      });
      clusters.forEach((cluster) => {
        const ordered = cluster.blocks.slice().sort(compareBlocks);
        // Split into passages: previous block ends with terminal
        // punctuation AND next starts uppercase/AE AND y-top gap > 60.
        const passages = [];
        let current = [];
        ordered.forEach((b) => {
          if (current.length) {
            const prev = current[current.length - 1];
            const gap = bboxOf(b).y - bboxOf(prev).y;
            if (endsWithTerminalPunctuation(prev.text)
              && startsUppercaseOrAe(b.text) && gap > 60) {
              passages.push(current);
              current = [];
            }
          }
          current.push(b);
        });
        if (current.length) passages.push(current);
        passages.forEach((passage) => {
          // Only genuine body blocks or rescued furniture tails anchor a
          // passage as prose. A demoted heading joins prose but never
          // anchors it alone — otherwise a lone heading fragment could
          // become a fake prose unit.
          const hasBody = passage.some((o) => o.type === 'body' || !!o.rescued_tail);
          const hasBodyTyped = hasBody;
          // A passage containing a demoted heading must NOT take the
          // false section the document model built from that heading:
          // its section is the section of its first non-demoted block
          // (the prose the heading interrupted).
          const hasDemoted = passage.some((o) => demoted[o.source_block_id]);
          let section = majoritySection(passage);
          const sectionFlags = [];
          if (hasDemoted) {
            const anchor = passage.find((o) => !demoted[o.source_block_id]);
            if (anchor) {
              section = { section_id: anchor.section_id || 'sec_unknown', section_title: anchor.section_title || null };
              sectionFlags.push('section_corrected_from_demoted_heading');
            }
          }
          const joined = joinBlockTexts(passage);
          // Blocks inside the passage y-span that were NOT used (e.g. a
          // caption interleaved in y-order) are recorded as excluded
          // fragments of this unit, not silently dropped.
          const spanTop = Math.min.apply(null, passage.map((o) => bboxOf(o).y));
          const spanBottom = Math.max.apply(null, passage.map((o) => bboxOf(o).y1));
          const excludedInSpan = pageBlocks.filter((o) =>
            !passage.some((p) => p.source_block_id === o.source_block_id)
            && bboxOf(o).y >= spanTop && bboxOf(o).y <= spanBottom
            && (o.type === 'caption' || claimed[o.source_block_id] === 'caption'))
            .map((o) => ({ block_id: o.source_block_id, text: cleanText(o.text), reason: 'caption_not_prose' }));
          if (hasBodyTyped || hasBody) {
            passage.forEach((o) => claim(o, 'prose'));
            const listItems = detectListItems(joined);
            if (listItems) {
              makeUnit({
                type: 'list',
                text: joined,
                block_ids: passage.map((o) => o.source_block_id),
                fragments_used: passage.map((o) => ({
                  block_id: o.source_block_id, text: cleanText(o.text),
                  role: demoted[o.source_block_id] ? 'demoted_heading' : (o.rescued_tail ? 'furniture_tail' : o.type)
                })),
                fragments_excluded: excludedInSpan,
                pages: [pageNumber],
                section_id: section.section_id,
                section_title: section.section_title,
                method: 'column_passage_join',
                rule_id: 'reconstruct-v1/column-passage',
                certainty: 'verbatim_column_join',
                certainty_explanation: 'Prose-eligible blocks in one x-overlap column, '
                  + 'joined in (y, x) order; split only on terminal punctuation + '
                  + 'capital start + y-top gap > 60. List markers detected.',
                review_flags: (passage.some((o) => demoted[o.source_block_id])
                  ? ['contains_demoted_heading'] : []).concat(sectionFlags),
                provenance: provenanceOf(passage)
              });
            } else {
              makeUnit({
                type: 'body_prose',
                text: joined,
                block_ids: passage.map((o) => o.source_block_id),
                fragments_used: passage.map((o) => ({
                  block_id: o.source_block_id, text: cleanText(o.text),
                  role: demoted[o.source_block_id] ? 'demoted_heading' : (o.rescued_tail ? 'furniture_tail' : o.type)
                })),
                fragments_excluded: excludedInSpan,
                pages: [pageNumber],
                section_id: section.section_id,
                section_title: section.section_title,
                method: 'column_passage_join',
                rule_id: 'reconstruct-v1/column-passage',
                certainty: 'verbatim_column_join',
                certainty_explanation: 'Prose-eligible blocks in one x-overlap column, '
                  + 'joined in (y, x) order; split only on terminal punctuation + '
                  + 'capital start + y-top gap > 60.',
                review_flags: (passage.some((o) => demoted[o.source_block_id])
                  ? ['contains_demoted_heading'] : []).concat(sectionFlags),
                provenance: provenanceOf(passage)
              });
            }
            passage.forEach((o) => markBucket(o, 'unit_block'));
          } else {
            // A passage with no body block is not prose: keep it as an
            // explicit unresolved fragment passage, never a fake fact.
            passage.forEach((o) => claim(o, 'unresolved'));
            makeUnit({
              type: 'unresolved',
              text: joined,
              block_ids: passage.map((o) => o.source_block_id),
              fragments_used: passage.map((o) => ({
                block_id: o.source_block_id, text: cleanText(o.text), role: o.type
              })),
              pages: [pageNumber],
              section_id: section.section_id,
              section_title: section.section_title,
              method: 'fragment_passage_no_body_block',
              rule_id: 'reconstruct-v1/unresolved-fragment-passage',
              certainty: 'unresolved_fragment',
              certainty_explanation: 'Fragment/ambiguous blocks joined in y-order but '
                + 'with no body block to anchor them as prose; kept for review, '
                + 'never sent to the fact extractor as a complete assertion.',
              review_flags: ['no_body_anchor'],
              provenance: provenanceOf(passage)
            });
            passage.forEach((o) => markBucket(o, 'unit_block'));
          }
        });
      });

      // ---- R-TABLE: surviving table blocks (aggregates already excluded).
      pool.filter((b) => !isClaimed(b) && b.type === 'table' && isAggregateTableText(b.text))
        .forEach((b) => {
          claim(b, 'table');
          const rows = parseTableRows(b.text);
          const section = majoritySection([b]);
          if (rows) {
            makeUnit({
              type: 'table',
              text: cleanText(b.text),
              block_ids: [b.source_block_id],
              fragments_used: [{ block_id: b.source_block_id, text: cleanText(b.text), role: 'table_block' }],
              pages: [pageNumber],
              section_id: section.section_id,
              section_title: section.section_title,
              method: 'table_rows_parsed',
              rule_id: 'reconstruct-v1/table-rows',
              certainty: 'table_rows_parsed',
              certainty_explanation: 'Table block rows/cells parsed with a uniform column count.',
              review_flags: [],
              table_rows: rows,
              provenance: provenanceOf([b])
            });
          } else {
            makeUnit({
              type: 'unresolved',
              text: cleanText(b.text),
              block_ids: [b.source_block_id],
              fragments_used: [{ block_id: b.source_block_id, text: cleanText(b.text), role: 'table_block' }],
              pages: [pageNumber],
              section_id: section.section_id,
              section_title: section.section_title,
              method: 'table_relationship_unresolved',
              rule_id: 'reconstruct-v1/table-unresolved',
              certainty: 'unresolved_fragment',
              certainty_explanation: 'Table block preserved intact; row/cell relationships '
                + 'could not be recovered reliably.',
              review_flags: ['table_relationship_unresolved'],
              provenance: provenanceOf([b])
            });
          }
          markBucket(b, 'unit_block');
        });

      // ---- R-LEFT: leftovers become explicit unresolved units.
      pool.filter((b) => !isClaimed(b)).forEach((b) => {
        if (b.type === 'heading') {
          // Genuine section markers define sections; they are not source
          // units for interpretation. Recorded in accounting, not units.
          markBucket(b, 'section_marker');
          return;
        }
        if (b.type === 'page_furniture') {
          // Already handled by the strip rule; anything left here was
          // excluded whole (claimed) — this branch is defensive only.
          markBucket(b, 'excluded:page_furniture');
          return;
        }
        claim(b, 'unresolved');
        const reason = b.type === 'diagram' ? 'visual_dependency'
          : b.type === 'table' ? 'table_relationship_unresolved'
          : 'fragment_preserved';
        const section = majoritySection([b]);
        makeUnit({
          type: 'unresolved',
          text: cleanText(b.text),
          block_ids: [b.source_block_id],
          fragments_used: [{ block_id: b.source_block_id, text: cleanText(b.text), role: b.type }],
          pages: [pageNumber],
          section_id: section.section_id,
          section_title: section.section_title,
          method: 'leftover_preserved',
          rule_id: 'reconstruct-v1/leftover-unresolved',
          certainty: b.type === 'diagram' ? 'unresolved_visual' : 'unresolved_fragment',
          certainty_explanation: b.type === 'diagram'
            ? 'Diagram/visual block: relationships cannot be established from text alone.'
            : 'Block not consumed by any reconstruction rule; preserved with its '
            + 'original text and position for review.',
          review_flags: ['unresolved_leftover'],
          provenance: provenanceOf([b])
        });
        markBucket(b, 'unit_block');
      });

      // Rescued tails: their original block counts once, as stripped.
      rescuedBlocks.forEach((rb) => {
        const original = pageBlocks.find((o) => o.source_block_id === rb.source_block_id);
        if (!original) return;
        if (claimed[rb.source_block_id] && claimed[rb.source_block_id] !== 'excluded') {
          markBucket(original, 'stripped_furniture_tail');
        }
      });
    });

    // ---- R-XPAGE: cross-page continuation candidates (document model).
    const continuations = (docModel && Array.isArray(docModel.continuations))
      ? docModel.continuations : [];
    const blockById = {};
    allBlocks.forEach((b) => { blockById[b.source_block_id] = b; });
    let skippedContinuations = 0;
    continuations.forEach((c) => {
      const from = blockById[c.from_block_id.replace(/^[^:]+:/, '')]
        || allBlocks.find((b) => b.block_id === c.from_block_id);
      const to = blockById[c.to_block_id.replace(/^[^:]+:/, '')]
        || allBlocks.find((b) => b.block_id === c.to_block_id);
      if (!from || !to) return;
      // A continuation endpoint that reconstruction excluded as
      // furniture (e.g. a series-title block the parser typed as body)
      // is not prose: the continuation is spurious and must not resurrect
      // an excluded block inside a merged unit.
      if (excludedBlocks[from.source_block_id] || excludedBlocks[to.source_block_id]) {
        skippedContinuations++;
        return;
      }
      const fromId = from.source_block_id;
      const toId = to.source_block_id;
      if (c.support === 'strong') {
        const merged = joinBlockTexts([from, to]);
        const section = majoritySection([from, to]);
        makeUnit({
          type: 'cross_page_continuation',
          text: merged,
          block_ids: [fromId, toId],
          fragments_used: [
            { block_id: fromId, text: cleanText(from.text), role: 'continuation_from' },
            { block_id: toId, text: cleanText(to.text), role: 'continuation_to' }
          ],
          pages: [from.page, to.page],
          section_id: section.section_id,
          section_title: section.section_title,
          method: 'cross_page_strong_merge',
          rule_id: 'reconstruct-v1/cross-page-strong',
          certainty: 'cross_page_strong',
          certainty_explanation: 'Document-model strong continuation (previous page ends '
            + 'without terminal punctuation, next page starts lowercase, first content '
            + 'block is body). Merged text overlaps the per-page passages; typed facts '
            + 'from merged units are accounted separately and flagged as overlapping.',
          review_flags: ['merged_text_overlaps_passages'],
          provenance: provenanceOf([from, to])
        });
      } else {
        const section = majoritySection([from, to]);
        makeUnit({
          type: 'cross_page_continuation_candidate',
          text: '',
          block_ids: [fromId, toId],
          fragments_used: [
            { block_id: fromId, text: cleanText(from.text), role: 'continuation_from' },
            { block_id: toId, text: cleanText(to.text), role: 'continuation_to' }
          ],
          pages: [from.page, to.page],
          section_id: section.section_id,
          section_title: section.section_title,
          method: 'cross_page_weak_candidate',
          rule_id: 'reconstruct-v1/cross-page-weak',
          certainty: 'unresolved_fragment',
          certainty_explanation: 'Weak cross-page continuation candidate: parts preserved '
            + 'and linked, text NOT merged, never sent to the fact extractor.',
          review_flags: ['cross_page_weak_unmerged'],
          provenance: provenanceOf([from, to])
        });
      }
    });

    // Accounting: reconstructed-text accounting, kept separate from
    // typed-fact accounting (the typed adapter reports its own counts).
    const accounting = {
      pages_covered: pageNumbers.length,
      blocks_total: allBlocks.length,
      units_total: units.length,
      units_by_type: {},
      units_by_certainty: {},
      units_by_rule: {},
      blocks_in_units: 0,
      exclusions_total: exclusions.length,
      exclusions_by_reason: {},
      section_markers: 0,
      stripped_furniture_tails: 0,
      cross_page_continuations_skipped: skippedContinuations
    };
    units.forEach((u) => {
      accounting.units_by_type[u.type] = (accounting.units_by_type[u.type] || 0) + 1;
      accounting.units_by_certainty[u.certainty] = (accounting.units_by_certainty[u.certainty] || 0) + 1;
      accounting.units_by_rule[u.rule_id] = (accounting.units_by_rule[u.rule_id] || 0) + 1;
    });
    exclusions.forEach((e) => {
      accounting.exclusions_by_reason[e.reason] = (accounting.exclusions_by_reason[e.reason] || 0) + 1;
    });
    const countedBlocks = {};
    units.forEach((u) => {
      u.block_ids.forEach((id) => { countedBlocks[id] = true; });
    });
    accounting.blocks_in_units = Object.keys(countedBlocks).length;
    accounting.blocks_by_bucket = {};
    Object.keys(bucketOf).forEach((id) => {
      const bucket = bucketOf[id];
      accounting.blocks_by_bucket[bucket] = (accounting.blocks_by_bucket[bucket] || 0) + 1;
      if (bucket === 'section_marker') accounting.section_markers++;
      if (bucket === 'stripped_furniture_tail') accounting.stripped_furniture_tails++;
    });

    // Reconciliation: every document block is exactly one of: in a unit,
    // excluded, a section marker, or a stripped furniture tail. Cross-page
    // merged units re-reference passage blocks, so they are NOT counted
    // a second time here (their block IDs already appear in passages).
    const bucketedCount = Object.keys(bucketOf).length;
    const reconciliation = {
      ok: bucketedCount === allBlocks.length,
      bucketed_blocks: bucketedCount,
      blocks_total: allBlocks.length,
      blocks_in_units_unique: accounting.blocks_in_units
    };

    return {
      version: RECONSTRUCTION_VERSION,
      document_id: documentId,
      units: units,
      exclusions: exclusions,
      accounting: accounting,
      reconciliation: reconciliation
    };
  }

  const SourceReconstruction = {
    RECONSTRUCTION_VERSION: RECONSTRUCTION_VERSION,
    reconstructDocument: reconstructDocument,
    // Exposed for tests (pure helpers, no document state).
    _helpers: {
      cleanText: cleanText,
      normalizeJoinedText: normalizeJoinedText,
      joinBlockTexts: joinBlockTexts,
      dehyphenate: dehyphenate,
      stripFurniturePrefix: stripFurniturePrefix,
      parseTableRows: parseTableRows,
      captionFigureRef: captionFigureRef,
      detectListItems: detectListItems
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SourceReconstruction;
  global.StudySynthSourceReconstruction = SourceReconstruction;
})(typeof globalThis !== 'undefined' ? globalThis : this);
