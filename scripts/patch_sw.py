with open(r'pwa\sw.js', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("'./engine/pdfParser.js',", "'./engine/pdfParser.js',\n  './engine/pdfViewer.js',")
code = code.replace("'./manifest.webmanifest',", "'./papers_manifest.json',\n  './manifest.webmanifest',")
code = code.replace("const CACHE_NAME = 'studysynth-v37';", "const CACHE_NAME = 'ugcnet-edu-v1';")

with open(r'pwa\sw.js', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated pwa/sw.js successfully!')

