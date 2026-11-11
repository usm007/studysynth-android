import fitz

path = r'C:/Users/Admin/Downloads/CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
doc = fitz.open(path)
p = doc[6]
print('images on page:', len(p.get_images(full=True)))
words = p.get_text('words')
print('word count', len(words))
for w in words[:40]:
    print(f'  x0={w[0]:6.1f} y0={w[1]:6.1f} x1={w[2]:6.1f}  {w[4][:40]}')
print('--- block structure ---')
for b in p.get_text('blocks')[:8]:
    print(f'  bbox=({b[0]:.0f},{b[1]:.0f},{b[2]:.0f},{b[3]:.0f}) lines={b[4].count(chr(10))}  {b[4][:60]!r}')
