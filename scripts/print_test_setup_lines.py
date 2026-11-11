with open('pwa/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'testSetup' in l:
        print(f"Around line {i+1}:")
        print(''.join(lines[i-2:i+35]))
        break

