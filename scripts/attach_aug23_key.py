"""Attach the official CTET Aug-2023 Paper-II (Social Science) answer key to the paper.

The key booklet prints one page per set; page 5 is Set E, PAPER-II (SOC.),
which matches this paper ("P-II/E" on every page).
"""
import json
import re
import sys

import fitz

KEY_PDF = r'C:\Users\Admin\Downloads\Telegram Desktop\PAPER-2 Answer - (Aug-23).pdf'
PAPER_JSON = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\Admin\AppData\Local\Temp\opencode\paper2_2023.json'
SET_PAGE = 4  # index of printed page 5


def parse_key_page(text):
    lines = [l.strip() for l in text.splitlines()]
    # drop the header block up to the second dashed rule
    dashes = [i for i, l in enumerate(lines) if set(l) == {'-'}]
    start = (dashes[1] + 1) if len(dashes) > 1 else 0
    nums = []
    for l in lines[start:]:
        if re.fullmatch(r'\d{1,3}', l):
            nums.append(int(l))
    key = {}
    for i in range(0, len(nums) - 1, 2):
        q, a = nums[i], nums[i + 1]
        if 1 <= q <= 150 and 1 <= a <= 4:
            key[q] = a
    return key


doc = fitz.open(KEY_PDF)
key = parse_key_page(doc[SET_PAGE].get_text())
print('key entries:', len(key), 'min', min(key), 'max', max(key))
missing = [q for q in range(1, 151) if q not in key]
print('missing question numbers:', missing[:10], 'total', len(missing))

recs = json.load(open(PAPER_JSON, encoding='utf-8'))
hit = 0
for r in recs:
    qn = r.get('qno')
    if qn in key:
        r['answer'] = key[qn]
        r['quality'] = 'complete'
        hit += 1
json.dump(recs, open(PAPER_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('questions keyed:', hit, 'of', len(recs))
