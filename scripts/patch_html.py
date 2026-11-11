with open('pwa/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('id="dropZone" class="drop-zone"', '<div id="dropZone" class="drop-zone"')

with open('pwa/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("Fixed dropZone tag in pwa/index.html")
