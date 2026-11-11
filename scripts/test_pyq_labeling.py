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

def get_pyq_source(stem, current_src):
    norm = re.sub(r'[^a-z0-9]', '', stem.lower())[:80]
    raw = raw_map.get(norm, {})
    src_book = raw.get('source_book', '') or current_src or ''
    sec = raw.get('section', '') or ''
    
    # 1. User uploaded CTET papers (explicit PYQs)
    if 'Paper-I' in current_src or 'Paper 1' in current_src:
        m = re.search(r'CTET Paper-I \([^)]+\)', current_src)
        return m.group(0) if m else current_src.replace(' - CDP', '').strip()
        
    # 2. CTET Success Master Solved Papers (CTET 2019 Dec Paper II, etc.)
    if any(p in sec for p in ['CTET 2019 Dec Paper II', 'CTET 2019 Jul Paper II', 'CTET 2018 Dec Paper II', 'CTET 2016 Sep Paper II']):
        return sec.strip()
        
    # 3. YCT Solved Papers
    if '2021 Solved Papers' in src_book:
        return 'CTET 2021 Solved Paper'
        
    if 'SST CTET YCT' in src_book:
        return 'CTET Solved Paper (SST)'

    # 4. Check if stem contains explicit PYQ tag like [CTET Dec 2019] or (CTET July 2013)
    pyq_m = re.search(r'\[?(CTET\s+(?:Jan|Feb|July?|Aug|Sept?|Nov|Dec)?\s*\d{4}[^\]\)]*)\]?', stem, re.IGNORECASE)
    if pyq_m:
        return pyq_m.group(0).strip('[]() ')
        
    # Everything else: Chapter exercises, Practice Book, Practice Sets, Generic resources
    # NON-PYQ -> Do NOT mention source!
    return ""

pyq_count = 0
non_pyq_count = 0
pyq_titles = {}

for q in ctet_data['questions']:
    src = get_pyq_source(q.get('stem', ''), q.get('source_title', ''))
    if src:
        pyq_count += 1
        pyq_titles[src] = pyq_titles.get(src, 0) + 1
    else:
        non_pyq_count += 1

print(f"Total CTET questions: {len(ctet_data['questions'])}")
print(f"Authentic PYQ questions: {pyq_count}")
print(f"Non-PYQ questions (source removed): {non_pyq_count}")
print("\nPYQ Source breakdown:")
for k, v in sorted(pyq_titles.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}: {k}")

