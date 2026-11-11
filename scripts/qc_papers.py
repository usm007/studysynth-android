import json
import os
import re
from collections import Counter

TMP = r'C:\Users\Admin\AppData\Local\Temp\opencode'
files = ['paper2_2018dec.json', 'paper2_2019jul.json', 'paper2_2019dec.json',
         'paper2_2021.json', 'paper2_2024jan.json', 'paper2_2023.json']
for f in files:
    p = os.path.join(TMP, f)
    if not os.path.exists(p):
        print(f, 'missing')
        continue
    recs = json.load(open(p, encoding='utf-8'))
    short = sum(1 for r in recs if min(len(o) for o in r['options']) < 3)
    longq = sum(1 for r in recs if len(r['question']) > 200)
    bad = sum(1 for r in recs if re.search(r'[\ufffd\u0900-\u097f]', r['question'] + ' '.join(r['options'])))
    dupq = sum(1 for r in recs if re.search(r'\b(\w{4,})\s+\1\b', r['question']))
    print(f'{f}: {len(recs)} recs | short opt {short} | long stem {longq} | non-english {bad} | dup word {dupq}')
