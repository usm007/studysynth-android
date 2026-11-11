import re

import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\Jan-2024 P-2.pdf'
doc = fitz.open(path)
rows = []
for i in range(doc.page_count):
    t = doc[i].get_text()
    q = len(re.findall(r'(?m)^\s*(\d{1,3})\.\s', t))
    o = len(re.findall(r'(?m)^\s*\(\d\)\s', t))
    img = len(doc[i].get_images(full=True))
    latin = len(re.findall(r'[A-Za-z]', t))
    rows.append((i + 1, len(t), latin, q, o, img))
for r in rows:
    print(f'p{r[0]:3d} chars{r[1]:6d} latin{r[2]:6d} q{r[3]:3d} opts{r[4]:3d} imgs{r[5]}')
