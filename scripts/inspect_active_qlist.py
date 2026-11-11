with open('pwa/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function activeQuestionList')
print(f"activeQuestionList position: {idx}")
if idx != -1:
    print(text[idx:idx+600])

