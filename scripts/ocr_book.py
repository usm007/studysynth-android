import fitz, os, subprocess, sys, time

PDF = sys.argv[1]
OUT = sys.argv[2]
DPI = int(sys.argv[3]) if len(sys.argv) > 3 else 200
TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

doc = fitz.open(PDF)
total = doc.page_count
out_lines = []
start_time = time.time()
for pno in range(total):
    page = doc[pno]
    pix = page.get_pixmap(dpi=DPI)
    img = f'C:/Users/Admin/AppData/Local/Temp/opencode/_ocr_page.png'
    pix.save(img)
    r = subprocess.run([TESS, img, 'stdout', '--psm', '6', '-l', 'eng'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    txt = r.stdout
    out_lines.append('===== PAGE %d =====' % (pno+1))
    out_lines.append(txt)
    if (pno+1) % 10 == 0 or pno == total-1:
        elapsed = time.time() - start_time
        print(f'OCR page {pno+1}/{total}  elapsed {elapsed:.0f}s  est total {elapsed/(pno+1)*total:.0f}s', flush=True)
        # checkpoint write
        open(OUT, 'w', encoding='utf-8').write('\n'.join(out_lines))

open(OUT, 'w', encoding='utf-8').write('\n'.join(out_lines))
print('DONE', OUT)
