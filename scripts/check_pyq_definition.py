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

pyq_sources = set()
non_pyq_sources = set()

for q in ctet_data['questions']:
    stem = q.get('stem', '')
    norm = re.sub(r'[^a-z0-9]', '', stem.lower())[:80]
    raw = raw_map.get(norm, {})
    src_book = raw.get('source_book', '') or q.get('source_title', '')
    sec = raw.get('section', '')
    
    # Check if this question is from an actual PYQ
    is_pyq = False
    pyq_name = ""
    
    # Case 1: Direct user-uploaded PYQ papers
    # E.g. "CTET Paper-I (8 Dec 2019) - CDP", "CTET Paper-I (16 Dec 2021) - CDP", etc.
    if 'Paper-I' in src_book or 'Paper 1' in src_book:
        is_pyq = True
        pyq_name = src_book.replace(' - CDP', '').strip()
    # Case 2: Section has explicit PYQ name
    # E.g. "CTET 2019 Dec Paper II", "CTET 2019 Jul Paper II", "CTET 2018 Dec Paper II", "CTET 2016 Sep Paper II"
    elif any(term in sec for term in ['CTET 2019', 'CTET 2018', 'CTET 2016', 'CTET 2021', 'CTET 2022', 'CTET 2023', 'CTET 2024', 'Paper II', 'Paper I']):
        is_pyq = True
        pyq_name = sec.strip()
    # Case 3: CTET 2021 Solved Papers (YCT Expert Team)
    elif '2021 Solved Papers' in src_book:
        is_pyq = True
        pyq_name = "CTET 2021 Solved Paper"
    # Case 4: SST CTET YCT -> Is this a solved paper book? Let's check
    elif 'SST CTET YCT' in src_book:
        # Check if stem/sec mentions PYQ
        is_pyq = True
        pyq_name = "CTET Solved Paper"
    else:
        # Chapter exercises, Practice Books, Practice Sets, Complete Resource
        is_pyq = False
        pyq_name = ""

    if is_pyq:
        pyq_sources.add((src_book, sec, pyq_name))
    else:
        non_pyq_sources.add((src_book, sec))

print(f"Sample PYQ Sources ({len(pyq_sources)} variants):")
for s in list(pyq_sources)[:10]:
    print("  PYQ:", s)

print(f"\nSample Non-PYQ Sources ({len(non_pyq_sources)} variants):")
for s in list(non_pyq_sources)[:10]:
    print("  NON-PYQ:", s)

