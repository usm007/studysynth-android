import json

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    raw_qs = json.load(f)

yct = [q for q in raw_qs if 'YCT' in q.get('source_book', '')]
print("YCT count:", len(yct))
if yct:
    print("Sample YCT q:", yct[0])
    # check sections of YCT
    yct_secs = set(q.get('section', '') for q in yct)
    print("YCT sections count:", len(yct_secs))
    print("Sample YCT sections:", list(yct_secs)[:15])

# Also check stem/explanation for PYQ mentions
pyq_mentions = 0
for q in yct[:100]:
    s = q.get('question', '') + ' ' + q.get('explanation', '')
    if 'CTET' in s or 'Paper' in s or '20' in s:
        pyq_mentions += 1
print("PYQ mentions in first 100 YCT questions:", pyq_mentions)

