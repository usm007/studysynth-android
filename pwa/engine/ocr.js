/**
 * StudySynth Lite — Client-Side Local OCR Engine (WASM + Canvas Pre-processing)
 * Designed for 100% on-device recognition of scanned PDF pages and photos on Android.
 */

(function (global) {
  'use strict';

  /**
   * Pre-processes an HTML5 Canvas image for OCR:
   * 1. Converts to Grayscale
   * 2. Enhances contrast
   * 3. Applies adaptive thresholding (Otsu binarization)
   * This dramatically improves Tesseract recognition accuracy on low-contrast mobile phone scans.
   */
  function preprocessCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // 1. Grayscale
    for (let i = 0; i < data.length; i += 4) {
      const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }

    // 2. Compute histogram for Otsu's thresholding
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      histogram[data[i]]++;
    }

    const totalPixels = canvas.width * canvas.height;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * histogram[t];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      wF = totalPixels - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    // 3. Apply binary threshold
    for (let i = 0; i < data.length; i += 4) {
      const val = data[i] > threshold ? 255 : 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Performs Local OCR on an Image, Canvas, or Blob using Tesseract.js
   * Supports progress callbacks to update Android UI.
   */
  const OCR_PATHS = {
    workerPath: './vendor/tesseract/worker.min.js',
    corePath: './vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: './vendor/tesseract'
  };

  function abortError() {
    const err = new Error('Processing cancelled.');
    err.name = 'AbortError';
    err.code = 'CANCELLED';
    return err;
  }

  function isAborted(options) {
    return !!(options && options.signal && options.signal.aborted);
  }

  function getAvailability() {
    if (typeof Tesseract === 'undefined') {
      return {
        available: false,
        reason: 'Photo OCR is not bundled in this build. Use a .txt, .md, or selectable .pdf file instead.'
      };
    }
    return { available: true, reason: '' };
  }

  async function recognizeImage(imageSource, onProgress, options) {
    const opts = options || {};
    const availability = getAvailability();
    if (!availability.available) throw new Error(availability.reason);
    if (isAborted(opts)) throw abortError();

    if (onProgress) onProgress({ status: 'Preparing on-device OCR', stage: 'ocr', indeterminate: true });

    let worker = null;
    let onAbort = null;
    try {
      worker = await Tesseract.createWorker('eng', 1, {
        workerPath: OCR_PATHS.workerPath,
        corePath: OCR_PATHS.corePath,
        langPath: OCR_PATHS.langPath,
        // The language model is stored uncompressed so Android's asset packer
        // cannot strip the .gz suffix and break the offline OCR fetch.
        gzip: false,
        logger: (m) => {
          if (!onProgress || !m || isAborted(opts)) return;
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            onProgress({ status: 'Recognising text', stage: 'ocr', ratio: m.progress });
          } else if (m.status === 'loading language traineddata') {
            onProgress({ status: 'Loading offline language data', stage: 'ocr', indeterminate: true });
          } else if (m.status === 'initializing api') {
            onProgress({ status: 'Starting OCR engine', stage: 'ocr', indeterminate: true });
          }
        }
      });

      if (isAborted(opts)) throw abortError();
      if (opts.signal) {
        onAbort = () => {
          try { worker.terminate(); } catch (e) { /* already terminated */ }
        };
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      const res = await worker.recognize(imageSource);
      if (isAborted(opts)) throw abortError();
      return {
        text: res.data.text || '',
        confidence: res.data.confidence || 0
      };
    } catch (err) {
      if (isAborted(opts)) throw abortError();
      const detail = err && err.message ? err.message : String(err);
      throw new Error('On-device OCR could not run. ' + detail + ' Try a text, Markdown, or selectable PDF file instead.');
    } finally {
      if (opts.signal && onAbort) opts.signal.removeEventListener('abort', onAbort);
      if (worker) {
        try { await worker.terminate(); } catch (e) { /* already terminated */ }
      }
    }
  }

  /**
   * Extracts text from an uploaded image file (PNG, JPG, WEBP, or scanned note photo)
   */
  async function recognizeFile(file, onProgress, options) {
    const opts = options || {};
    if (isAborted(opts)) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        try {
          if (isAborted(opts)) throw abortError();
          const sourceWidth = img.naturalWidth || img.width;
          const sourceHeight = img.naturalHeight || img.height;
          if (!sourceWidth || !sourceHeight) throw new Error('The image has no readable dimensions.');

          // Keep memory predictable on phones. OCR does not benefit from
          // multi-thousand-pixel camera files.
          const maxDimension = 2400;
          const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          preprocessCanvas(canvas);
          if (isAborted(opts)) throw abortError();
          const result = await recognizeImage(canvas, onProgress, opts);
          URL.revokeObjectURL(url);
          resolve(result);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load the image for local OCR.'));
      };
      img.src = url;
    });
  }

  const LocalOCR = {
    preprocessCanvas,
    recognizeImage,
    recognizeFile,
    getAvailability
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LocalOCR;
  }
  if (typeof window !== 'undefined') {
    window.LocalOCR = LocalOCR;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
