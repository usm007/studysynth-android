import json
import re

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

pyq_patterns = [
    r'CTET\s+(?:Jan|Feb|July?|Aug|Sept?|Nov|Dec)?\s*\d{4}',
    r'CTET\s+\d{4}',
    r'Paper[-\s]*(?:I|II|1|2)',
    r'Solved\s+Paper',
    r'Uptet|Reet|Htet|Kvs|Dsssb'
]

pyq_regex = re.compile('|'.join(pyq_patterns), re.IGNORECASE)

pyq_found = 0
non_pyq = 0
examples_pyq = []
examples_non = []

for q in ctet_data['questions']:
    src = q.get('source_title', '')
    stem = q.get('stem', '')
    expl = q.get('explanation', '')
    full = f"{src} {stem} {expl}"
    
    # Check if source or text indicates PYQ
    is_pyq = False
    if any(k in src for k in ['Solved Papers', 'CTET Paper-I', 'CTET Paper-II', 'Paper II', 'Paper I']):
        if 'chapter exercises' not in src and 'Practice Book' not in src and 'Practice Set' not in src:
            is_pyq = True
    elif pyq_regex.search(stem) or pyq_regex.search(expl):
        is_pyq = True
        
    if is_pyq:
        pyq_found += 1
        if len(examples_pyq) < 5:
            examples_pyq.append((src, stem[:70]))
    else:
        non_pyq += 1
        if len(examples_non) < 5:
            examples_non.append((src, stem[:70]))

print(f"Total: {len(ctet_data['questions'])}")
print(f"PYQ: {pyq_found}")
print(f"Non-PYQ: {non_pyq}")
print("\nSample PYQs:")
for s, st in examples_pyq:
    print(f"  [{s}] {st}")
print("\nSample Non-PYQs:")
for s, st in examples_non:
    print(f"  [{s}] {st}")

