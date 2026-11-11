import json
import re

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    all_raw = json.load(f)

raw_map = {}
for r in all_raw:
    stem = r.get('question', '').strip().lower()
    norm = re.sub(r'[^a-z0-9]', '', stem)[:80]
    if norm and norm not in raw_map:
        raw_map[norm] = r

# Let's inspect 30 sample stems from ctet_data that don't have explicit keywords
sample_cdp = []
for q in ctet_data['questions']:
    s = q.get('stem', '').lower()
    if not any(k in s for k in ['harappa', 'mughal', 'earth', 'globe', 'constitution', 'parliament', 'piaget', 'kohlberg', 'vygotsky', 'inclusive', 'dyslexia', 'assessment', 'cce', 'gardner', 'dewey']):
        sample_cdp.append(q['stem'])

print(f"Total unassigned sample: {len(sample_cdp)}")
print("Sample stems:")
for st in sample_cdp[100:130]:
    print(" -", st[:95])

