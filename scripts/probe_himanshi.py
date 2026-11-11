import pymupdf, re, sys

path = r'C:/Users/Admin/Downloads/CTET_&_STETs__Child_Development Himanshi singh.pdf'
doc = pymupdf.open(path)
bad = 0
good_with_opts = 0
for i in range(doc.page_count):
    t = doc[i].get_text()
    toks = t.split()
    if not toks:
        continue
    short = sum(1 for w in toks if len(w.strip('.,;:()')) <= 2)
    ratio = short / len(toks)
    has_opts = len(re.findall(r'(?m)^\s*[A-D]\.', t)) >= 3
    if ratio > 0.30:
        bad += 1
    elif has_opts:
        good_with_opts += 1
print('pages', doc.page_count, '| letter-spaced pages', bad, '| clean pages with A-D options', good_with_opts)
