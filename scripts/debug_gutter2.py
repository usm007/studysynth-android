import numpy as np
import fitz

for path, pno in [(r'C:/Users/Admin/Downloads/CTET Central Teacher Eligibility Test Social StudiesSocial Science Paper-II (Class VI-VIII) 10 Practice Sets (Team Prabhat [Team Prabhat]) (z-library.sk, 1lib.sk, z-lib.sk).pdf', 5),
                  (r'C:/Users/Admin/Downloads/Booster CTET (Prateek Shivalik) (z-library.sk, 1lib.sk, z-lib.sk).pdf', 5)]:
    doc = fitz.open(path)
    page = doc[pno]
    pix = page.get_pixmap(dpi=180)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    print('---', path.split('/')[-1][:35], 'n channels', pix.n, 'size', pix.width, pix.height)
    g = img[:, :, 0]
    print('   channel0 percentiles:', [int(np.percentile(g, p)) for p in (1, 5, 10, 25, 50, 75, 99)])
    if pix.n >= 3:
        print('   channel1 p10/50:', int(np.percentile(img[:, :, 1], 10)), int(np.percentile(img[:, :, 1], 50)))
    # try adaptive: dark = below (min+30)
    lo = g.min()
    dark = (g < lo + 40)
    print('   darkest value', lo, 'dark pixels', int(dark.sum()), 'of', g.size)
    ink = dark.sum(axis=0).astype(np.float32)
    dens = np.convolve(ink, np.ones(9) / 9, mode='same')
    h, w = g.shape
    a, b = int(0.38 * w), int(0.62 * w)
    x = a + int(np.argmin(dens[a:b]))
    print('   split fraction with adaptive threshold:', round(x / w, 3),
          'ink at split', int(dens[x]), 'median ink', int(np.median(dens[a:b])))
