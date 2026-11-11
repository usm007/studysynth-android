import json

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

questions = data['questions']
print("Total questions in ctet_pyq_papers:", len(questions))

# Check sources
sources = {}
for q in questions:
    st = q.get('source_title', '')
    sources[st] = sources.get(st, 0) + 1

for st, count in sorted(sources.items(), key=lambda x: -x[1]):
    print(f"{count:4d}: {st}")

