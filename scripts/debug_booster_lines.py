import json
import sys

sys.path.insert(0, r'C:\Users\Admin\Desktop\NET Ed\scripts')
import fitz
from parse_booster_tsv import ocr_lines, parse_page, drop_noise

path = r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(path)
pno = int(sys.argv[1])
lines, width = ocr_lines(doc[pno])
out = [f'page {pno+1} width {width} lines {len(lines)}']
for ln in lines:
    out.append(f"  x{ln['x0']:4d}-{ln['x1']:4d} y{ln['y0']:4d} drop={drop_noise(ln)} | {ln['text'][:90]}")
events = parse_page(lines, width)
out.append('--- events in reading order ---')
for ev in events:
    out.append(f"  x{ev['x0']:4d} spans={ev['spans']} | {ev['text'][:80]}")
open(r'C:/Users/Admin/AppData/Local/Temp/opencode/booster_lines.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len(lines))
