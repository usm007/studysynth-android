import sys

import fitz

path = r'C:\Users\Admin\Desktop\CDP_(MCQ)_Merged.pdf'
doc = fitz.open(path)
for pno in [int(x) for x in sys.argv[1:]]:
    pix = doc[pno].get_pixmap(dpi=90)
    out = rf'C:\Users\Admin\AppData\Local\Temp\opencode\cdpmcq_p{pno + 1}.png'
    pix.save(out)
    print(out, pix.width, pix.height)
