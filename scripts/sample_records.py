import json, sys, random

path = sys.argv[1]
out_path = sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 5
recs = json.load(open(path, encoding='utf-8'))
random.seed(7)
sample = random.sample(recs, min(n, len(recs)))
out = []
for r in sample:
    out.append(f"p{r.get('page')} q{r.get('qno')} ans={r.get('answer')} {r.get('quality')}")
    out.append('  Q: ' + (r['question'] or '')[:240])
    for i, o in enumerate(r['options']):
        out.append(f'   {i+1}. ' + (o or '')[:120])
open(out_path, 'w', encoding='utf-8').write('\n'.join(out))
print('written', out_path, len(sample))
