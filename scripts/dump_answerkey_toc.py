import re

import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\PAPER-2 Answer - (Aug-23).pdf'
doc = fitz.open(path)
cur = None
for i in range(doc.page_count):
    t = doc[i].get_text()
    head = [l.strip() for l in t.splitlines() if l.strip()][:6]
    label = ' | '.join(head)[:120]
    print(f'p{i+1:3d}: {label}')
