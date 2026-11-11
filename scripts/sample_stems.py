import json
import re

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

# Let's inspect 10 sample stems from ctet_data
print("Sample stems:")
for q in ctet_data['questions'][:20]:
    print(" - ", q['stem'][:90])

