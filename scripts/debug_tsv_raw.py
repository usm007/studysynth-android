import csv
import subprocess

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
png = r'C:\Users\Admin\AppData\Local\Temp\opencode\_probe_tsv.png'

import fitz
doc = fitz.open(r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf')
doc[6].get_pixmap(dpi=200).save(png)

r = subprocess.run([TESS, png, 'stdout', '--psm', '3', '-l', 'eng',
                    '--tessdata-dir', TESSDATA, 'tsv'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
lines = r.stdout.splitlines()
print('stderr:', r.stderr.strip()[:200])
print('rows:', len(lines))
for ln in lines[:5]:
    print(repr(ln[:160]))
