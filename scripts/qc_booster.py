import json
import re

path = r'C:\Users\Admin\AppData\Local\Temp\opencode\booster_part.json'
recs = json.load(open(path, encoding='utf-8'))
bleed = [r for r in recs if any(re.search(r'\b\d{1,3}\.\s+[A-Za-z]', o) for o in r['options'])]
print('total', len(recs), 'with question-number bleed in options', len(bleed))
dupe = [r for r in recs if re.search(r'\b(\w{4,})\s+\1\b', r['question'] + ' ' + ' '.join(r['options']))]
print('with duplicated adjacent word', len(dupe))
for r in bleed[:3]:
    print('  p', r['page'], '|', r['question'][:60])
    for o in r['options']:
        print('     -', o[:90])
