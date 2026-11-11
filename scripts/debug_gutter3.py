import numpy as np
import fitz

BOOKS = [
    ('PRABHAT', r'C:/Users/Admin/Downloads/CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf'),
    ('BOOSTER', r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf'),
]

for tag, path in BOOKS:
    doc = fitz.open(path)
    print('###', tag, 'pages', doc.page_count)
    for pno in (5, 6, 10, 50, 120, 300):
        if pno >= doc.page_count:
            continue
        page = doc[pno]
        pix = page.get_pixmap(dpi=180)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        gray = img[:, :, 0]
        h, w = gray.shape
        for thr in (235, 245):
            ink = (gray < thr).sum(axis=0).astype(np.float32)
            dens = np.convolve(ink, np.ones(9) / 9, mode='same')
            a, b = int(0.40 * w), int(0.60 * w)
            x = a + int(np.argmin(dens[a:b]))
            left = dens[int(0.05 * w):int(0.30 * w)].mean()
            mid = dens[x]
            right = dens[int(0.70 * w):int(0.95 * w)].mean()
            print(f'  p{pno+1:4d} thr{thr}: split {x/w:.3f} | ink gutter {mid:6.0f} | left {left:6.0f} | right {right:6.0f}')
