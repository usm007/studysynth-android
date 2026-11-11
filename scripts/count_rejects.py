import json
import re
import sys

sys.path.insert(0, r'C:\Users\Admin\Desktop\NET Ed\scripts')

path = r'C:/Users/Admin/AppData/Local/Temp/opencode/booster_test.json'
recs = json.load(open(path, encoding='utf-8'))
print('records', len(recs))
for pat, label in [
    (r'\b[A-D]\s*[\)\].]\s', 'extra option marker'),
    (r'(?:DIMENSIONS|DOMAINS|CHAPTER)\b', 'heading'),
]:
    hits = [r for r in recs if re.search(pat, r['question'] + ' ' + ' '.join(r['options']))]
    print(f'{label}: {len(hits)}')
    for r in hits[:3]:
        print('   p', r['page'], '|', r['question'][:70])
        print('     opts', [o[:40] for o in r['options']])
longo = [r for r in recs if max(len(o) for o in r['options']) > 220]
print('long option:', len(longo))
dupes = [r for r in recs if re.search(r'\b(\w+)\s+\1\b', r['question']) and len(r['question']) < 40]
print('dupe words:', len(dupes))
