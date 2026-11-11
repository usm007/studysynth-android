import subprocess

TESS = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = r'C:\Users\Admin\AppData\Local\Temp\opencode\tessdata'
png = r'C:\Users\Admin\AppData\Local\Temp\opencode\_probe_tsv.png'

r = subprocess.run([TESS, png, 'stdout', '--psm', '3', '-l', 'eng',
                    '--tessdata-dir', TESSDATA, '-c', 'tessedit_create_tsv=1'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace')
lines = r.stdout.splitlines()
print('rows', len(lines))
bad = [i for i, ln in enumerate(lines) if len(ln.split('\t')) != 12]
print('rows with wrong field count:', bad[:10], 'total', len(bad))
for i in bad[:3]:
    print('--- around row', i)
    for j in range(max(0, i - 2), min(len(lines), i + 3)):
        print(j, repr(lines[j][:180]))
print('--- last 5 rows ---')
for ln in lines[-5:]:
    print(repr(ln[:180]))
