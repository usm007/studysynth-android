import sys

import fitz

path = sys.argv[1]
pno = int(sys.argv[2])
out = sys.argv[3]
doc = fitz.open(path)
t = doc[pno].get_text()
open(out, 'w', encoding='utf-8').write(f'page {pno+1}\n' + t[:2500])
print('ok')
