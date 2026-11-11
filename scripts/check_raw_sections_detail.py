import json

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    all_raw = json.load(f)

sections = {}
for q in all_raw:
    b = q.get('source_book', '')
    s = q.get('section', '')
    k = f"{b} -> {s}"
    sections[k] = sections.get(k, 0) + 1

for k, v in sorted(sections.items(), key=lambda x: -x[1])[:40]:
    print(f"{v:4d}: {k}")

