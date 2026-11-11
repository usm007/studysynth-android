import json, sys
from collections import Counter

path = sys.argv[1]
recs = json.load(open(path, encoding='utf-8'))
c = Counter(sum(1 for o in r['options'] if o) for r in recs)
print('options filled -> count:', dict(sorted(c.items())))
ans = sum(1 for r in recs if r['answer'])
print('with answer:', ans, 'of', len(recs))
# page spread
pages = Counter(r['page'] for r in recs)
print('pages covered:', len(pages), 'most questions on a page:', pages.most_common(3))
