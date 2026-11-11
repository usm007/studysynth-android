"""Apply the current Booster filters to an already parsed file (no re-OCR)."""
import json
import sys

sys.path.insert(0, r'C:\Users\Admin\Desktop\NET Ed\scripts')
from parse_booster_tsv import keep_record, tidy

path = sys.argv[1] if len(sys.argv) > 1 else \
    r'C:\Users\Admin\AppData\Local\Temp\opencode\booster_part.json'
recs = json.load(open(path, encoding='utf-8'))
kept = []
for r in recs:
    q = tidy(r.get('question', ''))
    opts = [tidy(o) for o in r.get('options', [''] * 4)]
    if not keep_record(q, opts):
        continue
    r['question'] = q
    r['options'] = opts
    kept.append(r)
json.dump(kept, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'booster: {len(recs)} -> {len(kept)}')
