import sys

sys.path.insert(0, r'C:\Users\Admin\Desktop\NET Ed\scripts')
from extract_text_pdf import looks_indian_font_gibberish

s1 = "bod dm\ufffdJmo\ufffd\ufffdH$s H$m 'mZZm Wm {H$ {dH$mg :"
s2 = "Which of the following is an example of intrinsic motivation ?"
s3 = "H$m {dH$mg :"
print('s1', looks_indian_font_gibberish(s1))
print('s2', looks_indian_font_gibberish(s2))
print('s3', looks_indian_font_gibberish(s3))
