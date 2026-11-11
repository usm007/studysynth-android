import glob
import os
import re

import fitz

roots = [r'C:\Users\Admin\Desktop', r'C:\Users\Admin\Downloads', r'C:\Users\Admin\Documents']
seen = set()
rows = []
for root in roots:
    for path in glob.glob(os.path.join(root, '**', '*.pdf'), recursive=True):
        key = os.path.normcase(path)
        if key in seen:
            continue
        seen.add(key)
        try:
            doc = fitz.open(path)
        except Exception as e:
            rows.append((path, -1, 0, 0, 0, str(e)[:40]))
            continue
        sample = min(doc.page_count, 40)
        text = '\n'.join(doc[i].get_text() for i in range(sample))
        opts = len(re.findall(r'(?m)^\s*\(?[1-4a-dA-D][\).]\s+\S', text))
        dev = sum(1 for ch in text if '\u0900' <= ch <= '\u097F')
        words = len(re.findall(r'\b[A-Za-z]{3,}\b', text))
        rows.append((path, doc.page_count, len(text), opts, words, dev))

rows.sort(key=lambda r: -r[3])
out = []
for path, pages, chars, opts, words, dev in rows:
    out.append(f'{os.path.basename(path)[:70]:72s} p{pages:4d} chars{chars:7d} '
               f'opts{opts:5d} words{words:6d} dev{dev:6d}')
text = '\n'.join(out)
open(r'C:\Users\Admin\AppData\Local\Temp\opencode\pdf_inventory.txt', 'w', encoding='utf-8').write(text)
print('pdfs:', len(rows))
print(text[:3000])
