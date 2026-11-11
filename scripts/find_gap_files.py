with open('UGC_NET_Education_Code09.apk', 'rb') as f:
    f.seek(5626369)
    gap = f.read(84404802)

pk_count = gap.count(b'PK\x03\x04')
print(f"Total PK\\x03\\x04 local headers in gap: {pk_count}!")

# Find all filenames in local headers in gap
idx = 0
found_files = []
while True:
    pos = gap.find(b'PK\x03\x04', idx)
    if pos == -1:
        break
    # Header format:
    # 26: filename length (2 bytes)
    # 28: extra length (2 bytes)
    # 30: filename
    import struct
    if pos + 30 <= len(gap):
        fn_len, extra_len = struct.unpack('<HH', gap[pos+26:pos+30])
        fn = gap[pos+30:pos+30+fn_len].decode('utf-8', errors='ignore')
        found_files.append((pos, fn))
    idx = pos + 4

print(f"Discovered {len(found_files)} files in gap:")
for p, fn in found_files[:25]:
    print(f"  at {p}: {fn}")

