import csv
import os
import subprocess

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
tmp = r'C:\Users\Admin\AppData\Local\Temp\opencode'
png = os.path.join(tmp, '_probe_tsv.png')
base = os.path.join(tmp, '_probe_out')

for run in range(2):
    r = subprocess.run([TESS, png, base, '--psm', '3', '-l', 'eng',
                        '--tessdata-dir', TESSDATA, '-c', 'tessedit_create_tsv=1'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    rows = list(csv.reader(open(base + '.tsv', encoding='utf-8').read().splitlines(),
                           delimiter='\t'))
    data = rows[1:]
    lvl5 = [x for x in data if x and x[0] == '5']
    print('run', run, 'rows', len(data), 'level5', len(lvl5),
          'groups', len({(x[2], x[3], x[4]) for x in lvl5}),
          'y max', max(int(x[7]) for x in lvl5))
