import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\PAPER-2 Answer - (Aug-23).pdf'
doc = fitz.open(path)
t = doc[4].get_text()
print(repr(t[:1200]))
print('---- lines ----')
for ln in t.splitlines()[:40]:
    print(repr(ln))
