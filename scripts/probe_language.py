import pymupdf, json, sys

STOP = set(('the of and to in is are that this it for with as on by be from or an at '
            'which not how what when who why these those has have been will can').split())


def eng_score(text):
    toks = []
    for w in text.split():
        w = w.strip('.,;:()[]"\'!?').lower()
        if w:
            toks.append(w)
    if len(toks) < 20:
        return 0.0, len(toks)
    hits = sum(1 for w in toks if w in STOP)
    return hits / len(toks), len(toks)


FILES = {
    'YCT2021': r'C:/Users/Admin/Downloads/CTET 2021 Solved Papers (All Shifts) Junior Level (Class VI to VIII) (YCT Expert Team) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    'Himanshi': r'C:/Users/Admin/Downloads/CTET_&_STETs__Child_Development Himanshi singh.pdf',
}

for tag, path in FILES.items():
    doc = pymupdf.open(path)
    good = []
    for i in range(doc.page_count):
        s, n = eng_score(doc[i].get_text())
        if n >= 20 and s >= 0.10:
            good.append(i + 1)
    print(f'{tag}: pages {doc.page_count} | english-ish pages {len(good)}')
    print('  first 40:', good[:40])
