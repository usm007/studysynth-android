with open('pwa/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'setMode' in l or 'data-mode' in l or 'switchMode' in l or 'startLibraryMode' in l:
        print(f"{i+1}: {l.strip()[:100]}")

