import pymupdf, sys

path = sys.argv[1]
pages = [int(x) - 1 for x in sys.argv[2].split(',')]
out_path = sys.argv[3]
doc = pymupdf.open(path)
out = []
for p in pages:
    out.append(f'########## page {p+1}')
    out.append(doc[p].get_text())
open(out_path, 'w', encoding='utf-8').write('\n'.join(out))
print('ok', out_path)
