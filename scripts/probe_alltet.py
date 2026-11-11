import re

import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\CTET_All_State_TET_Class_I_V_&_VI_VIII_Child_Development_and_Pedagogy.pdf'
doc = fitz.open(path)
print('pages', doc.page_count)
imgs = sum(1 for i in range(min(60, doc.page_count)) if doc[i].get_images(full=True))
print('pages with images in first 60:', imgs)
for pno in (9, 40, 120, 300):
    t = doc[pno].get_text()
    dev = sum(1 for ch in t if '\u0900' <= ch <= '\u097f')
    latin = len(re.findall(r'[A-Za-z]', t))
    print(f'--- p{pno+1}: chars {len(t)} latin {latin} dev {dev}')
    print(t[:600].replace('\n', ' | ')[:600])
