"""Booster CTET (scanned) parser.

The book is two columns per page and every question prints its four options in
a 2x2 grid, so plain text OCR glues the columns together and mangles the
options.  We render each column on its own, keep the OCR word boxes, and attach
each wrapped line to the option whose marker sits above it.
"""
import csv
import json
import os
import re
import subprocess
import sys

import fitz
import numpy as np

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
TMP = r'C:\Users\Admin\AppData\Local\Temp\opencode'

DPI = 250
NOISE = re.compile(r'(?i)(t\.me|telegram|sarkari|@\w+|https?)')
QNUM = re.compile(r'^[|\[\]()!Il]{0,3}(\d{1,3})\s*[.,]\s*(.*)$')
MARKER_HEAD = re.compile(r'^(?:([A-D])\s*[\).]|\(([a-d])\))\s*(.*)$')


def ocr_tsv(png, psm=6):
    base = os.path.join(TMP, f'_bcol_{os.getpid()}')
    subprocess.run([TESS, png, base, '--psm', str(psm), '-l', 'eng',
                    '--tessdata-dir', TESSDATA, '-c', 'tessedit_create_tsv=1'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
    path = base + '.tsv'
    if not os.path.exists(path):
        return []
    rows = list(csv.reader(open(path, encoding='utf-8').read().splitlines(),
                           delimiter='\t'))
    if not rows:
        return []
    header = [h.strip() for h in rows[0]]
    data = [dict(zip(header, [c.strip() for c in r])) for r in rows[1:] if len(r) == len(header)]
    os.remove(path)
    return data


def build_lines(data):
    groups = {}
    for row in data:
        if row.get('level') != '5':
            continue
        word = (row.get('text') or '').strip()
        if not word:
            continue
        try:
            left = int(row['left'])
            top = int(row['top'])
            width = int(row['width'])
            key = (int(row['block_num']), int(row['par_num']), int(row['line_num']))
        except (KeyError, ValueError):
            continue
        if left < 10:
            # clipped edge of the rotated watermark down the page margin
            continue
        if not any(c.isalnum() for c in word):
            continue
        groups.setdefault(key, []).append((left, top, width, word))

    lines = []
    for key, words in groups.items():
        words.sort(key=lambda w: w[0])
        text = ' '.join(w[3] for w in words)
        if NOISE.search(text):
            continue
        letters = sum(1 for c in text if c.isalpha())
        if letters < 3:
            continue
        non_latin = sum(1 for c in text if ord(c) > 127)
        if non_latin > 0.3 * len(text):
            continue
        lines.append({
            'x0': words[0][0],
            'y0': min(w[1] for w in words),
            'text': text,
            'words': words,
        })
    lines.sort(key=lambda l: l['y0'])
    return lines


def is_two_column(page):
    """Ink in the middle band tells us whether the page has a real gutter."""
    pix = page.get_pixmap(dpi=100)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    gray = img[:, :, 0]
    ink = (gray < 200).sum(axis=0).astype(np.float32)
    dens = np.convolve(ink, np.ones(7) / 7, mode='same')
    lo, hi = int(0.40 * len(dens)), int(0.60 * len(dens))
    band = dens[lo:hi]
    side = max(dens[int(0.15 * len(dens)):int(0.35 * len(dens))].mean(), 1.0)
    return band.min() < 0.25 * side


def column_lines(page):
    w, h = page.rect.width, page.rect.height
    if is_two_column(page):
        bands = [(0.02, 0.47), (0.51, 0.98)]
    else:
        bands = [(0.02, 0.98)]
    lines = []
    png = os.path.join(TMP, f'_bpage_{os.getpid()}.png')
    for x0, x1 in bands:
        page.get_pixmap(dpi=DPI, clip=fitz.Rect(w * x0, 0, w * x1, h)).save(png)
        data = ocr_tsv(png)
        lines.extend(build_lines(data))
    if os.path.exists(png):
        os.remove(png)
    return lines


def marker_spans(words):
    """[(letter, x, text)] for the option markers on one line."""
    positions = []
    for i, (left, top, width, word) in enumerate(words):
        m = MARKER_HEAD.match(word)
        if not m or len(word) > 5:
            continue
        positions.append((i, (m.group(1) or m.group(2)).lower(), left, m.group(3)))
    spans = []
    for n, (idx, letter, left, inline) in enumerate(positions):
        end = positions[n + 1][0] if n + 1 < len(positions) else len(words)
        parts = [inline] if inline else []
        parts += [w[3] for w in words[idx + 1:end]]
        spans.append((letter, left, ' '.join(p for p in parts if p).strip()))
    return spans


def build_questions(lines, page_no, out):
    cur = None
    last_q = None
    block = 0

    def flush():
        nonlocal cur
        if cur:
            out.append(cur)
        cur = None

    for ln in lines:
        text = ln['text']
        spans = marker_spans(ln['words'])
        qm = QNUM.match(text)

        if qm and not spans:
            n = int(qm.group(1))
            if last_q is None or (n > last_q and n - last_q <= 30) or (n == 1 and last_q and last_q > 5):
                if last_q is not None and n <= last_q:
                    block += 1
                flush()
                cur = {'page': page_no + 1, 'qno': n, 'block': block,
                       'question': qm.group(2).strip(), 'options': [''] * 4,
                       'marker_x': {}, 'answer': None}
                last_q = n
                continue

        if cur is None:
            continue

        if spans:
            for letter, x, opt in spans:
                k = 'abcd'.index(letter)
                cur['marker_x'][letter] = x
                if opt:
                    cur['options'][k] = (cur['options'][k] + ' ' + opt).strip()
            continue

        target = None
        if cur['marker_x']:
            # a continuation line may span both option cells, so split its
            # words at the marker positions and append each piece separately
            marks = sorted(cur['marker_x'].items(), key=lambda kv: kv[1])
            cells = {letter: [] for letter, _ in marks}
            for word in ln['words']:
                chosen = marks[0][0]
                for letter, x in marks:
                    if x - 25 <= word[0]:
                        chosen = letter
                cells[chosen].append(word[3])
            for letter, parts in cells.items():
                if not parts:
                    continue
                k = 'abcd'.index(letter)
                cur['options'][k] = (cur['options'][k] + ' ' + ' '.join(parts)).strip()
            continue

        if any(cur['options']):
            cur['options'][3] = (cur['options'][3] + ' ' + text).strip()
        else:
            cur['question'] = (cur['question'] + ' ' + text).strip()
    flush()


def tidy(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'^[^\w(]+', '', s)
    s = re.sub(r'\s*\bWw\b\s*$', '', s)
    # the scan repeats a wrapped word at a line break ("orientation orientation")
    s = re.sub(r'\b(\w{4,})((?:\s+\1\b)+)', r'\1', s, flags=re.I)
    return s.strip(' .,;:-')


BLEED_RE = re.compile(r'\b\d{1,3}\.\s+[A-Za-z]')


def keep_record(q, opts):
    """Reject a question whose option cells swallowed part of the layout."""
    if len(q) < 12:
        return False
    if sum(1 for o in opts if len(o) >= 2) < 4:
        return False
    if min(len(o) for o in opts) < 2:
        return False
    joined = q + ' ' + ' '.join(opts)
    # an option grid that leaked into a neighbouring question leaves a
    # second option marker, a following question number or a page heading
    if re.search(r'\b[A-D]\s*[\)\].]\s', joined):
        return False
    if BLEED_RE.search(' '.join(opts)):
        return False
    if re.search(r'(?:DIMENSIONS|DOMAINS|CHAPTER)\b', joined):
        return False
    if max(len(o) for o in opts) > 220:
        return False
    if re.search(r'\b(\w+)\s+\1\b', q) and len(q) < 40:
        return False
    return True


def main():
    pdf, out_path, book = sys.argv[1], sys.argv[2], sys.argv[3]
    start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    end = int(sys.argv[5]) if len(sys.argv) > 5 else 10 ** 6
    doc = fitz.open(pdf)
    total = min(end, doc.page_count)
    raw = []
    for pno in range(start, total):
        lines = column_lines(doc[pno])
        build_questions(lines, pno, raw)
        if (pno - start) % 20 == 0:
            print(f'  page {pno + 1}/{total}', flush=True)

    records = []
    for r in raw:
        q = tidy(r['question'])
        opts = [tidy(o) for o in r['options']]
        if not keep_record(q, opts):
            continue
        records.append({
            'source_book': book,
            'section': f"p.{r['page']}",
            'page': r['page'],
            'block': r['block'],
            'qno': r['qno'],
            'question': q,
            'options': opts,
            'answer': None,
            'quality': 'questions_only',
            'language': 'en',
        })

    json.dump(records, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{book}: {len(records)} questions with four options (raw {len(raw)})')


if __name__ == '__main__':
    main()
