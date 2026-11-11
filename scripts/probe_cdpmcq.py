import re

import fitz

path = r'C:\Users\Admin\Desktop\CDP_(MCQ)_Merged.pdf'
doc = fitz.open(path)
print('pages', doc.page_count)
imgs = sum(1 for i in range(min(40, doc.page_count)) if doc[i].get_images(full=True))
print('pages with images in first 40:', imgs)
for pno in (20, 60, 200, 400):
    t = doc[pno].get_text()
    dev = sum(1 for ch in t if '\u0900' <= ch <= '\u097f')
    latin = len(re.findall(r'[A-Za-z]', t))
    print(f'--- p{pno+1}: chars {len(t)} latin {latin} dev {dev} imgs {len(doc[pno].get_images(full=True))}')
    print(t[:500].replace('\n', ' | ')[:500])
