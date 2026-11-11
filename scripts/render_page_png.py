import fitz, sys

BOOKS = {
    'prabhat': r'C:/Users/Admin/Downloads/CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
    'booster': r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf',
}
tmp = r'C:/Users/Admin/AppData/Local/Temp/opencode'
which = sys.argv[1]
pno = int(sys.argv[2])
doc = fitz.open(BOOKS[which])
pix = doc[pno].get_pixmap(dpi=90)
out = f'{tmp}/page_{which}_idx{pno}.png'
pix.save(out)
print(out, pix.width, pix.height)
