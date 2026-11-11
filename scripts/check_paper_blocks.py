import json
import re
from collections import Counter

path = r'C:\Users\Admin\AppData\Local\Temp\opencode\paper2_2023.json'
recs = json.load(open(path, encoding='utf-8'))
qnos = Counter(r['qno'] for r in recs)
print('records', len(recs), 'distinct qno', len(qnos))
dups = [(q, c) for q, c in qnos.items() if c > 1]
print('duplicated qno count', len(dups), 'max copies', max(qnos.values()))
print('sample dups', sorted(dups)[:10])
print('qno range', min(qnos), max(qnos))
blocks = Counter(r['block'] for r in recs)
print('blocks', dict(sorted(blocks.items())))
for r in recs[:3]:
    print('  ', r['block'], r['qno'], r['page'], r['question'][:60])
print('--- block sizes and first qno ---')
seen = {}
for r in recs:
    seen.setdefault(r['block'], []).append(r['qno'])
for b, qs in sorted(seen.items()):
    print(f'  block {b}: n={len(qs)} first={qs[0]} last={qs[-1]}')
