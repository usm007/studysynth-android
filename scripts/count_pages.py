import json
import sys
from collections import Counter

recs = json.load(open(sys.argv[1], encoding='utf-8'))
c = Counter(r['page'] for r in recs)
print('pages with records:', len(c), 'total', len(recs))
print('page histogram:', ' '.join(f'{p}:{n}' for p, n in sorted(c.items())))
