import os

# Check size of android/app/src/main/assets
total = 0
for r, d, f in os.walk('android/app/src/main/assets'):
    for file in f:
        p = os.path.join(r, file)
        total += os.path.getsize(p)

print(f"android/app/src/main/assets total size on disk: {total / 1024 / 1024:.2f} MB")

# Check size of android/app/build/intermediates
build_total = 0
for r, d, f in os.walk('android/app/build'):
    for file in f:
        p = os.path.join(r, file)
        build_total += os.path.getsize(p)
print(f"android/app/build total size on disk: {build_total / 1024 / 1024:.2f} MB")

