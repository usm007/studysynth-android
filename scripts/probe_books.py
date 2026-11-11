import pymupdf, re, sys, os

files = sys.argv[1:]
for f in files:
    try:
        d = pymupdf.open(f)
    except Exception as e:
        print(f'{os.path.basename(f)}: open fail {e}')
        continue
    sample = min(d.page_count, 80)
    txt = '\n'.join(d[i].get_text() for i in range(sample))
    opt = len(re.findall(r'(?m)^\s*\(?[1-4a-d][\).]\s+\S', txt))
    ans = len(re.findall(r'\bAns\b', txt))
    dev = sum(1 for ch in txt if '\u0900' <= ch <= '\u097F')
    ascii_words = len(re.findall(r'\b[A-Za-z]{2,}\b', txt))
    print(f'{os.path.basename(f)[:58]:60s} pages {d.page_count:4d} | text/80p {len(txt):7d} '
          f'| opt {opt:4d} | Ans {ans:3d} | devanagari {dev:6d} | latin words {ascii_words:6d}')
