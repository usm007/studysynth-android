import json
from collections import Counter

path = r'C:\Users\Admin\AppData\Local\Temp\opencode\paper2_2023.json'
recs = json.load(open(path, encoding='utf-8'))
c = Counter(r['qno'] for r in recs)
dups = sorted((q, n) for q, n in c.items() if n > 1)
print('records', len(recs), 'distinct qno', len(c))
print('duplicated qno:', dups[:20], '... count', len(dups))
print('qno <= 90 records:', sum(1 for r in recs if r['qno'] <= 90))
for q, n in dups[:4]:
    print(f'--- qno {q} copies {n}')
    for r in recs:
        if r['qno'] == q:
            print('   p', r['page'], 'block', r['block'], '|', r['question'][:70])
            print('     opts', [o[:30] for o in r['options']])
