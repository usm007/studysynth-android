import re
path = r'C:/Users/Admin/AppData/Local/Temp/opencode/booster_ocr_cols.txt'
t = open(path, encoding='utf-8').read()
pages = re.split(r'===== PAGE (\d+) =====', t)
out = []
for i in range(1, len(pages), 2):
    body = pages[i + 1]
    if re.search(r'(?i)answer\s*key', body):
        out.append(f'===== PAGE {pages[i]} =====')
        out.append(body[:1500])
open(r'C:/Users/Admin/AppData/Local/Temp/opencode/booster_keypages.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('pages', len(out) // 2)
