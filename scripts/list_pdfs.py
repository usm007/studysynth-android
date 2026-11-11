import glob

pdf_list = glob.glob('Papers/*.pdf') + glob.glob('*.pdf')
for p in pdf_list:
    print(p)

