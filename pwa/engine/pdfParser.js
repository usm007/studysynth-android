/**
 * StudySynth Lite — Client-Side Offline Document & PDF Text Extractor
 * Extracts readable text streams from plain text, Markdown, and standard PDF bytes
 * using native browser streams and regex parsing without external CDNs or servers.
 */

(function (global) {
  'use strict';

  let pdfjsPromise = null;

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

  // ---------------------------------------------------------------------------
  // Shared geometry-aware page-layout extraction (Repair 002, Phase 2).
  //
  // This is the single production layout algorithm. It works from real
  // PDF.js text content and viewport geometry — never from a flat
  // `content.items.map(item => item.str).join(' ')` join, which destroys
  // column, paragraph and page structure.
  //
  // PDF.js coordinates: item.transform[4] is x and item.transform[5] is y
  // measured from the bottom-left of the page, in the same units as
  // item.width / item.height. The viewport converts that to a top-down
  // bbox: yTop = viewport.height - yBottom - height.
  // ---------------------------------------------------------------------------

  function medianValue(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function normalizeLayoutItem(item, index) {
    if (!item || typeof item.str !== 'string') return null;
    const text = item.str;
    if (!text.trim()) return null;
    const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
    const x = Number.isFinite(transform[4]) ? transform[4] : 0;
    const yBottom = Number.isFinite(transform[5]) ? transform[5] : 0;
    const width = Number.isFinite(item.width) && item.width > 0 ? item.width : Math.max(1, text.trim().length * 5);
    const height = Number.isFinite(item.height) && item.height > 0 ? item.height : 12;
    return { index: index, str: text, x: x, yBottom: yBottom, width: width, height: height };
  }

  const RUNNING_TITLE_PATTERNS = [
    /\bexploring society\b/i,
    /\bindia and the world\b/i,
    /\bgovernance and democracy\b/i,
    /\beconomic life\b/i,
    /\btapestry of the past\b/i,
    /\bour cultural heritage\b/i,
    /\bchapter\s+\d+\.indd\b/i
  ];

  function isRunningFurniture(segment, pageHeight) {
    const inTopMargin = segment.yTop < pageHeight * 0.09;
    const inBottomMargin = segment.yTop + segment.height > pageHeight * 0.91;
    const text = segment.text.trim();
    // Phase 8 fix: a running book title is furniture wherever it repeats,
    // not only in the extreme margin. NCERT running footers sit at about
    // 83% of page height (y ~650 on a 785pt page), below the 91% threshold,
    // so the margin test alone missed them and they merged into body
    // text. A segment that *starts* with a running title pattern is a
    // title line, not a body sentence that merely mentions the book.
    if (RUNNING_TITLE_PATTERNS.some((re) => re.test(text)) && /^(exploring society|india and the world|governance and democracy|economic life|tapestry of the past|our cultural heritage)/i.test(text)) return true;
    if (!inTopMargin && !inBottomMargin) return false;
    if (/^\d+$/.test(text)) return true;
    if (RUNNING_TITLE_PATTERNS.some((re) => re.test(text))) return true;
    if (/^\d+\s*[-–]\s*.+/.test(text) && text.length <= 60) return true;
    return false;
  }

  function isCaptionText(text) {
    return /^(fig\.|figure|photo|table|map)\s*\d+/i.test(text.trim());
  }

  function isDiagramCandidateText(text, height, medianHeight) {
    const t = text.trim();
    if (/^[NESW]$/.test(t)) return true;
    if (/^(legend|route|city|scale)$/i.test(t)) return true;
    if (/^0$|^\d{1,4}(,\d{3})*\s*km$/i.test(t)) return true;
    if (/^([A-Za-z]\s+){2,}[A-Za-z]$/.test(t)) return true;
    if (/^[A-Za-z]\s+[A-Za-z]$/.test(t)) return true;
    // An isolated all-caps label is only a diagram label when it is short
    // and small; a lone uppercase line is never enough on its own (see
    // the diagram-context check in extractLayoutFromTextContent).
    if (height <= medianHeight && /^[A-Z]{3,}$/.test(t) && t.length <= 20) return true;
    return false;
  }

  function isHeadingCandidate(segment, medianHeight) {
    const text = segment.text.trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 10) return false;
    if (/^\d+(\.\d+)*\s+\S/.test(text)) return true;
    if (/^chapter\s+\d+/i.test(text)) return true;
    if (segment.height >= medianHeight * 1.25 && text.length <= 60) return true;
    if (segment.isFullWidth && words.length <= 8 && /^[A-Z][a-z]/.test(text) && segment.height >= medianHeight) return true;
    return false;
  }

  function extractLayoutFromTextContent(content, pageNumber, viewport) {
    const rawItems = content && Array.isArray(content.items) ? content.items : [];
    const normalized = [];
    rawItems.forEach((item, index) => {
      const norm = normalizeLayoutItem(item, index);
      if (norm) normalized.push(norm);
    });

    const vp = viewport || (content && content.viewport) || null;
    let pageWidth = vp && Number.isFinite(vp.width) && vp.width > 0 ? vp.width : 0;
    let pageHeight = vp && Number.isFinite(vp.height) && vp.height > 0 ? vp.height : 0;
    if (!pageWidth) pageWidth = Math.max.apply(null, normalized.map((it) => it.x + it.width).concat([612]));
    if (!pageHeight) pageHeight = Math.max.apply(null, normalized.map((it) => it.yBottom + it.height).concat([792]));

    const items = normalized.map((it) => {
      const yTop = pageHeight - it.yBottom - it.height;
      return Object.assign({}, it, {
        yTop: yTop,
        bbox: { x: it.x, y: yTop, width: it.width, height: it.height, x1: it.x + it.width, y1: yTop + it.height }
      });
    });

    const medianHeight = medianValue(items.map((it) => it.height)) || 12;
    const lineTolerance = Math.max(2.5, 0.4 * medianHeight);
    const gapThreshold = Math.max(18, 1.5 * medianHeight);
    const paragraphGap = Math.max(8, 0.8 * medianHeight);

    // 1. Cluster into y-bands, then split each band into segments at
    //    meaningful horizontal gaps (positions + widths, not a fixed split).
    const sorted = items.slice().sort((a, b) => (a.yTop - b.yTop) || (a.x - b.x));
    const bands = [];
    for (const item of sorted) {
      const band = bands.length ? bands[bands.length - 1] : null;
      if (band && Math.abs(item.yTop - band.yTop) <= lineTolerance) {
        band.items.push(item);
      } else {
        bands.push({ yTop: item.yTop, items: [item] });
      }
    }
    const segments = [];
    for (const band of bands) {
      const bandItems = band.items.slice().sort((a, b) => a.x - b.x);
      let current = [bandItems[0]];
      for (let i = 1; i < bandItems.length; i++) {
        const prev = bandItems[i - 1];
        const gap = bandItems[i].x - (prev.x + prev.width);
        if (gap > gapThreshold) {
          segments.push(current);
          current = [bandItems[i]];
        } else {
          current.push(bandItems[i]);
        }
      }
      segments.push(current);
    }
    const segmentObjs = segments.map((segItems) => {
      const x0 = Math.min.apply(null, segItems.map((it) => it.x));
      const x1 = Math.max.apply(null, segItems.map((it) => it.x + it.width));
      const yTop = Math.min.apply(null, segItems.map((it) => it.yTop));
      const height = Math.max.apply(null, segItems.map((it) => it.yTop + it.height)) - yTop;
      return {
        items: segItems,
        x0: x0, x1: x1, yTop: yTop, height: height,
        text: segItems.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim(),
        isFullWidth: false
      };
    });

    // 2. Dynamic gutter detection: >=4% of page width, >=3 blocks on each
    //    side, <=15% of segments crossing it. Widest qualifying gap wins.
    let gutter = null;
    if (segmentObjs.length >= 6) {
      const candidates = [];
      for (const band of bands) {
        const bandSegs = segmentObjs.filter((s) => Math.abs(s.yTop - band.yTop) <= lineTolerance);
        const ordered = bandSegs.slice().sort((a, b) => a.x0 - b.x0);
        for (let i = 0; i + 1 < ordered.length; i++) {
          const gapStart = ordered[i].x1;
          const gapEnd = ordered[i + 1].x0;
          const width = gapEnd - gapStart;
          if (width < 0.04 * pageWidth) continue;
          const left = segmentObjs.filter((s) => s.x1 <= gapStart).length;
          const right = segmentObjs.filter((s) => s.x0 >= gapEnd).length;
          const crossing = segmentObjs.filter((s) => s.x0 < gapStart && s.x1 > gapEnd).length;
          if (left >= 3 && right >= 3 && crossing <= 0.15 * segmentObjs.length) {
            candidates.push({ gapStart: gapStart, gapEnd: gapEnd, width: width, left: left, right: right, crossing: crossing });
          }
        }
      }
      candidates.sort((a, b) => (b.width - a.width) || (a.crossing - b.crossing) || ((b.left + b.right) - (a.left + a.right)));
      if (candidates.length) gutter = candidates[0];
    }
    for (const seg of segmentObjs) {
      if (gutter) {
        if (seg.x0 < gutter.gapStart && seg.x1 > gutter.gapEnd) seg.isFullWidth = true;
        seg.column = seg.isFullWidth ? 'full' : (seg.x1 <= gutter.gapStart ? 'left' : (seg.x0 >= gutter.gapEnd ? 'right' : 'full'));
        if (seg.column === 'full' && !seg.isFullWidth) seg.isFullWidth = true;
      } else {
        seg.column = 'single';
      }
    }

    // 3. Table-band detection: runs of >=2 bands each with >=3 segments.
    const tableSegmentSet = new Set();
    {
      let run = [];
      const flushRun = () => {
        if (run.length >= 2) {
          for (const seg of run) tableSegmentSet.add(seg);
        }
        run = [];
      };
      for (const band of bands) {
        const bandSegs = segmentObjs.filter((s) => Math.abs(s.yTop - band.yTop) <= lineTolerance);
        if (bandSegs.length >= 3) run.push.apply(run, bandSegs);
        else flushRun();
      }
      flushRun();
    }

    // 4. Pre-classify segments; diagram labels need context (at least two
    //    diagram-like segments on the page, or a strong compass/scale/legend
    //    pattern) so a lone uppercase line is not silently treated as a label.
    const diagramCandidateCount = segmentObjs.filter((s) => isDiagramCandidateText(s.text, s.height, medianHeight)).length;
    for (const seg of segmentObjs) {
      seg.preType = null;
      if (isRunningFurniture(seg, pageHeight)) seg.preType = 'page_furniture';
      else if (isCaptionText(seg.text)) seg.preType = 'caption';
      else if (tableSegmentSet.has(seg)) seg.preType = 'table';
      else if (isDiagramCandidateText(seg.text, seg.height, medianHeight)) {
        const strong = /^[NESW]$/.test(seg.text.trim()) || /^(legend|route|city|scale)$/i.test(seg.text.trim()) || /^0$|^\d{1,4}(,\d{3})*\s*km$/i.test(seg.text.trim());
        if (strong || diagramCandidateCount >= 2) seg.preType = 'diagram';
      }
      else if (isHeadingCandidate(seg, medianHeight)) seg.preType = 'heading';
    }

    // 5. Group body segments into paragraphs by column, alignment and
    //    vertical spacing. Pre-classified segments stay as own blocks.
    const blocks = [];
    const pushBlock = (segs, forcedType) => {
      if (!segs.length) return;
      const text = segs.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const yTop = Math.min.apply(null, segs.map((s) => s.yTop));
      const x0 = Math.min.apply(null, segs.map((s) => s.x0));
      const x1 = Math.max.apply(null, segs.map((s) => s.x1));
      const height = Math.max.apply(null, segs.map((s) => s.yTop + s.height)) - yTop;
      const itemCount = segs.reduce((n, s) => n + s.items.length, 0);
      blocks.push({
        segments: segs, text: text, yTop: yTop, x0: x0, x1: x1, height: height,
        itemCount: itemCount, column: segs[0].column,
        isFullWidth: segs.every((s) => s.isFullWidth),
        forcedType: forcedType || null
      });
    };

    // Table blocks: one block per contiguous run of table segments.
    if (tableSegmentSet.size) {
      const tableSegs = segmentObjs.filter((s) => tableSegmentSet.has(s)).sort((a, b) => (a.yTop - b.yTop) || (a.x0 - b.x0));
      // Group table segments by band (row) for the block text.
      const rows = [];
      for (const seg of tableSegs) {
        const row = rows.length ? rows[rows.length - 1] : null;
        if (row && Math.abs(seg.yTop - row.yTop) <= lineTolerance) row.segs.push(seg);
        else rows.push({ yTop: seg.yTop, segs: [seg] });
      }
      const tableText = rows.map((r) => r.segs.slice().sort((a, b) => a.x0 - b.x0).map((s) => s.text).join(' | ')).join(' ; ');
      const yTop = Math.min.apply(null, tableSegs.map((s) => s.yTop));
      const x0 = Math.min.apply(null, tableSegs.map((s) => s.x0));
      const x1 = Math.max.apply(null, tableSegs.map((s) => s.x1));
      const height = Math.max.apply(null, tableSegs.map((s) => s.yTop + s.height)) - yTop;
      blocks.push({
        segments: tableSegs, text: tableText, yTop: yTop, x0: x0, x1: x1, height: height,
        itemCount: tableSegs.reduce((n, s) => n + s.items.length, 0), column: 'full',
        isFullWidth: true, forcedType: 'table'
      });
    }

    const bodySegsByColumn = {};
    for (const seg of segmentObjs) {
      if (seg.preType) {
        pushBlock([seg], seg.preType);
      } else if (!tableSegmentSet.has(seg)) {
        (bodySegsByColumn[seg.column] = bodySegsByColumn[seg.column] || []).push(seg);
      }
    }
    for (const column of Object.keys(bodySegsByColumn)) {
      const colSegs = bodySegsByColumn[column].slice().sort((a, b) => (a.yTop - b.yTop) || (a.x0 - b.x0));
      let current = [];
      let prev = null;
      const flush = () => { if (current.length) pushBlock(current, null); current = []; };
      for (const seg of colSegs) {
        if (prev) {
          const gap = seg.yTop - (prev.yTop + prev.height);
          const alignmentShift = Math.abs(seg.x0 - prev.x0);
          if (gap > paragraphGap || alignmentShift > 40) flush();
        }
        current.push(seg);
        prev = seg;
      }
      flush();
    }

    // 6. Final block classification (conservative: unclassifiable prose
    //    becomes ambiguous, never silently merged into body prose).
    const classified = blocks.map((block) => {
      const text = block.text;
      const words = text.split(/\s+/).filter(Boolean);
      const letters = (text.match(/[A-Za-z]/g) || []).length;
      const alphaRatio = text.length ? letters / text.length : 0;
      let type = block.forcedType;
      let reason = '';
      let confidence = 0.9;
      if (!type) {
        if (words.length <= 3 && text.length <= 40) {
          // A short complete sentence ("Rivers flow south.") is body
          // prose, not a fragment; a short line without sentence
          // punctuation or a verb is a fragment.
          const sentenceLike = /[.!?]$/.test(text) && words.slice(1).some((w) => {
            const clean = w.replace(/[^a-z]/gi, '').toLowerCase();
            return /^(is|are|was|were|has|have|flow|flows|flood|floods|rise|rises|fall|falls|grow|grows)$/i.test(w)
              || (clean.length > 3 && /s$/.test(clean) && !/ss$/.test(clean));
          });
          if (sentenceLike) {
            type = 'body'; reason = 'Short complete sentence'; confidence = 0.85;
          } else {
            type = 'fragment'; reason = 'Short isolated line without paragraph structure'; confidence = 0.5;
          }
        } else if (alphaRatio < 0.5 || /_{2,}|\[?\.\.\.\]/.test(text)) {
          type = 'ambiguous'; reason = 'Mostly non-alphabetic or placeholder content; not confident body prose'; confidence = 0.4;
        } else if (words.length >= 4 && words.length <= 10 && !/[.!?]$/.test(text) && !/\b(is|are|was|were|has|have|had|causes?|leads?|means?|refers?)\b/i.test(text)) {
          type = 'ambiguous'; reason = 'Short line without a clear assertion verb; preserved, not merged into prose'; confidence = 0.4;
        } else {
          type = 'body'; reason = 'Ordinary prose paragraph'; confidence = 0.9;
        }
      } else {
        reason = type === 'page_furniture' ? 'Running header/footer in page margin'
          : type === 'caption' ? 'Figure/table/photo caption'
          : type === 'diagram' ? 'Diagram/map label'
          : type === 'table' ? 'Tabular rows'
          : type === 'heading' ? 'Heading'
          : 'Pre-classified segment';
        confidence = type === 'fragment' ? 0.5 : type === 'ambiguous' ? 0.4 : 0.85;
      }
      const allItems = [];
      for (const seg of block.segments) for (const it of seg.items) allItems.push(it);
      const bbox = {
        x: block.x0, y: block.yTop, width: block.x1 - block.x0, height: block.height,
        x1: block.x1, y1: block.yTop + block.height
      };
      return {
        segments: block.segments, text: text, type: type, reason: reason, confidence: confidence,
        itemCount: block.itemCount, yTop: block.yTop, column: block.column,
        isFullWidth: block.isFullWidth, bbox: bbox
      };
    });

    // 7. Reading order: full-width headings in geometric segments first
    //    (column content before a heading, then the heading), then remaining
    //    column content (left, then right), then full-width concluding
    //    content. Single-column pages keep top-down order.
    let ordered;
    if (!gutter) {
      ordered = classified.slice().sort((a, b) => (a.yTop - b.yTop) || (a.x0 - b.x0));
    } else {
      const headings = classified.filter((b) => b.type === 'heading' && b.isFullWidth).sort((a, b) => a.yTop - b.yTop);
      const columns = classified.filter((b) => !b.isFullWidth);
      const fullOthers = classified.filter((b) => b.isFullWidth && b.type !== 'heading').sort((a, b) => a.yTop - b.yTop);
      const remaining = columns.slice();
      ordered = [];
      for (const heading of headings) {
        const before = remaining.filter((b) => b.yTop < heading.yTop);
        const leftBefore = before.filter((b) => b.column === 'left').sort((a, b) => a.yTop - b.yTop);
        const rightBefore = before.filter((b) => b.column === 'right').sort((a, b) => a.yTop - b.yTop);
        ordered.push.apply(ordered, leftBefore.concat(rightBefore));
        for (const b of before) { const idx = remaining.indexOf(b); if (idx >= 0) remaining.splice(idx, 1); }
        ordered.push(heading);
      }
      const leftRest = remaining.filter((b) => b.column === 'left').sort((a, b) => a.yTop - b.yTop);
      const rightRest = remaining.filter((b) => b.column === 'right').sort((a, b) => a.yTop - b.yTop);
      ordered.push.apply(ordered, leftRest.concat(rightRest));
      ordered.push.apply(ordered, fullOthers);
      // Any heading that was not full-width, or any block not yet placed,
      // keeps its geometric position at the end of its segment.
      const placed = new Set(ordered);
      for (const b of classified) if (!placed.has(b)) ordered.push(b);
    }

    const finalBlocks = ordered.map((block, index) => ({
      id: 'p' + pageNumber + '-b' + (index + 1),
      pageNumber: pageNumber,
      type: block.type,
      text: block.text,
      bbox: block.bbox,
      itemCount: block.itemCount,
      confidence: block.confidence,
      reason: block.reason
    }));

    const countsByType = {};
    for (const block of finalBlocks) countsByType[block.type] = (countsByType[block.type] || 0) + 1;
    const bodyBlocks = finalBlocks.filter((b) => b.type === 'body');
    const headingBlocks = finalBlocks.filter((b) => b.type === 'heading');
    const bodyItemCount = bodyBlocks.reduce((n, b) => n + b.itemCount, 0);
    const headingItemCount = headingBlocks.reduce((n, b) => n + b.itemCount, 0);
    const bodyText = ordered.filter((b) => b.type === 'body' || b.type === 'heading').map((b) => b.text).join('\n\n');
    const bodyOnlyText = bodyBlocks.map((b) => b.text).join('\n\n');

    return {
      pageNumber: pageNumber,
      bodyText: bodyText,
      bodyOnlyText: bodyOnlyText,
      blocks: finalBlocks,
      stats: {
        totalItems: items.length,
        bodyItems: bodyItemCount,
        headingItems: headingItemCount,
        excludedItems: items.length - bodyItemCount - headingItemCount,
        blockCount: finalBlocks.length,
        countsByType: countsByType,
        gutter: gutter ? { x: (gutter.gapStart + gutter.gapEnd) / 2, gapStart: gutter.gapStart, gapEnd: gutter.gapEnd, width: gutter.width } : null,
        pageWidth: pageWidth,
        pageHeight: pageHeight,
        fallback: false,
        confidence: bodyBlocks.length ? 'high' : 'low'
      }
    };
  }

  async function extractPageLayout(page, pageNumber) {
    const content = await page.getTextContent();
    let viewport = null;
    if (page && typeof page.getViewport === 'function') {
      try { viewport = page.getViewport({ scale: 1 }); } catch (e) { viewport = null; }
    }
    return extractLayoutFromTextContent(content, pageNumber, viewport);
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import('../vendor/pdfjs/pdf.mjs').then((pdfjs) => {
        if (pdfjs.GlobalWorkerOptions && typeof document !== 'undefined' && document.baseURI) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', document.baseURI).href;
        }
        return pdfjs;
      }).catch((err) => {
        // Do not cache a rejected loader: a later call may succeed.
        pdfjsPromise = null;
        throw err;
      });
    }
    return pdfjsPromise;
  }

  /**
   * Primary extractor: the bundled, same-origin PDF.js build. It handles
   * compressed streams, object streams, Unicode maps, and multi-page files.
   * Everything stays on the device.
   */
  async function extractWithPdfJsInternal(arrayBuffer, onProgress, options) {
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

    if (onProgress) {
      onProgress({
        status: 'Reading ' + pdf.numPages + ' page' + (pdf.numPages === 1 ? '' : 's') + '…',
        stage: 'extracting',
        completed: startPage - 1,
        total: pdf.numPages
      });
    }

    const pageLayouts = [];
    try {
      for (let pageNumber = startPage; pageNumber <= pdf.numPages; pageNumber++) {
        checkpointError(opts);
        const page = await pdf.getPage(pageNumber);
        const layout = await extractPageLayout(page, pageNumber);
        pageLayouts.push(layout);
        const formatted = layout.bodyText ? `==Page ${pageNumber}==\n${layout.bodyText}` : null;
        if (formatted) pages.push(formatted);
        page.cleanup();

        if (onProgress) {
          onProgress({
            status: 'Reading page ' + pageNumber + ' of ' + pdf.numPages + '…',
            stage: 'extracting',
            completed: pageNumber,
            total: pdf.numPages,
            pageNumber: pageNumber,
            pageText: formatted,
            pageLayout: layout
          });
        }
      }
    } finally {
      try { await pdf.destroy(); } catch (e) { /* already closed */ }
    }

    const text = pages.join('\n\n');
    return { text: text, pages: pageLayouts };
  }

  async function extractWithPdfJs(arrayBuffer, onProgress, options) {
    const result = await extractWithPdfJsInternal(arrayBuffer, onProgress, options);
    return result.text;
  }

  async function extractWithPdfJsDetailed(arrayBuffer, onProgress, options) {
    const result = await extractWithPdfJsInternal(arrayBuffer, onProgress, options);
    return { text: result.text, pages: result.pages, fallbackUsed: false, primaryFailed: false };
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

  async function extractTextFromPDFDetailed(arrayBuffer, onProgress, options) {
    const opts = options || {};
    let primaryError = null;
    let primary = null;
    try {
      primary = await extractWithPdfJsDetailed(arrayBuffer, onProgress, opts);
    } catch (err) {
      if (isAborted(opts) || (err && err.name === 'AbortError')) throw abortError();
      primaryError = err;
    }

    // Repair 002 fallback rule: a successfully parsed selectable-text PDF
    // does NOT fall back to the unstructured extractor merely because the
    // filtered body text is short. Fallback is permitted only when the
    // primary extraction actually failed, or when it produced no accepted
    // body text at all (no selectable text layer). Any non-empty primary
    // result is returned as-is, with its low body-text status preserved
    // in diagnostics rather than hidden by an unstructured join.
    if (primary) {
      const bodyChars = (primary.text || '').replace(/==Page \d+==/g, '').trim().length;
      const hasBodyBlocks = (primary.pages || []).some((p) => (p.blocks || []).some((b) => b.type === 'body'));
      if (bodyChars > 0 || hasBodyBlocks) {
        return {
          text: primary.text, pages: primary.pages, fallbackUsed: false,
          primaryFailed: false, lowConfidence: bodyChars < 25,
          diagnostics: primary.pages.map((p) => p.stats)
        };
      }
      primaryError = new Error('This PDF has no selectable text layer. It may be a scanned image PDF.');
    }

    checkpointError(opts);
    try {
      const fallbackText = await extractWithFallback(arrayBuffer, onProgress, opts);
      return {
        text: fallbackText, pages: [], fallbackUsed: true, primaryFailed: true,
        primaryError: primaryError ? primaryError.message : null,
        lowConfidence: true,
        diagnostics: [{ fallback: true, confidence: 'low', reason: 'Unstructured fallback used after primary extraction produced no body text or failed' }]
      };
    } catch (fallbackError) {
      if (isAborted(opts) || (fallbackError && fallbackError.name === 'AbortError')) throw abortError();
      if (primaryError && /password|encrypted/i.test(primaryError.message || '')) {
        throw new Error('This PDF is password-protected. Unlock it first, then try again.');
      }
      throw new Error('No readable text was found in this PDF. For a scanned document, choose a clear photo of the page so the on-device OCR can read it.');
    }
  }

  async function extractTextFromPDF(arrayBuffer, onProgress, options) {
    const result = await extractTextFromPDFDetailed(arrayBuffer, onProgress, options);
    return result.text;
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
      const result = await extractTextFromPDFDetailed(buffer, onProgress, opts);
      return {
        text: result.text, origin: 'pdf-text', confidence: null,
        lowConfidence: Boolean(result.lowConfidence || result.fallbackUsed),
        fallbackUsed: Boolean(result.fallbackUsed),
        diagnostics: result.diagnostics || null
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
    extractTextFromPDFDetailed,
    extractWithPdfJs,
    extractPageLayout,
    extractLayoutFromTextContent,
    readFileContentDetailed,
    readFileContent
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineDocParser;
  }
  if (typeof window !== 'undefined') {
    window.OfflineDocParser = OfflineDocParser;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
