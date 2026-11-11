import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\PAPER-2 Answer - (Aug-23).pdf'
doc = fitz.open(path)
p = doc[4]
print('rect', p.rect)
pix = p.get_pixmap(dpi=100)
out = r'C:\Users\Admin\AppData\Local\Temp\opencode\keypage5.png'
pix.save(out)
print(out, pix.width, pix.height)
