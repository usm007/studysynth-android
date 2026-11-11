import sys, os, re, json, time, subprocess
import fitz
import numpy as np

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
TMP = os.path.join(r'C:\Users\Admin\AppData\Local\Temp\opencode', f'_ocr_col_{os.getpid()}.png')


def ocr_image(path, psm=6, lang='eng+hin'):
    r = subprocess.run([TESS, path, 'stdout', '--psm', str(psm), '-l', lang,
                        '--tessdata-dir', TESSDATA],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout


def column_split_x(gray):
    """Pick the least-ink vertical position in the central band as the gutter."""
    h, w = gray.shape
    ink = (gray < 140).sum(axis=0).astype(np.float32)
    kernel = np.ones(9) / 9
    dens = np.convolve(ink, kernel, mode='same')
    lo, hi = int(0.38 * w), int(0.62 * w)
    band = dens[lo:hi]
    if band.size == 0:
        return w // 2
    # window-average over 5 px to avoid splitting inside a glyph stroke
    smooth = np.convolve(band, np.ones(5) / 5, mode='same')
    return lo + int(np.argmin(smooth))


def page_ocr(page, dpi=250):
    pix = page.get_pixmap(dpi=dpi)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n >= 3:
        gray = (0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]).astype(np.uint8)
    else:
        gray = img[:, :, 0]
    split = column_split_x(gray)

    parts = []
    w, h = page.rect.width, page.rect.height
    fx = split / pix.width
    xm = w * fx
    gap = 4
    for (x0, x1) in [(0, max(1, xm - gap)), (min(w - 1, xm + gap), w)]:
        clip = fitz.Rect(x0, 0, x1, h)
        p2 = page.get_pixmap(dpi=dpi, clip=clip)
        p2.save(TMP)
        parts.append(ocr_image(TMP, psm=6))
    return parts


def main():
    def arg(i, default=None):
        if len(sys.argv) <= i:
            return default
        v = sys.argv[i]
        if v is None or v == '' or v.lower() in ('none', 'null'):
            return default
        return v

    pdf, out = sys.argv[1], sys.argv[2]
    dpi = int(arg(3, 250))
    start = int(arg(4, 0))
    end = arg(5)
    end = int(end) if end is not None else None
    lang = arg(6, 'eng+hin')
    global TESSDATA
    tessdata = arg(7)
    if tessdata:
        TESSDATA = tessdata

    doc = fitz.open(pdf)
    total = doc.page_count if end is None else min(end, doc.page_count)

    existing = {}
    if os.path.exists(out):
        raw = open(out, encoding='utf-8').read()
        for m in re.finditer(r'===== PAGE (\d+) =====\n(.*?)(?=\n===== PAGE |\Z)', raw, re.S):
            existing[int(m.group(1))] = m.group(2)

    t0 = time.time()
    done = 0
    for pno in range(start, total):
        if pno in existing:
            continue
        parts = page_ocr(doc[pno], dpi=dpi)
        text = '\n---COL---\n'.join(parts)
        existing[pno] = text
        done += 1
        if done % 5 == 0 or pno == total - 1:
            with open(out, 'w', encoding='utf-8') as f:
                for i in sorted(existing):
                    f.write(f'===== PAGE {i} =====\n{existing[i]}\n')
            el = time.time() - t0
            rate = el / max(1, done)
            print(f'page {pno+1}/{total}  {rate:.1f}s/page  eta {(total-pno-1)*rate/60:.0f} min', flush=True)

    with open(out, 'w', encoding='utf-8') as f:
        for i in sorted(existing):
            f.write(f'===== PAGE {i} =====\n{existing[i]}\n')
    print('DONE', out, 'pages', len(existing), flush=True)


if __name__ == '__main__':
    main()
