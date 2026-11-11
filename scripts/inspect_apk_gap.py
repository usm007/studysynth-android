import zipfile

with zipfile.ZipFile('UGC_NET_Education_Code09.apk', 'r') as z:
    for info in z.infolist():
        if info.filename == 'assets/public/ctet/ugc_net_unit_6.json':
            u6_offset = info.header_offset
            u6_size = info.compress_size
        if info.filename == 'assets/public/sample_data.js':
            sample_offset = info.header_offset

print(f"ugc_net_unit_6.json header offset: {u6_offset}")
print(f"sample_data.js header offset: {sample_offset}")
print(f"Difference: {sample_offset - u6_offset} bytes ({(sample_offset - u6_offset)/1024/1024:.2f} MB)")

with open('UGC_NET_Education_Code09.apk', 'rb') as f:
    f.seek(u6_offset + 500) # skip header
    chunk = f.read(2000)
    print("Preview right after u6:", chunk[:200])
    
    # Let's search inside the 80MB gap for strings or magic headers like %PDF!
    f.seek(u6_offset)
    gap_data = f.read(sample_offset - u6_offset)
    pdf_pos = gap_data.find(b'%PDF')
    print("Found %PDF in gap?:", pdf_pos)
    if pdf_pos != -1:
        print(f"%PDF offset in gap: {pdf_pos}")
        print("PDF header:", gap_data[pdf_pos:pdf_pos+100])
        # Count %PDF occurrences
        pdf_count = gap_data.count(b'%PDF')
        print(f"Total %PDF occurrences in gap: {pdf_count}!")

