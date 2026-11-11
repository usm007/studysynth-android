s1 = "bod dm\ufffdJmo\ufffd\ufffdH$s H$m 'mZZm Wm {H$ {dH$mg :"
toks = s1.split()
print('tokens', len(toks))
print('non_ascii', sum(1 for t in toks if any(ord(c) > 127 for c in t)))
import re
DEV = re.compile(r'[\u0900-\u097F]')
print('dev match', bool(DEV.search(s1)))
