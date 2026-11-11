import zipfile

with zipfile.ZipFile('UGC_NET_Education_Code09.apk', 'r') as z:
    total_uncompressed = 0
    total_compressed = 0
    
    entries = []
    for info in z.infolist():
        total_uncompressed += info.file_size
        total_compressed += info.compress_size
        entries.append((info.filename, info.file_size, info.compress_size, info.compress_type))

print(f"Total entries: {len(entries)}")
print(f"Total uncompressed sum: {total_uncompressed / 1024 / 1024:.2f} MB")
print(f"Total compressed sum:   {total_compressed / 1024 / 1024:.2f} MB")

# Check stored (uncompressed) entries (compress_type == 0)
stored = [e for e in entries if e[3] == 0]
deflated = [e for e in entries if e[3] != 0]

print(f"\nStored (uncompressed, compression=0) files: {len(stored)}")
stored_sum = sum(e[1] for e in stored)
print(f"Stored files total: {stored_sum / 1024 / 1024:.2f} MB")

stored.sort(key=lambda x: -x[1])
for s in stored[:20]:
    print(f"  {s[1]/1024/1024:6.2f} MB: {s[0]}")

