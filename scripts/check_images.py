import fitz

for tag, path in [
    ('PRABHAT', r'C:/Users/Admin/Downloads/CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf'),
    ('BOOSTER', r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf'),
]:
    doc = fitz.open(path)
    pages_with_images = 0
    for i in range(min(40, doc.page_count)):
        if doc[i].get_images(full=True):
            pages_with_images += 1
    print(tag, 'pages checked 40, with images:', pages_with_images)
    print('   page 7 images:', len(doc[6].get_images(full=True)))
    # drawing/image blocks
    d = doc[6].get_text('dict')
    kinds = {}
    for b in d['blocks']:
        kinds[b['type']] = kinds.get(b['type'], 0) + 1
    print('   block types on page 7:', kinds)
