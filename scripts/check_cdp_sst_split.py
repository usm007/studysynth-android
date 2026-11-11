import json
import re

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    all_raw = json.load(f)

# Build a lookup for all_raw by stem
raw_map = {}
for r in all_raw:
    stem = r.get('question', '').strip().lower()
    norm = re.sub(r'[^a-z0-9]', '', stem)[:80]
    if norm and norm not in raw_map:
        raw_map[norm] = r

cdp_count = 0
sst_count = 0

for q in ctet_data['questions']:
    stem = q.get('stem', '').strip().lower()
    norm = re.sub(r'[^a-z0-9]', '', stem)[:80]
    raw = raw_map.get(norm, {})
    src_book = (raw.get('source_book', '') or q.get('source_title', '')).lower()
    sec = raw.get('section', '').lower()
    
    # check classification
    is_cdp = False
    if 'cdp' in src_book or 'child development' in src_book or 'cdp' in sec or 'child development' in sec:
        is_cdp = True
    elif 'sst' in src_book or 'social' in src_book or 'history' in sec or 'geography' in sec:
        is_cdp = False
    elif any(k in stem for k in ['piaget', 'vygotsky', 'kohlberg', 'scaffolding', 'zpd', 'schema', 'development', 'cognitive', 'pedagogy', 'inclusive', 'intelligence', 'disability', 'adhd', 'dyslexia']):
        is_cdp = True
    else:
        # check sst cues
        sst_words = ['history', 'geography', 'constitution', 'parliament', 'mughal', 'ashoka', 'earth', 'atmosphere', 'rock', 'monsoon', 'dynasty', 'chola', 'british', 'sultanate', 'harappa', 'gram sabha', 'panchayat', 'lok sabha', 'rajya sabha', 'judiciary', 'ruler', 'map', 'globe', 'latitude', 'longitude']
        if any(w in stem for w in sst_words):
            is_cdp = False
        else:
            is_cdp = True

    if is_cdp:
        cdp_count += 1
    else:
        sst_count += 1

print(f"CDP questions: {cdp_count}")
print(f"SST questions: {sst_count}")
print(f"Total: {cdp_count + sst_count}")

