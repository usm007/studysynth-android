import json
import re

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    all_raw = json.load(f)

# Build a lookup for all_raw by question text or norm
raw_map = {}
for r in all_raw:
    stem = r.get('question', '').strip().lower()
    norm = re.sub(r'[^a-z0-9]', '', stem)[:80]
    if norm and norm not in raw_map:
        raw_map[norm] = r

print(f"Total CTET questions: {len(ctet_data['questions'])}")
print(f"Raw map size: {len(raw_map)}")

sources_classified = {}
for q in ctet_data['questions']:
    stem = q.get('stem', '').strip().lower()
    norm = re.sub(r'[^a-z0-9]', '', stem)[:80]
    raw = raw_map.get(norm, {})
    
    src_book = raw.get('source_book', q.get('source_title', ''))
    section = raw.get('section', '')
    
    key = f"{src_book} | {section[:20]}"
    sources_classified[key] = sources_classified.get(key, 0) + 1

for k, v in sorted(sources_classified.items(), key=lambda x: -x[1])[:35]:
    print(f"{v:4d}: {k}")

