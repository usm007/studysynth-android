import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\PAPER-2 Answer - (Aug-23).pdf'
doc = fitz.open(path)
for idx in (4, 5):
    t = doc[idx].get_text()
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    print(f'=== page idx {idx}: lines {len(lines)}')
    print('   first:', lines[:6])
    print('   last 20:', lines[-20:])
