import pymupdf, re, sys

path = sys.argv[1]
pno = int(sys.argv[2]) - 1
out_path = sys.argv[3]
doc = pymupdf.open(path)
t = doc[pno].get_text()
out = [f'page {pno+1} len {len(t)}', repr(t[:1500])]
pairs = re.findall(r'(\d{1,3})\s*[\.\)]\s*\(?\s*([1-4a-dA-D])\s*\)', t)
out.append(f'pairs found: {len(pairs)} {pairs[:20]}')
open(out_path, 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len(pairs))
