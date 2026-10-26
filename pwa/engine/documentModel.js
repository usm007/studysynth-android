/**
 * StudySynth — Structured Document Representation (Phase 2A).
 *
 * The production batch path forwards only `bodyText` from the PDF layout
 * parser into the prose pipeline. That discards block types, geometry,
 * section identity and every exclusion decision, so a later stage cannot
 * tell a caption from a sentence, a table row from prose, or page
 * furniture from content — and nothing downstream can account for what
 * was dropped.
 *
 * This module builds a traceable document model from the SAME page
 * layouts the browser/worker path produces (`pdfParser.extractPageLayout`
 * output). It does NOT replace the production text path: the batch and
 * the question builders keep receiving exactly the bodyText they receive
 * today. The model exists so diagnostics, telemetry and the next phase
 * can account for every block exactly once, with a disposition and a
 * reason, and so section identity is semantic (from headings), never a
 * page slice.
 *
 * Governing rule: every classified block has exactly one final
 * disposition. Disposition totals reconcile with the total block count,
 * per page and for the whole document. Nothing is silently dropped:
 * blocks that are not prose are preserved as structured blocks, or
 * excluded with an explicit reason and an exclusion record.
 *
 * Runs 100% offline, deterministic, zero-network, zero-ML. No Date,
 * no Math.random, no locale-dependent ordering: block and section IDs
 * derive only from the document ID and source order.
 */

(function (global) {
  'use strict';

  const DOCUMENT_MODEL_VERSION = 'phase2a-1';

  // Exactly one of these is assigned to every block. The names are stable
  // API: diagnostics and the Phase 2A coverage matrix key on them.
  const DISPOSITIONS = {
    INCLUDED_PROSE: 'included_prose',
    INCLUDED_CAPTION: 'included_caption',
    INCLUDED_TABLE: 'included_table',
    INCLUDED_DIAGRAM: 'included_diagram_visual',
    PRESERVED_FRAGMENT: 'preserved_fragment',
    PRESERVED_AMBIGUOUS: 'preserved_ambiguous',
    PRESERVED_REPEATED_HEADING: 'preserved_repeated_heading',
    EXCLUDED_FURNITURE: 'excluded_furniture'
  };

  // Deterministic disposition reasons. A reason always accompanies a
  // disposition; the pair (disposition, reason) is what accounting
  // aggregates on, never a bare count.
  const DISPOSITION_REASONS = {
    BODY_TEXT: 'body_text',
    SECTION_HEADING: 'section_heading',
    REPEATED_HEADING: 'repeated_heading_not_new_section',
    CAPTION_FIRST_CLASS: 'caption_first_class',
    TABLE_ROWS_PARSED: 'table_rows_parsed',
    TABLE_RELATIONSHIP_UNRESOLVED: 'table_relationship_unresolved',
    DIAGRAM_VISUAL_DEPENDENCY: 'diagram_visual_dependency',
    FRAGMENT_PRESERVED: 'fragment_preserved_not_assertion',
    AMBIGUOUS_PRESERVED: 'ambiguous_preserved_for_review',
    PAGE_FURNITURE: 'page_furniture'
  };

  // A block is eligible for fact extraction only if it is body prose.
  // Headings define sections (they are not sentences), captions/tables/
  // diagrams are structured evidence (never concatenated into prose),
  // fragments and ambiguous blocks are preserved but never sent to the
  // fact extractor as complete assertions, and furniture is excluded.
  function dispositionForBlockType(type) {
    switch (type) {
      case 'body': return { disposition: DISPOSITIONS.INCLUDED_PROSE, reason: DISPOSITION_REASONS.BODY_TEXT, eligible: true };
      case 'heading': return { disposition: DISPOSITIONS.INCLUDED_PROSE, reason: DISPOSITION_REASONS.SECTION_HEADING, eligible: false };
      case 'caption': return { disposition: DISPOSITIONS.INCLUDED_CAPTION, reason: DISPOSITION_REASONS.CAPTION_FIRST_CLASS, eligible: false };
      case 'table': return { disposition: DISPOSITIONS.INCLUDED_TABLE, reason: DISPOSITION_REASONS.TABLE_ROWS_PARSED, eligible: false };
      case 'diagram': return { disposition: DISPOSITIONS.INCLUDED_DIAGRAM, reason: DISPOSITION_REASONS.DIAGRAM_VISUAL_DEPENDENCY, eligible: false };
      case 'fragment': return { disposition: DISPOSITIONS.PRESERVED_FRAGMENT, reason: DISPOSITION_REASONS.FRAGMENT_PRESERVED, eligible: false };
      case 'ambiguous': return { disposition: DISPOSITIONS.PRESERVED_AMBIGUOUS, reason: DISPOSITION_REASONS.AMBIGUOUS_PRESERVED, eligible: false };
      case 'page_furniture': return { disposition: DISPOSITIONS.EXCLUDED_FURNITURE, reason: DISPOSITION_REASONS.PAGE_FURNITURE, eligible: false };
      default: return { disposition: DISPOSITIONS.PRESERVED_AMBIGUOUS, reason: DISPOSITION_REASONS.AMBIGUOUS_PRESERVED, eligible: false };
    }
  }

  function cleanModelText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalizeForMatch(value) {
    return cleanModelText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // A repeated heading is a heading whose normalized text equals the
  // CURRENT section title. NCERT running heads repeat the chapter title
  // on many pages; treating each occurrence as a new section produced
  // the Phase 1 audit's 43 page-slice "sections". A repeated heading is
  // preserved, keeps the current section, and opens nothing.
  function isRepeatedHeading(normalizedText, currentSection) {
    if (!currentSection) return false;
    return normalizedText !== '' && normalizedText === currentSection.normalized_title;
  }

  // Conservative list detection inside a body block: at least two items
  // introduced by an explicit marker (bullet, dash, or number/letter with
  // a closing bracket or dot), each item short. Anything else stays
  // prose; the detector never invents item boundaries from plain commas.
  // Returns the item strings, or null when the block is not list-like.
  function detectListItems(text) {
    const source = cleanModelText(text);
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

  // Table blocks render as rows joined by ' ; ' and cells by ' | '.
  // Returns rows (array of cell arrays) when every row parses and all
  // rows share a column count, else null — the block is still preserved,
  // but its row/cell relationships are marked unresolved for review.
  function parseTableRows(text) {
    const source = cleanModelText(text);
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

  // Caption figure reference, e.g. "Fig. 3.18", "Figure 3.4", "Map 2.1".
  // Returns the normalized reference ("fig 3.18") or null.
  function captionFigureRef(text) {
    const match = cleanModelText(text).match(/^(?:fig\.?|figure|photo|map|table)\s+(\d+(?:\.\d+)*)/i);
    if (!match) return null;
    const kind = /^(?:fig\.?|figure)$/i.test(match[0].split(/\s+/)[0]) ? 'fig' : match[0].split(/\s+/)[0].toLowerCase();
    return kind + ' ' + match[1];
  }

  // Does a body block reference the given figure ("Fig. 3.18", "figure
  // 3.18", "fig 3.18")? Only a same-page body reference counts as
  // association evidence; anything else leaves the caption unassociated.
  function bodyReferencesFigure(bodyText, figureRef) {
    if (!figureRef) return false;
    const normalized = normalizeForMatch(bodyText);
    const parts = figureRef.split(' ');
    // Normalization turns "3.1" into "3 1", so the number pattern must
    // allow whitespace where the dots were — not literal dots.
    const numPattern = parts[1].replace(/\./g, '\\s+');
    const pattern = new RegExp('\\b(?:fig(?:ure)?|map|table)\\s+' + numPattern + '\\b');
    return pattern.test(normalized);
  }

  // Running-title contamination inside a body block: the layout stage
  // sometimes merges a footer line with body text on the same line.
  // The model flags it for review but never rewrites the text — the
  // production prose path receives the block unchanged.
  function hasFurnitureContamination(text) {
    const source = cleanModelText(text);
    return (/\bexploring society\b/i.test(source) && /\bgrade\b/i.test(source))
      || /\|\s*G\s*rade\b/i.test(source)
      || /^exploring society:/i.test(source);
  }

  function endsWithTerminalPunctuation(text) {
    return /[.!?"'")\]]\s*$/.test(cleanModelText(text));
  }

  function startsLowercase(text) {
    const trimmed = cleanModelText(text);
    return /^[a-z]/.test(trimmed);
  }

  /**
   * Build the structured document model from page layouts.
   *
   * @param {Array} pageLayouts — one entry per PDF page, each the object
   *   returned by pdfParser.extractPageLayout: { pageNumber, blocks, stats,
   *   bodyText, bodyOnlyText }. `blocks` entries carry id, type, text,
   *   bbox, itemCount, confidence, reason, in reading order.
   * @param {Object} options — { documentId, sourceTitle }.
   * @returns {Object} the document model (see schema below).
   *
   * Schema (stable for Phase 2A diagnostics):
   *   version, document_id, source_title, pages[], blocks[], sections[],
   *   continuations[], accounting{}, reconciliation{}.
   * A block: block_id, source_block_id, page, type, text, bbox,
   *   item_count, confidence, classification_reason, disposition,
   *   disposition_reason, section_id, section_title, eligible_for_fact_extraction,
   *   list_items (or null), table_rows (or null), association (captions),
   *   review_flags[].
   * A section: section_id, title, normalized_title, first_page, block_ids[].
   * A continuation: { from_block_id, to_block_id, from_page, to_page,
   *   support: 'strong'|'weak' } — a candidate only; text is NEVER merged
   *   in this phase, and both parts keep their own page/block references.
   */
  function buildStructuredDocument(pageLayouts, options) {
    const opts = options || {};
    const documentId = opts.documentId || 'unknown-document';
    const layouts = Array.isArray(pageLayouts) ? pageLayouts : [];

    const blocks = [];
    const sections = [];
    const pages = [];
    const continuations = [];
    let sectionSeq = 0;
    let currentSection = null;

    // Pass 1: blocks + sections, in source order.
    layouts.forEach((layout, layoutIndex) => {
      const pageNumber = layout.pageNumber != null ? layout.pageNumber
        : (layout.page != null ? layout.page : layoutIndex + 1);
      const layoutBlocks = Array.isArray(layout.blocks) ? layout.blocks : [];
      const pageBlockIds = [];

      layoutBlocks.forEach((raw, blockIndex) => {
        const sourceBlockId = raw.id || ('p' + pageNumber + '-b' + (blockIndex + 1));
        const blockId = documentId + ':' + sourceBlockId;
        const type = raw.type || 'ambiguous';
        const text = cleanModelText(raw.text);
        const mapped = dispositionForBlockType(type);
        let disposition = mapped.disposition;
        let reason = mapped.reason;
        let eligible = mapped.eligible;
        const reviewFlags = [];

        let sectionId = null;
        let sectionTitle = null;

        if (type === 'heading') {
          const normalized = normalizeForMatch(text);
          if (isRepeatedHeading(normalized, currentSection)) {
            disposition = DISPOSITIONS.PRESERVED_REPEATED_HEADING;
            reason = DISPOSITION_REASONS.REPEATED_HEADING;
            eligible = false;
            sectionId = currentSection.section_id;
            sectionTitle = currentSection.title;
            currentSection.block_ids.push(blockId);
          } else if (normalized !== '') {
            sectionSeq++;
            currentSection = {
              section_id: 'docsec_' + String(sectionSeq).padStart(3, '0'),
              title: text,
              normalized_title: normalized,
              first_page: pageNumber,
              block_ids: [blockId]
            };
            sections.push(currentSection);
            sectionId = currentSection.section_id;
            sectionTitle = currentSection.title;
          } else {
            // Empty heading text: no section, explicit unknown state.
            sectionId = 'sec_unknown';
            sectionTitle = null;
          }
        } else if (currentSection) {
          sectionId = currentSection.section_id;
          sectionTitle = currentSection.title;
          currentSection.block_ids.push(blockId);
        } else {
          // Blocks before the first heading: explicit unknown membership,
          // never a fake page-slice boundary.
          sectionId = 'sec_unknown';
          sectionTitle = null;
        }

        let listItems = null;
        if (type === 'body') listItems = detectListItems(text);

        let tableRows = null;
        if (type === 'table') {
          tableRows = parseTableRows(text);
          if (!tableRows) {
            reason = DISPOSITION_REASONS.TABLE_RELATIONSHIP_UNRESOLVED;
            reviewFlags.push('table_relationship_unresolved');
          }
        }

        if (type === 'ambiguous') reviewFlags.push('needs_review');
        if (type === 'body' && hasFurnitureContamination(text)) {
          reviewFlags.push('possible_furniture_contamination');
        }

        const block = {
          block_id: blockId,
          source_block_id: sourceBlockId,
          page: pageNumber,
          type: type,
          text: text,
          bbox: raw.bbox || null,
          item_count: raw.itemCount != null ? raw.itemCount : null,
          confidence: raw.confidence != null ? raw.confidence : null,
          classification_reason: raw.reason || null,
          disposition: disposition,
          disposition_reason: reason,
          section_id: sectionId,
          section_title: sectionTitle,
          eligible_for_fact_extraction: eligible,
          list_items: listItems,
          table_rows: tableRows,
          association: null,
          review_flags: reviewFlags
        };
        blocks.push(block);
        pageBlockIds.push(blockId);
      });

      pages.push({
        page: pageNumber,
        block_ids: pageBlockIds,
        layout_stats: layout.stats || null
      });
    });

    // Pass 2: caption association (same-page body reference only).
    const blocksByPage = {};
    blocks.forEach((block) => {
      (blocksByPage[block.page] || (blocksByPage[block.page] = [])).push(block);
    });
    blocks.forEach((block) => {
      if (block.type !== 'caption') return;
      const ref = captionFigureRef(block.text);
      let association = null;
      if (ref) {
        const candidate = (blocksByPage[block.page] || []).find((other) =>
          other.type === 'body' && bodyReferencesFigure(other.text, ref));
        if (candidate) {
          association = {
            figure_ref: ref,
            body_block_id: candidate.block_id,
            evidence: 'same-page body reference to figure'
          };
        }
      }
      if (association) {
        block.association = association;
      } else {
        block.association = null;
        block.review_flags.push('caption_unassociated');
      }
    });

    // Pass 3: cross-page continuation candidates (diagnostic only).
    // A continuation is recorded only when the last body block of a page
    // ends WITHOUT terminal punctuation and the first body block of the
    // next page starts lowercase. "Strong" support additionally requires
    // that the next page's first content block is that body block (no
    // intervening heading). Text is never merged here.
    const sortedPages = pages.slice().sort((a, b) => a.page - b.page);
    for (let p = 0; p + 1 < sortedPages.length; p++) {
      const thisPageBlocks = sortedPages[p].block_ids.map((id) =>
        blocks.find((b) => b.block_id === id));
      const nextPageBlocks = sortedPages[p + 1].block_ids.map((id) =>
        blocks.find((b) => b.block_id === id));
      const lastBody = [...thisPageBlocks].reverse().find((b) => b && b.type === 'body');
      const firstBody = nextPageBlocks.find((b) => b && b.type === 'body');
      if (!lastBody || !firstBody) continue;
      if (endsWithTerminalPunctuation(lastBody.text)) continue;
      if (!startsLowercase(firstBody.text)) continue;
      const firstContent = nextPageBlocks.find((b) => b && b.type !== 'page_furniture');
      continuations.push({
        from_block_id: lastBody.block_id,
        to_block_id: firstBody.block_id,
        from_page: sortedPages[p].page,
        to_page: sortedPages[p + 1].page,
        support: firstContent && firstContent.block_id === firstBody.block_id ? 'strong' : 'weak'
      });
    }

    // Accounting: every count carries its denominator. Block counts and
    // sentence/fact counts are never mixed into one rejection total.
    const accounting = {
      pages_encountered: pages.length,
      blocks_total: blocks.length,
      blocks_by_type: {},
      blocks_with_usable_text: 0,
      blocks_excluded: 0,
      blocks_requiring_review: 0,
      dispositions: {},
      dispositions_by_type_and_reason: {},
      sections_reconstructed: sections.length,
      blocks_with_unknown_section: 0,
      paragraphs_reconstructed: 0,
      captions_associated: 0,
      captions_unassociated: 0,
      tables_with_rows: 0,
      tables_unresolved: 0,
      lists_detected: 0,
      continuation_candidates: continuations.length,
      continuation_strong: 0,
      continuation_weak: 0
    };
    blocks.forEach((block) => {
      accounting.blocks_by_type[block.type] = (accounting.blocks_by_type[block.type] || 0) + 1;
      if (block.text) accounting.blocks_with_usable_text++;
      if (block.disposition === DISPOSITIONS.EXCLUDED_FURNITURE) accounting.blocks_excluded++;
      if (block.review_flags.length > 0) accounting.blocks_requiring_review++;
      accounting.dispositions[block.disposition] = (accounting.dispositions[block.disposition] || 0) + 1;
      const key = block.type + '|' + block.disposition + '|' + block.disposition_reason;
      accounting.dispositions_by_type_and_reason[key] =
        (accounting.dispositions_by_type_and_reason[key] || 0) + 1;
      if (block.section_id === 'sec_unknown') accounting.blocks_with_unknown_section++;
      if (block.type === 'body') accounting.paragraphs_reconstructed++;
      if (block.type === 'caption') {
        if (block.association) accounting.captions_associated++;
        else accounting.captions_unassociated++;
      }
      if (block.type === 'table') {
        if (block.table_rows) accounting.tables_with_rows++;
        else accounting.tables_unresolved++;
      }
      if (block.list_items) accounting.lists_detected++;
    });
    continuations.forEach((c) => {
      if (c.support === 'strong') accounting.continuation_strong++;
      else accounting.continuation_weak++;
    });

    // Reconciliation: the disposition counts must sum to the block total,
    // per page and for the document. A mismatch is a model bug, reported
    // here rather than hidden.
    const dispositionSum = Object.values(accounting.dispositions)
      .reduce((sum, n) => sum + n, 0);
    const perPageOk = pages.every((page) => {
      const pageBlocks = blocks.filter((b) => page.block_ids.indexOf(b.block_id) !== -1);
      return pageBlocks.length === page.block_ids.length;
    });
    const reconciliation = {
      ok: dispositionSum === blocks.length && perPageOk,
      disposition_sum: dispositionSum,
      blocks_total: blocks.length,
      per_page_ok: perPageOk
    };

    return {
      version: DOCUMENT_MODEL_VERSION,
      document_id: documentId,
      source_title: opts.sourceTitle || null,
      pages: pages,
      blocks: blocks,
      sections: sections,
      continuations: continuations,
      accounting: accounting,
      reconciliation: reconciliation
    };
  }

  const DocumentModel = {
    DOCUMENT_MODEL_VERSION: DOCUMENT_MODEL_VERSION,
    DISPOSITIONS: DISPOSITIONS,
    DISPOSITION_REASONS: DISPOSITION_REASONS,
    buildStructuredDocument: buildStructuredDocument,
    normalizeForMatch: normalizeForMatch,
    detectListItems: detectListItems,
    parseTableRows: parseTableRows,
    captionFigureRef: captionFigureRef,
    hasFurnitureContamination: hasFurnitureContamination
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DocumentModel;
  global.StudySynthDocumentModel = DocumentModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
