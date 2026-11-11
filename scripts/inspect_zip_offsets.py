import zipfile

with zipfile.ZipFile('UGC_NET_Education_Code09.apk', 'r') as z:
    infolist = z.infolist()
    # Sort by header offset
    infolist.sort(key=lambda x: x.header_offset)
    
    gaps = []
    for i in range(len(infolist) - 1):
        curr = infolist[i]
        nxt = infolist[i+1]
        # curr spans from curr.header_offset to ...
        # let's estimate span
        gap = nxt.header_offset - curr.header_offset
        if gap > curr.compress_size + 200:
            gaps.append((curr.filename, curr.compress_size, gap, nxt.filename))

    print(f"Total entries: {len(infolist)}")
    print(f"Large gaps between entries: {len(gaps)}")
    for g in gaps[:20]:
        print(f"  Entry: {g[0]} (comp: {g[1]/1024/1024:.2f} MB, step to next: {g[2]/1024/1024:.2f} MB) -> Next: {g[3]}")

