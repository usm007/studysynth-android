with open('pwa/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('testSetup')
print(f"testSetup position: {idx}")
if idx != -1:
    print(text[idx-50:idx+2000])

