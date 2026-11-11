import sys
import numpy as np
import fitz

for path, pno in [(r'C:/Users/Admin/Downloads/CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf', 5),
                  (r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf', 5)]:
    doc = fitz.open(path)
    page = doc[pno]
    print('---', path.split('/')[-1][:40], 'page', pno + 1)
    print('   rect', page.rect, 'rotation', page.rotation)
    pix = page.get_pixmap(dpi=180)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n >= 3:
        gray = (0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]).astype(np.uint8)
    else:
        gray = img[:, :, 0]
    ink = (gray < 140).sum(axis=0).astype(np.float32)
    dens = np.convolve(ink, np.ones(9) / 9, mode='same')
    h, w = gray.shape
    lo, hi = int(0.30 * w), int(0.75 * w)
    step = max(1, (hi - lo) // 20)
    prof = [f'{int(lo + i * step)}:{int(dens[lo + i * step])}' for i in range(20)]
    print('   width', w, 'height', h)
    print('   ink profile (x:ink) from 30% to 75%:', ' '.join(prof))
    print('   global min in 30-75%:', lo + int(np.argmin(dens[lo:hi])),
          'as fraction', round((lo + int(np.argmin(dens[lo:hi]))) / w, 3))
