import json
import os
import re

TMP = r'C:\Users\Admin\AppData\Local\Temp\opencode'
files = ['paper2_2018dec.json', 'paper2_2019jul.json', 'paper2_2019dec.json',
         'paper2_2021.json', 'paper2_2024jan.json', 'paper2_2023.json']
pat = re.compile(r'(?:\b(?:and|or|are|is|of|the)\s*$)|are correct and', re.I)
for f in files:
    recs = json.load(open(os.path.join(TMP, f), encoding='utf-8'))
    odd = [r for r in recs if any(pat.search(o) for o in r['options'])]
    nonascii = [r for r in recs if any(re.search(r'[^\x00-\x7f]', o) for o in r['options'])]
    print(f'{f}: {len(recs)} | dangling-conj options {len(odd)} | non-ascii options {len(nonascii)}')
