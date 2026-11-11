import re

import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\Aug-23 Ctet Paper-2.pdf'
doc = fitz.open(path)
hits = {}
for i in range(doc.page_count):
    t = doc[i].get_text()
    for m in re.findall(r'P-[IV]+/[A-H]', t):
        hits[m] = hits.get(m, 0) + 1
print('header tokens:', hits)
print('page 1 head:', doc[0].get_text()[:300].replace('\n', ' | '))
