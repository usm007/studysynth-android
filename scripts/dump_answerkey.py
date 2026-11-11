import fitz

path = r'C:\Users\Admin\Downloads\Telegram Desktop\PAPER-2 Answer - (Aug-23).pdf'
doc = fitz.open(path)
print('pages', doc.page_count)
for i in range(min(3, doc.page_count)):
    print(f'--- page {i+1} ---')
    print(doc[i].get_text()[:1800])
