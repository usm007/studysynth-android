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
        const content = await page.getTextContent();
        let pageText = '';
        let previousWasEol = false;

        for (const item of content.items) {
          if (!item || typeof item.str !== 'string') continue;
          if (item.str) pageText += item.str;
          if (item.hasEOL) {
            pageText += '\n';
            previousWasEol = true;
          } else if (item.str && !/\s$/.test(item.str)) {
            pageText += ' ';
            previousWasEol = false;
          }
        }

        if (!previousWasEol) pageText += '\n';
        const cleaned = pageText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const formatted = cleaned ? `==Page ${pageNumber}==\n${cleaned}` : null;
        if (formatted) pages.push(formatted);
        page.cleanup();

        if (onProgress) {
          onProgress({
            status: 'Reading page ' + pageNumber + ' of ' + pdf.numPages + '…',
            stage: 'extracting',
            completed: pageNumber,
            total: pdf.numPages,
            pageNumber: pageNumber,
            pageText: formatted
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
      if (text && text.replace(/==Page \d+==/g, '').trim().length >= 25) return text;
      primaryError = new Error('This PDF has no selectable text layer. It may be a scanned image PDF.');
    } catch (err) {
      if (isAborted(opts) || (err && err.name === 'AbortError')) throw abortError();
      primaryError = err;
    }

    checkpointError(opts);
    try {
      return await extractWithFallback(arrayBuffer, onProgress, opts);
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
      return { text, origin: 'pdf-text', confidence: null, lowConfidence: false };
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
