import json
import sys

recs = json.load(open(sys.argv[1], encoding='utf-8'))
qnos = sorted({r['qno'] for r in recs})
missing = [n for n in range(1, max(qnos) + 1) if n not in set(qnos)]
print('distinct qno', len(qnos), 'max', max(qnos))
print('missing:', missing)
