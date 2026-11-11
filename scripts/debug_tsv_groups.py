import subprocess

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
png = r'C:\Users\Admin\AppData\Local\Temp\opencode\_probe_tsv.png'

r = subprocess.run([TESS, png, 'stdout', '--psm', '3', '-l', 'eng',
                    '--tessdata-dir', TESSDATA, '-c', 'tessedit_create_tsv=1'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
import csv
rows = list(csv.reader(r.stdout.splitlines(), delimiter='\t'))
header = [h.strip() for h in rows[0]]
print('header', header)
data = [dict(zip(header, [c.strip() for c in row])) for row in rows[1:]]
lvl5 = [d for d in data if d.get('level') == '5']
print('rows', len(data), 'level5', len(lvl5))
keys = {}
for d in lvl5:
    keys.setdefault((d['block_num'], d['par_num'], d['line_num']), []).append(d)
print('groups', len(keys))
tops = sorted(int(d['top']) for d in lvl5)
print('y range', tops[0], tops[-1], 'image should be ~2200 tall')
lefts = sorted(int(d['left']) for d in lvl5)
print('x range', lefts[0], lefts[-1])
