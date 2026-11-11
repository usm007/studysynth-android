import os

file_size = os.path.getsize('UGC_NET_Education_Code09.apk')
print(f"File size on disk: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)")

with open('UGC_NET_Education_Code09.apk', 'rb') as f:
    # Read the central directory end record
    # Find End of Central Directory (EOCD) signature: 0x06054b50 (PK\x05\x06)
    f.seek(-1000, os.SEEK_END)
    tail = f.read()
    eocd_pos = tail.rfind(b'PK\x05\x06')
    print("EOCD found in tail at:", eocd_pos)
    if eocd_pos != -1:
        eocd_offset = file_size - 1000 + eocd_pos
        print(f"EOCD offset: {eocd_offset}")
        # Parse EOCD:
        # offset 12: size of central directory (4 bytes)
        # offset 16: offset of start of central directory (4 bytes)
        f.seek(eocd_offset + 12)
        import struct
        cd_size, cd_offset = struct.unpack('<II', f.read(8))
        print(f"Central Directory size: {cd_size} bytes")
        print(f"Central Directory start offset: {cd_offset} bytes")
        print(f"End of Central Directory end: {eocd_offset + 22} bytes")
        print(f"Trailing bytes after EOCD: {file_size - (eocd_offset + 22)} bytes")

        # Now let's check what is at cd_offset and earlier!
        # What is between 0 and cd_offset?
        print(f"Archive data span: 0 to {cd_offset + cd_size} ({ (cd_offset + cd_size) / 1024 / 1024:.2f} MB)")
        print(f"Difference: {file_size - (cd_offset + cd_size)} bytes")

