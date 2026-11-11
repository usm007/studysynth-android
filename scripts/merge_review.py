import json, csv, os

ROOT = r'C:\Users\Admin\Desktop\NET Ed\output'
PAPERS = os.path.join(ROOT, 'ctet_success_master_all.json')
SETS = os.path.join(ROOT, 'ctet_success_master_mcqs.json')
OUT_JSON = os.path.join(ROOT, 'ctet_english_questions.json')
OUT_CSV = os.path.join(ROOT, 'ctet_english_questions.csv')

records = []

if os.path.exists(PAPERS):
    for r in json.load(open(PAPERS, encoding='utf-8')):
        records.append({
            'source_book': r['book'],
            'section': r['paper'],
            'qno': r['qno'],
            'question': r['question'],
            'options': r['options'],
            'answer': r['answer'],
            'language': 'en',
        })

if os.path.exists(SETS):
    for r in json.load(open(SETS, encoding='utf-8')):
        records.append({
            'source_book': r['book'],
            'section': f"Practice Set {r['set']}",
            'qno': r['qno'],
            'question': r['question'],
            'options': r['options'],
            'answer': r['answer'],
            'language': 'en',
        })

# dedupe on (section, qno, question)
seen = set()
clean = []
for r in records:
    key = (r['section'], r['qno'], r['question'][:80])
    if key in seen:
        continue
    seen.add(key)
    clean.append(r)

json.dump(clean, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['source_book', 'section', 'qno', 'question', 'opt1', 'opt2', 'opt3', 'opt4', 'answer'])
    for r in clean:
        w.writerow([r['source_book'], r['section'], r['qno'], r['question']] + r['options'] +
                   [r['answer'] if r['answer'] else ''])

print('merged:', len(clean))
from collections import Counter
print(Counter(r['section'] for r in clean))
print('with answers:', sum(1 for r in clean if r['answer']))
print('4 options:', sum(1 for r in clean if all(r['options'])))
