import subprocess
import fitz

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
tmp = r'C:/Users/Admin/AppData/Local/Temp/opencode'

path = r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(path)
out = []
for pno in (6, 7):
    pix = doc[pno].get_pixmap(dpi=200)
    png = f'{tmp}/_full_{pno}.png'
    pix.save(png)
    for psm in (3, 1):
        r = subprocess.run([TESS, png, 'stdout', '--psm', str(psm), '-l', 'eng',
                            '--tessdata-dir', TESSDATA],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        out.append(f'########## p{pno+1} psm{psm}  ({len(r.stdout)} chars)')
        out.append(r.stdout)
open(f'{tmp}/booster_fullpage.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
