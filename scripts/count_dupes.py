import json, sys, re
from collections import Counter

for path in sys.argv[1:]:
    recs = json.load(open(path, encoding='utf-8'))
    norm = []
    for r in recs:
        q = re.sub(r'[^a-z0-9 ]', '', (r['question'] or '').lower())
        q = re.sub(r'\s+', ' ', q).strip()
        norm.append(q)
    c = Counter(norm)
    dup = sum(v - 1 for v in c.values() if v > 1)
    print(f'{path.split("/")[-1]}: {len(recs)} records, {len(c)} unique stems, {dup} duplicates')
    top = [(v, k[:70]) for k, v in c.most_common(3) if v > 1]
    for v, k in top:
        print(f'    x{v}: {k}')
