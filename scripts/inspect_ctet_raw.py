import json
from collections import Counter

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

books = Counter()
sections = Counter()
for q in data:
    b = q.get('source_book', '')
    s = q.get('section', '')
    books[b] += 1
    sections[f"{b} -> {s}"] += 1

print('Books:')
for b, c in books.items():
    print(f'  {c:5d}: {b}')

print('\nTop 40 Book -> Section:')
for s, c in sections.most_common(40):
    print(f'  {c:5d}: {s}')

