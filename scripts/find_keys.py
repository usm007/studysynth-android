import pymupdf, re, sys, os

for f in sys.argv[1:]:
    d = pymupdf.open(f)
    hits = []
    for i in range(d.page_count):
        t = d[i].get_text()
        for m in re.finditer(r'(?i)(answer\s*key|answer\s*keys|key\s*:|\banswers\b)', t):
            hits.append((i + 1, re.sub(r'\s+', ' ', t[m.start():m.start() + 70])))
    print(f'--- {os.path.basename(f)[:60]} ({d.page_count} p): {len(hits)} key-ish hits')
    for h in hits[:12]:
        print('   p%d: %s' % h)
