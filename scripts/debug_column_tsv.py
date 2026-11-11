import csv
import os
import subprocess

import fitz

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
tmp = r'C:\Users\Admin\AppData\Local\Temp\opencode'
png = os.path.join(tmp, '_probe_col.png')
base = os.path.join(tmp, '_probe_col_out')

doc = fitz.open(r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf')
page = doc[6]
w, h = page.rect.width, page.rect.height

for label, (x0, x1) in [('LEFT', (w * 0.03, w * 0.47)), ('RIGHT', (w * 0.51, w * 0.97))]:
    page.get_pixmap(dpi=250, clip=fitz.Rect(x0, 0, x1, h)).save(png)
    for psm in (6,):
        subprocess.run([TESS, png, base, '--psm', str(psm), '-l', 'eng',
                        '--tessdata-dir', TESSDATA, '-c', 'tessedit_create_tsv=1'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
        rows = list(csv.reader(open(base + '.tsv', encoding='utf-8').read().splitlines(), delimiter='\t'))
        data = rows[1:]
        lvl5 = [x for x in data if x and x[0] == '5' and x[11].strip()]
        print(label, 'psm', psm, 'rows', len(data), 'words', len(lvl5))
        # reconstruct lines
        groups = {}
        for x in lvl5:
            groups.setdefault((x[2], x[3], x[4]), []).append(x)
        out = []
        for key in sorted(groups, key=lambda k: (int(k[0]), int(k[1]), int(k[2]))):
            ws = sorted(groups[key], key=lambda r: int(r[6]))
            out.append(f"  y{ws[0][7]:>5} x{ws[0][6]:>5}: " + ' '.join(r[11] for r in ws)[:95])
        print('\n'.join(out[:12]))
