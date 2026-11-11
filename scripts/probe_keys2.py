import re
from collections import Counter

for tag, path in [('BOOSTER', r'C:/Users/Admin/AppData/Local/Temp/opencode/booster_ocr_cols.txt'),
                  ('PRABHAT', r'C:/Users/Admin/AppData/Local/Temp/opencode/prabhat_ocr_cols.txt')]:
    t = open(path, encoding='utf-8').read()
    print('###', tag, 'chars', len(t))
    for pat in (r'(?i)answer\s*key', r'(?i)\banswers?\b', r'(?i)\bAns\b', r'(?i)solution'):
        hits = re.findall(pat, t)
        print(f'   {pat}: {len(hits)}')
    pages = re.split(r'===== PAGE (\d+) =====', t)
    # show pages that contain 'answer'
    show = []
    for i in range(1, len(pages), 2):
        if re.search(r'(?i)answer', pages[i + 1]):
            show.append(int(pages[i]) + 1)
    print('   pages mentioning answer:', show[:25], 'total', len(show))
    # question count per page distribution
    counts = []
    for i in range(1, len(pages), 2):
        n = len(re.findall(r'(?m)^\s*(\d{1,3})\.\s+\S', pages[i + 1]))
        counts.append(n)
    print('   median questions/page', sorted(counts)[len(counts) // 2], 'pages with >=5:', sum(1 for c in counts if c >= 5))
