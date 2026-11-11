with open('pwa/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('async function resolveModuleBody')
print(f"resolveModuleBody position: {idx}")
if idx != -1:
    print(text[idx:idx+1200])

