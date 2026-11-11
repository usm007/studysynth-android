import glob
import hashlib
import os
import re

import fitz

roots = [r'C:\Users\Admin\Desktop', r'C:\Users\Admin\Downloads', r'C:\Users\Admin\Documents']
rows = {}
for root in roots:
    for path in glob.glob(os.path.join(root, '**', '*.pdf'), recursive=True):
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        key = (os.path.basename(path).lower(), size)
        if key in rows:
            continue
        rows[key] = path

out = []
for key, path in sorted(rows.items()):
    try:
        doc = fitz.open(path)
    except Exception as e:
        out.append(f'FAIL {path}')
        continue
    sample = min(doc.page_count, 40)
    text = '\n'.join(doc[i].get_text() for i in range(sample))
    opts = len(re.findall(r'(?m)^\s*\(?[1-4a-dA-D][\).]\s+\S', text))
    words = len(re.findall(r'\b[A-Za-z]{3,}\b', text))
    out.append(f'opts{opts:5d} words{words:6d} p{doc.page_count:4d} | {path}')

open(r'C:\Users\Admin\AppData\Local\Temp\opencode\pdf_inventory_paths.txt', 'w',
     encoding='utf-8').write('\n'.join(out))
print('unique files:', len(rows))
