import pymupdf, re, sys

path = sys.argv[1]
out_path = sys.argv[2]
doc = pymupdf.open(path)
scores = []
for i in range(doc.page_count):
    t = doc[i].get_text()
    scores.append((len(re.findall(r'(?m)^\s*\(?[1-4a-d][\).]\s+\S', t)), i))
scores.sort(reverse=True)
out = []
for sc, i in scores[:3]:
    out.append(f'########## page {i+1} (markers {sc})')
    out.append(doc[i].get_text()[:2500])
open(out_path, 'w', encoding='utf-8').write('\n'.join(out))
print('ok', [(s, i + 1) for s, i in scores[:3]])
