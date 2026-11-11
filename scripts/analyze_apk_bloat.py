import zipfile
from collections import defaultdict

with zipfile.ZipFile('UGC_NET_Education_Code09.apk', 'r') as z:
    by_ext = defaultdict(lambda: [0, 0, 0])
    by_folder = defaultdict(lambda: [0, 0, 0])
    
    for info in z.infolist():
        fn = info.filename
        ext = fn.split('.')[-1] if '.' in fn else 'no_ext'
        folder = fn.split('/')[0]
        
        by_ext[ext][0] += 1
        by_ext[ext][1] += info.file_size
        by_ext[ext][2] += info.compress_size
        
        by_folder[folder][0] += 1
        by_folder[folder][1] += info.file_size
        by_folder[folder][2] += info.compress_size

print("--- Size by Folder in APK ---")
for f, (cnt, uncomp, comp) in sorted(by_folder.items(), key=lambda x: -x[1][2]):
    print(f"{f:25s}: {cnt:4d} files | uncomp: {uncomp/1024/1024:6.2f} MB | comp: {comp/1024/1024:6.2f} MB")

print("\n--- Size by Extension in APK ---")
for ext, (cnt, uncomp, comp) in sorted(by_ext.items(), key=lambda x: -x[1][2]):
    print(f"{ext:15s}: {cnt:4d} files | uncomp: {uncomp/1024/1024:6.2f} MB | comp: {comp/1024/1024:6.2f} MB")

# Also check Android native libraries (lib/) or jni!
lib_files = [info for info in z.infolist() if info.filename.startswith('lib/')]
print(f"\nNative libs count: {len(lib_files)}")
for info in lib_files:
    print(f"  {info.file_size/1024/1024:5.2f} MB (comp: {info.compress_size/1024/1024:5.2f} MB): {info.filename}")

