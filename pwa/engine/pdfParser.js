/**
 * StudySynth Lite — Client-Side Offline Document & PDF Text Extractor
 * Extracts readable text streams from plain text, Markdown, and standard PDF bytes
 * using native browser streams and regex parsing without external CDNs or servers.
 */

(function (global) {
  'use strict';

  let pdfjsPromise = null;
  let lastLayoutDiagnostics = [];
  let lastExtractionMeta = null;

  const BLOCK_TYPES = Object.freeze([
    'body',
    'heading',
    'caption',
    'table',
    'diagram',
    'page_furniture',
    'fragment',
    'ambiguous'
  ]);

  const FURNITURE_MARKERS = /(?:Exploring\s*Society|India\s*and\s*the\s*World|Governance\s*and\s*Democracy|Economic\s*Life|Tapestry\s*of\s*the\s*Past|Our\s*Cultural\s*Heritage|NCERT|Reprint(?:ed)?|First\s*Edition|Printed\s*by|ISBN|Chapter\s+\d+\.indd)/i;
  const CAPTION_MARKER = /^(?:fig(?:ure)?\s*\.?\s*\d+|table\s*\.?\s*\d+|photo\s*\.?\s*\d+|map\s*\.?\s*\d+|chart\s*\.?\s*\d+|diagram\s*\.?\s*\d+|plate\s*\.?\s*\d+|legend\b|source\s*:|scale\b)/i;
  const COMPASS_OR_SCALE = /^(?:[NESW]|[0-9][0-9,.]*\s*(?:km|m|mi|metres?|kilometres?)?|scale|legend|route|city)$/i;
  const TERMINAL_PUNCTUATION = /[.!?]["'”’)\]]*\s*$/;
  const FIGURE_TABLE_MARKER = /\b(?:fig(?:ure)?\s*\.?\s*\d+|table\s*\.?\s*\d+|photo\s*\.?\s*\d+|legend|scale\s*bar|compass)\b/i;

  function median(values) {
    const list = (values || []).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!list.length) return 0;
    const middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  }

  function joinItemStrings(parts) {
    let text = '';
    for (const part of parts) {
      if (!part) continue;
      if (!text) {
        text = part;
        continue;
      }
      if (/\s$/.test(text) || /^\s/.test(part)) text += part;
      else text += ' ' + part;
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  function readingOrder(a, b) {
    if (Math.abs(a.y - b.y) > 1.5) return a.y - b.y;
    return a.x - b.x;
  }

  /**
   * Finds empty vertical bands (gutters) that run the height of the page.
   * A span must never be joined across one of these bands, even when the
   * numeric gap is small: sidebars and figure labels sit in separate columns
   * whose right edge can nearly touch the body text.
   */
  function detectColumnBands(items, pageWidth) {
    if (!items.length) return [];
    const binSize = 2;
    const binCount = Math.ceil(pageWidth / binSize) + 1;
    const covered = new Uint8Array(binCount);
    for (const item of items) {
      const start = Math.max(0, Math.floor(item.x / binSize));
      const end = Math.min(binCount - 1, Math.ceil((item.x + item.width) / binSize));
      for (let i = start; i <= end; i++) covered[i] = 1;
    }

    const minWidth = Math.max(8, pageWidth * 0.012);
    const maxWidth = pageWidth * 0.35;
    const bands = [];
    let runStart = -1;
    for (let i = 0; i <= binCount; i++) {
      const empty = i < binCount && !covered[i];
      if (empty && runStart < 0) runStart = i;
      if (!empty && runStart >= 0) {
        const start = runStart * binSize;
        const end = i * binSize;
        const width = end - start;
        if (width >= minWidth && width <= maxWidth) {
          const leftCount = items.filter((item) => item.x + item.width <= start + 1).length;
          const rightCount = items.filter((item) => item.x >= end - 1).length;
          if (leftCount >= 3 && rightCount >= 3) bands.push({ start, end, width });
        }
        runStart = -1;
      }
    }
    return bands;
  }

  function crossesColumnBand(bands, leftEdge, rightEdge) {
    if (leftEdge == null) return false;
    for (const band of bands) {
      if (leftEdge <= band.end + 0.5 && rightEdge >= band.start - 0.5) return true;
    }
    return false;
  }

  /**
   * Deterministic, geometry-aware page layout extraction.
   * Reads text-item positions (never PDF stream order alone), rebuilds lines,
   * splits distant spans, groups aligned lines into blocks, classifies blocks
   * conservatively, detects genuine columns from block geometry, and returns
   * only confirmed body prose as bodyText.
   */
  function extractPageLayout(content, viewport, pageNumber) {
    const pageNo = Number.isFinite(pageNumber) ? pageNumber : 1;
    const pageWidth = viewport && Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 612;
    const pageHeight = viewport && Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 792;
    const rawItems = content && Array.isArray(content.items) ? content.items : [];
    const items = [];

    rawItems.forEach((item, index) => {
      if (!item || typeof item.str !== 'string') return;
      if (!item.str.trim()) return;
      const transform = Array.isArray(item.transform) && item.transform.length >= 6
        ? item.transform
        : [1, 0, 0, 1, 0, 0];
      let x = Number(transform[4]) || 0;
      let y = Number(transform[5]) || 0;
      if (viewport && typeof viewport.convertToViewportPoint === 'function') {
        const point = viewport.convertToViewportPoint(transform[4], transform[5]);
        if (Array.isArray(point) && point.length >= 2) {
          x = Number(point[0]);
          y = Number(point[1]);
        }
      } else if (viewport && Number.isFinite(viewport.height)) {
        y = viewport.height - y;
      }
      const rotated = Math.abs(Number(transform[1]) || 0) > 0.01 || Math.abs(Number(transform[2]) || 0) > 0.01;
      const height = Math.abs(Number(item.height)) > 0
        ? Math.abs(Number(item.height))
        : Math.max(6, Math.abs(Number(transform[3]) || 10));
      const width = Math.abs(Number(item.width)) > 0
        ? Math.abs(Number(item.width))
        : Math.max(1, item.str.length * height * 0.5);
      items.push({
        index,
        str: item.str,
        x,
        y,
        width,
        height,
        fontName: item.fontName || '',
        rotated
      });
    });

    const medianHeight = median(items.map((item) => item.height)) || 10;
    const baselineTolerance = Math.max(2.5, 0.4 * medianHeight);
    const spanGap = Math.max(16, 2 * medianHeight);
    const columnBands = detectColumnBands(items, pageWidth);

    // 1. Group items into baseline lines.
    const sorted = items.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const lines = [];
    for (const item of sorted) {
      let line = null;
      for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
        if (lines[i].rotated !== item.rotated) continue;
        if (Math.abs(lines[i].y - item.y) <= baselineTolerance) {
          line = lines[i];
          break;
        }
      }
      if (!line) {
        line = { y: item.y, items: [], heights: [], rotated: item.rotated };
        lines.push(line);
      }
      line.items.push(item);
      line.heights.push(item.height);
      line.y = line.items.reduce((sum, entry) => sum + entry.y, 0) / line.items.length;
    }

    // 2. Split each line into horizontally distant spans.
    const spans = [];
    for (const line of lines) {
      const ordered = line.items.slice().sort((a, b) => a.x - b.x);
      let current = null;
      let currentEnd = null;
      let currentFont = '';
      let currentRotated = null;
      for (const item of ordered) {
        const gap = currentEnd == null ? 0 : item.x - currentEnd;
        const rotatedChanged = currentRotated != null && item.rotated !== currentRotated;
        // Inline font changes (bold terms, italics) are part of the same
        // sentence; only a real geometric gap, a column gutter, or a rotation
        // change separates spans.
        if (!current || gap > spanGap || rotatedChanged || crossesColumnBand(columnBands, currentEnd, item.x)) {
          current = { items: [], y: line.y };
          spans.push(current);
          currentEnd = null;
          currentFont = '';
        }
        current.items.push(item);
        if (!currentFont) currentFont = item.fontName;
        currentRotated = item.rotated;
        currentEnd = Math.max(currentEnd == null ? item.x + item.width : currentEnd, item.x + item.width);
      }
    }
    const lineSpans = spans.map((span) => {
      const x0 = Math.min.apply(null, span.items.map((item) => item.x));
      const x1 = Math.max.apply(null, span.items.map((item) => item.x + item.width));
      const height = median(span.items.map((item) => item.height)) || medianHeight;
      const rotated = span.items.every((item) => item.rotated);
      const text = joinItemStrings(span.items.map((item) => item.str));
      return {
        text,
        x0,
        x1,
        y: span.y,
        height,
        rotated,
        furnitureCandidate: FURNITURE_MARKERS.test(text) || /^(?:page\s*)?\d{1,4}\.?$/i.test(text),
        fonts: new Set(span.items.map((item) => item.fontName).filter(Boolean)),
        items: span.items
      };
    }).filter((span) => span.text);

    const medianLineHeight = median(lineSpans.map((span) => span.height)) || medianHeight;
    const maxVerticalGap = 1.8 * medianLineHeight;
    const alignmentTolerance = Math.max(12, 1.5 * medianHeight);

    // 3. Group neighbouring spans into blocks when alignment and spacing agree.
    const blocks = [];
    for (const span of lineSpans.slice().sort(readingOrder)) {
      let best = null;
      let bestGap = Infinity;
      for (const block of blocks) {
        const gap = span.y - block.lastY;
        if (gap < -baselineTolerance || gap > maxVerticalGap) continue;
        if (block.rotated !== span.rotated) continue;
        if (block.furnitureCandidate !== span.furnitureCandidate) continue;
        const overlap = Math.min(block.x1, span.x1) - Math.max(block.x0, span.x0);
        const aligned = Math.abs(block.x0 - span.x0) <= alignmentTolerance;
        if (overlap <= 0 && !aligned) continue;
        const shortSpan = span.text.length < 40;
        const fontDisjoint = span.fonts.size > 0 && block.fonts.size > 0 &&
          !Array.from(span.fonts).some((font) => block.fonts.has(font));
        const outside = span.x1 <= block.x0 + 1 || span.x0 >= block.x1 - 1;
        if (shortSpan && fontDisjoint && (outside || gap > 0)) continue;
        if (gap < bestGap) {
          best = block;
          bestGap = gap;
        }
      }
      if (!best) {
        best = {
          x0: span.x0,
          x1: span.x1,
          top: span.y,
          bottom: span.y + span.height,
          lastY: span.y,
          rotated: span.rotated,
          furnitureCandidate: span.furnitureCandidate,
          fonts: new Set(span.fonts),
          lines: [],
          items: []
        };
        blocks.push(best);
      }
      for (const font of span.fonts) best.fonts.add(font);
      best.lines.push(span.text);
      best.items = best.items.concat(span.items);
      best.x0 = Math.min(best.x0, span.x0);
      best.x1 = Math.max(best.x1, span.x1);
      best.top = Math.min(best.top, span.y);
      best.bottom = Math.max(best.bottom, span.y + span.height);
      best.lastY = span.y;
    }

    // 4. Classify blocks conservatively.
    const records = blocks.map((block, index) => {
      const text = block.lines.join('\n').trim();
      const flat = text.replace(/\s+/g, ' ').trim();
      const lineCount = block.lines.filter(Boolean).length;
      const charCount = flat.replace(/\s/g, '').length;
      const wordCount = flat.split(/\s+/).filter(Boolean).length;
      const averageLineLength = lineCount ? flat.length / lineCount : flat.length;
      const width = Math.max(0, block.x1 - block.x0);
      const height = Math.max(0, block.bottom - block.top);
      const nearEdge = block.top <= pageHeight * 0.12 || block.bottom >= pageHeight * 0.88;
      const rotated = block.items.length > 0 && block.items.filter((item) => item.rotated).length >= Math.ceil(block.items.length * 0.6);
      const uppercaseRatio = (() => {
        const letters = flat.replace(/[^A-Za-z]/g, '');
        if (!letters) return 0;
        return (letters.replace(/[^A-Z]/g, '').length / letters.length);
      })();
      const lowerWordRatio = (() => {
        const words = flat.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
        if (!words.length) return 0;
        return words.filter((word) => /[a-z]/.test(word)).length / words.length;
      })();

      let type = 'fragment';
      let confidence = 'low';
      let reason = 'short label or fragment';

      const firstLine = block.lines[0] || '';
      const purePageNumber = /^(?:page\s*)?\d{1,4}$/i.test(flat);
      const metadata = FURNITURE_MARKERS.test(flat) && flat.length <= 140;
      const caption = CAPTION_MARKER.test(firstLine) || /^fig(?:ure)?\s*\.?\s*\d+/i.test(flat);
      const compassOrScale = COMPASS_OR_SCALE.test(flat) || /^(?:[NESW]\s*){2,}[NESW]$/.test(flat);
      const labelLike = lineCount <= 3 && wordCount <= 6 && !TERMINAL_PUNCTUATION.test(flat);

      if (purePageNumber || metadata || (nearEdge && labelLike && charCount <= 90)) {
        type = 'page_furniture';
        confidence = 'high';
        reason = purePageNumber ? 'short page-number fragment' : 'repeated running header or footer';
      } else if (caption) {
        type = 'caption';
        confidence = 'high';
        reason = 'figure or table caption';
      } else if (rotated) {
        type = 'diagram';
        confidence = 'medium';
        reason = 'rotated diagram label';
      } else if (compassOrScale || (uppercaseRatio > 0.75 && charCount <= 80 && wordCount <= 8)) {
        type = 'diagram';
        confidence = 'medium';
        reason = 'map label, compass letter or scale label';
      } else if (lineCount <= 2 && wordCount >= 2 && wordCount <= 12 && charCount >= 8 && charCount <= 90 &&
        !TERMINAL_PUNCTUATION.test(flat) && width > pageWidth * 0.25 && !COMPASS_OR_SCALE.test(flat)) {
        type = 'heading';
        confidence = 'high';
        reason = 'short title-case heading spanning the text column';
      } else if (labelLike && (charCount <= 40 || width < pageWidth * 0.35)) {
        type = 'diagram';
        confidence = 'medium';
        reason = 'short diagram label';
      } else if (lineCount >= 2 && width < pageWidth * 0.28 && averageLineLength < 30) {
        type = 'fragment';
        confidence = 'low';
        reason = 'narrow sidebar column of short lines';
      } else if (block.lines.length >= 2 && block.lines.every((line) => line.split(/\s+/).length <= 6) && width > pageWidth * 0.4) {
        type = 'table';
        confidence = 'medium';
        reason = 'row-aligned short table cells';
      } else if (lineCount <= 2 && charCount <= 100 && (!TERMINAL_PUNCTUATION.test(flat) || /bold/i.test(block.items.map((item) => item.fontName).join(' ')))) {
        type = 'heading';
        confidence = 'high';
        reason = 'short heading line';
      } else {
        const proseLines = lineCount >= 2 && charCount >= 50 && averageLineLength >= 25 && lowerWordRatio >= 0.5;
        const proseSentence = lineCount === 1 &&
          flat.length >= 50 &&
          wordCount >= 8 &&
          TERMINAL_PUNCTUATION.test(flat) &&
          !FIGURE_TABLE_MARKER.test(flat);
        const mixed = FIGURE_TABLE_MARKER.test(flat) || /(?:[A-Z]\s+){2,}[A-Z]/.test(flat);
        if ((proseLines || proseSentence) && !mixed) {
          type = 'body';
          confidence = lineCount >= 2 ? 'high' : 'medium';
          reason = 'aligned prose lines';
        } else if (charCount >= 40 && mixed) {
          type = 'ambiguous';
          confidence = 'low';
          reason = 'mixed prose and label content';
        } else if (charCount >= 40 && lineCount >= 2 && averageLineLength >= 20) {
          type = 'ambiguous';
          confidence = 'low';
          reason = 'prose-like block without a reliable paragraph shape';
        } else {
          type = 'fragment';
          confidence = 'low';
          reason = 'short label or fragment';
        }
      }

      return {
        id: 'P' + pageNo + '-B' + (index + 1),
        pageNumber: pageNo,
        type,
        text,
        bbox: {
          x: Math.round(block.x0 * 10) / 10,
          y: Math.round(block.top * 10) / 10,
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10
        },
        itemCount: block.items.length,
        confidence,
        reason
      };
    });

    // 5. Detect genuine columns from block geometry, never a fixed x cutoff.
    function detectGutter(contentBlocks) {
      if (contentBlocks.length < 6) return null;
      const candidates = [];
      for (const left of contentBlocks) {
        const leftEdge = left.bbox.x + left.bbox.width;
        for (const right of contentBlocks) {
          const rightEdge = right.bbox.x;
          const gutterWidth = rightEdge - leftEdge;
          if (gutterWidth < pageWidth * 0.04) continue;
          if (gutterWidth > pageWidth * 0.5) continue;
          const leftCount = contentBlocks.filter((block) => block.bbox.x + block.bbox.width <= leftEdge + 0.5).length;
          const rightCount = contentBlocks.filter((block) => block.bbox.x >= rightEdge - 0.5).length;
          if (leftCount < 3 || rightCount < 3) continue;
          const crossing = contentBlocks.filter((block) =>
            block.bbox.x < rightEdge && block.bbox.x + block.bbox.width > leftEdge
          ).length;
          if (crossing > Math.floor(contentBlocks.length * 0.15)) continue;
          candidates.push({ start: leftEdge, end: rightEdge, width: gutterWidth, leftCount, rightCount, crossing });
        }
      }
      if (!candidates.length) return null;
      candidates.sort((a, b) => (b.width - a.width) || (a.start - b.start));
      return candidates[0];
    }

    const contentRecords = records.filter((record) => record.type !== 'page_furniture');
    const gutter = detectGutter(contentRecords);
    let ordered = records.slice().sort((a, b) => readingOrder(
      { x: a.bbox.x, y: a.bbox.y },
      { x: b.bbox.x, y: b.bbox.y }
    ));

    if (gutter) {
      const left = [];
      const right = [];
      const full = [];
      for (const record of records) {
        const rightEdge = record.bbox.x + record.bbox.width;
        if (rightEdge <= gutter.start + 0.5) left.push(record);
        else if (record.bbox.x >= gutter.end - 0.5) right.push(record);
        else full.push(record);
      }
      if (left.length && right.length) {
        const columnTop = Math.min.apply(null, left.concat(right).map((record) => record.bbox.y));
        const columnBottom = Math.max.apply(null, left.concat(right).map((record) => record.bbox.y + record.bbox.height));
        const above = [];
        const below = [];
        const middle = [];
        for (const record of full) {
          const bottom = record.bbox.y + record.bbox.height;
          if (bottom <= columnTop + 2) above.push(record);
          else if (record.bbox.y >= columnBottom - 2) below.push(record);
          else middle.push(record);
        }
        const byTop = (a, b) => readingOrder({ x: a.bbox.x, y: a.bbox.y }, { x: b.bbox.x, y: b.bbox.y });
        ordered = above.sort(byTop)
          .concat(left.sort(byTop))
          .concat(right.sort(byTop))
          .concat(below.sort(byTop))
          .concat(middle.sort(byTop));
      }
    }

    const bodyBlocks = ordered.filter((record) => record.type === 'body');
    const bodyText = bodyBlocks
      .map((record) => record.text.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');

    return {
      pageNumber: pageNo,
      bodyText,
      blocks: ordered,
      stats: {
        textItemCount: items.length,
        blockCount: records.length,
        bodyBlockCount: bodyBlocks.length,
        nonProseBlockCount: records.length - bodyBlocks.length,
        gutter: gutter ? { start: gutter.start, end: gutter.end, width: gutter.width } : null,
        pageWidth,
        pageHeight
      }
    };
  }

  function getLastLayoutDiagnostics() {
    return {
      pages: lastLayoutDiagnostics.slice(),
      extraction: lastExtractionMeta ? Object.assign({}, lastExtractionMeta) : null
    };
  }

  function abortError() {
    const err = new Error('Processing cancelled.');
    err.name = 'AbortError';
    err.code = 'CANCELLED';
    return err;
  }

  function isAborted(options) {
    return !!(options && options.signal && options.signal.aborted);
  }

  function checkpointError(options) {
    if (isAborted(options)) throw abortError();
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('../vendor/pdfjs/pdf.mjs').then((pdfjs) => {
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', document.baseURI).href;
        }
        return pdfjs;
      });
    }
    return pdfjsPromise;
  }

  /**
   * Primary extractor: the bundled, same-origin PDF.js build. It handles
   * compressed streams, object streams, Unicode maps, and multi-page files.
   * Everything stays on the device.
   */
  async function extractWithPdfJs(arrayBuffer, onProgress, options) {
    const opts = options || {};
    const pdfjs = await loadPdfJs();
    checkpointError(opts);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true
    });
    const pdf = await loadingTask.promise;
    checkpointError(opts);
    const pages = (opts.initialPages || []).map((entry) => entry.text);
    const startPage = Math.max(1, Math.min(opts.startPage || 1, pdf.numPages + 1));

    lastLayoutDiagnostics = [];
    lastExtractionMeta = {
      origin: 'pdf-layout',
      pageCount: 0,
      textItemCount: 0,
      bodyPages: 0,
      visitedPages: 0,
      nonProseOnlyPages: 0,
      ambiguousPages: 0,
      blockTypes: {}
    };

    if (onProgress) {
      onProgress({
        status: 'Reading ' + pdf.numPages + ' page' + (pdf.numPages === 1 ? '' : 's') + '…',
        stage: 'extracting',
        completed: startPage - 1,
        total: pdf.numPages
      });
    }

    try {
      for (let pageNumber = startPage; pageNumber <= pdf.numPages; pageNumber++) {
        checkpointError(opts);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const layout = extractPageLayout(content, viewport, pageNumber);
        lastLayoutDiagnostics.push(layout);

        const meta = lastExtractionMeta;
        meta.pageCount = pdf.numPages;
        meta.visitedPages += 1;
        meta.textItemCount += layout.stats.textItemCount;
        if (layout.stats.bodyBlockCount > 0) meta.bodyPages += 1;
        else if (layout.stats.textItemCount > 0) meta.nonProseOnlyPages += 1;
        if (layout.blocks.some((block) => block.type === 'ambiguous')) meta.ambiguousPages += 1;
        for (const block of layout.blocks) {
          meta.blockTypes[block.type] = (meta.blockTypes[block.type] || 0) + 1;
        }

        const bodyText = layout.bodyText.trim();
        if (bodyText) pages.push(`==Page ${pageNumber}==\n${bodyText}`);
        page.cleanup();

        if (onProgress) {
          onProgress({
            status: 'Reading page ' + pageNumber + ' of ' + pdf.numPages + '…',
            stage: 'extracting',
            completed: pageNumber,
            total: pdf.numPages,
            pageNumber: pageNumber,
            pageText: bodyText ? `==Page ${pageNumber}==\n${bodyText}` : null,
            layout: {
              pageNumber: pageNumber,
              stats: layout.stats,
              blockTypes: layout.blocks.reduce((counts, block) => {
                counts[block.type] = (counts[block.type] || 0) + 1;
                return counts;
              }, {})
            }
          });
        }
      }
    } finally {
      try { await pdf.destroy(); } catch (e) { /* already closed */ }
    }

    return pages.join('\n\n');
  }

  /**
   * Fallback extractor for environments where the module build cannot load.
   * Parses standard PDF text markers (BT...ET, Tj, TJ).
   */
  async function extractWithFallback(arrayBuffer, onProgress, options) {
    const opts = options || {};
    if (onProgress) {
      onProgress({
        status: 'Reading document pages…',
        stage: 'extracting',
        indeterminate: true
      });
    }
    const bytes = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('latin1');
    const pdfRaw = textDecoder.decode(bytes);

    const pagesText = [];
    let currentPage = 1;

    // Search for stream blocks
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match;

    while ((match = streamRegex.exec(pdfRaw)) !== null) {
      checkpointError(opts);
      const streamContent = match[1];
      let extractedBlock = '';

      // Check if this stream has BT...ET text blocks
      if (streamContent.includes('BT') && streamContent.includes('ET')) {
        extractedBlock = parsePdfTextOperators(streamContent);
      }

      // Check if compressed with FlateDecode and decompress if browser supports DecompressionStream
      if (!extractedBlock && typeof DecompressionStream !== 'undefined') {
        try {
          const startIndex = match.index + match[0].indexOf(streamContent);
          const rawStreamBytes = bytes.subarray(startIndex, startIndex + streamContent.length);
          const decompressed = await decompressFlate(rawStreamBytes);
          checkpointError(opts);
          if (decompressed && decompressed.includes('BT')) {
            extractedBlock = parsePdfTextOperators(decompressed);
          }
        } catch (e) {
          if (isAborted(opts)) throw abortError();
          // Non-critical: some streams are image data or XObjects
        }
      }

      if (extractedBlock && extractedBlock.trim().length > 15) {
        pagesText.push(`==Page ${currentPage}==\n` + extractedBlock.trim());
        currentPage++;
      }
    }

    if (pagesText.length > 0) {
      return pagesText.join('\n\n');
    }

    // Fallback: extract any ASCII text sequences of length >= 4
    const textMatches = pdfRaw.match(/\(([^\(\)\\]{3,})\)\s*Tj/g);
    if (textMatches && textMatches.length > 5) {
      const simple = textMatches.map(m => m.replace(/^\(/, '').replace(/\)\s*Tj$/, '')).join(' ');
      return `==Page 1==\n` + simple;
    }

    throw new Error('No selectable text streams found in PDF. Note: Pure scanned image PDFs require OCR.');
  }

  async function extractTextFromPDF(arrayBuffer, onProgress, options) {
    const opts = options || {};
    let primaryError = null;
    try {
      const text = await extractWithPdfJs(arrayBuffer, onProgress, opts);
      const meta = lastExtractionMeta || {};
      // A selectable-text PDF was read successfully: never re-run the
      // unstructured regex fallback just because layout filtering left little
      // body prose. That would reintroduce diagram labels as contaminated text.
      if (Number(meta.textItemCount) > 0) return text;
      primaryError = new Error('This PDF has no selectable text layer. It may be a scanned image PDF.');
    } catch (err) {
      if (isAborted(opts) || (err && err.name === 'AbortError')) throw abortError();
      primaryError = err;
    }

    checkpointError(opts);
    try {
      const fallbackText = await extractWithFallback(arrayBuffer, onProgress, opts);
      lastExtractionMeta = Object.assign({}, lastExtractionMeta || {}, {
        origin: 'pdf-regex-fallback',
        layoutAware: false,
        lowConfidence: true
      });
      return fallbackText;
    } catch (fallbackError) {
      if (isAborted(opts) || (fallbackError && fallbackError.name === 'AbortError')) throw abortError();
      if (primaryError && /password|encrypted/i.test(primaryError.message || '')) {
        throw new Error('This PDF is password-protected. Unlock it first, then try again.');
      }
      throw new Error('No readable text was found in this PDF. For a scanned document, choose a clear photo of the page so the on-device OCR can read it.');
    }
  }

  function parsePdfTextOperators(streamText) {
    const lines = [];
    // Match text blocks inside BT ... ET
    const btMatches = streamText.match(/BT[\s\S]*?ET/g);
    if (!btMatches) return '';

    for (const bt of btMatches) {
      // 1. Array text objects: [(part1) 12 (part2)] TJ
      const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
      let tjMatch;
      while ((tjMatch = tjArrayRegex.exec(bt)) !== null) {
        const parts = tjMatch[1].match(/\((.*?)\)/g);
        if (parts) {
          const joined = parts.map(p => p.slice(1, -1)).join('');
          if (joined.trim()) lines.push(cleanPdfEscape(joined));
        }
      }

      // 2. Simple text objects: (text) Tj or '
      const tjSingleRegex = /\((.*?)\)\s*(?:Tj|'|")/g;
      let sMatch;
      while ((sMatch = tjSingleRegex.exec(bt)) !== null) {
        const text = sMatch[1];
        if (text && text.trim()) lines.push(cleanPdfEscape(text));
      }
    }

    return lines.join(' ');
  }

  function cleanPdfEscape(s) {
    return s.replace(/\\([()\\])/g, '$1')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\t/g, ' ');
  }

  async function decompressFlate(uint8Array) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(uint8Array);
      writer.close();
      const response = new Response(ds.readable);
      const buffer = await response.arrayBuffer();
      return new TextDecoder('latin1').decode(new Uint8Array(buffer));
    } catch (e) {
      return null;
    }
  }

  /**
   * Unified file reader that also reports where the text came from and how
   * confident on-device OCR was. Text extracted from a selectable PDF or a
   * plain text file has no OCR confidence and is treated as confirmed.
   */
  async function readFileContentDetailed(file, onProgress, options) {
    const name = file.name || 'document.txt';
    const ext = name.split('.').pop().toLowerCase();
    const opts = options || {};

    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      if (typeof window !== 'undefined' && window.LocalOCR) {
        const res = await window.LocalOCR.recognizeFile(file, onProgress, opts);
        const confidence = Number.isFinite(res.confidence) ? res.confidence : 0;
        return {
          text: res.text || '',
          origin: 'ocr',
          confidence: confidence,
          lowConfidence: confidence < 90
        };
      }
      throw new Error('Local OCR module is not initialized.');
    }

    if (ext === 'pdf') {
      const buffer = await file.arrayBuffer();
      const text = await extractTextFromPDF(buffer, onProgress, opts);
      const meta = lastExtractionMeta ? Object.assign({}, lastExtractionMeta) : null;
      return {
        text,
        origin: meta && meta.origin ? meta.origin : 'pdf-text',
        confidence: null,
        lowConfidence: Boolean(meta && meta.lowConfidence),
        layout: meta
      };
    }

    // TXT, Markdown, CSV, JSON
    return { text: await file.text(), origin: 'text', confidence: null, lowConfidence: false };
  }

  /**
   * Backward-compatible string reader. Existing callers keep receiving text.
   */
  async function readFileContent(file, onProgress) {
    const result = await readFileContentDetailed(file, onProgress);
    return result.text;
  }

  const OfflineDocParser = {
    extractTextFromPDF,
    extractPageLayout,
    getLastLayoutDiagnostics,
    readFileContentDetailed,
    readFileContent,
    BLOCK_TYPES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineDocParser;
  }
  if (typeof window !== 'undefined') {
    window.OfflineDocParser = OfflineDocParser;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
