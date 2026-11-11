with open('pwa/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines[:120]):
    if 'test' in l.lower():
        print(f"{i+1}: {l.strip()}")

