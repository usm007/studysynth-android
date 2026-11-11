import json
from collections import Counter

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    raw_qs = json.load(f)

print("Total raw questions:", len(raw_qs))
# Check unique source_books and sections
book_sec = Counter()
for q in raw_qs:
    b = q.get('source_book', '')
    s = q.get('section', '')
    book_sec[(b, s)] += 1

print("\nSample (book, section) counts:")
for (b, s), c in book_sec.most_common(50):
    print(f"[{b}] -> [{s}]: {c}")

