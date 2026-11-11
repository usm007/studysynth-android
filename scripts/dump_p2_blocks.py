import json

path = r'C:\Users\Admin\AppData\Local\Temp\opencode\paper2_2023.json'
recs = json.load(open(path, encoding='utf-8'))
out = []
for r in recs[:18]:
    out.append(f"block {r['block']:2d} q{r['qno']:3d} p{r['page']:3d} ans={r['answer']} | {r['question'][:80]}")
open(r'C:\Users\Admin\AppData\Local\Temp\opencode\p2_blocks.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
